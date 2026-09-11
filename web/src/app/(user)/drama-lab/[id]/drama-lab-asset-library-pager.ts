import type { Asset } from "@/lib/library-asset-contract";
import type { listLibraryAssetPage } from "@/services/api/library-assets";

export type VisualAssetKind = "characters" | "scenes" | "props";
type State = { assets: Asset[]; total: number; loading: boolean; error: string; hasMore: boolean };
const emptyState = (): State => ({ assets: [], total: 0, loading: false, error: "", hasMore: true });

/** Per-open picker state: queries and in-flight pages never escape their current kind/search. */
export function createAssetLibraryPager(load: typeof listLibraryAssetPage) {
    let state = emptyState();
    let kind: VisualAssetKind = "characters";
    let keyword = "";
    let page = 1;
    let generation = 0;
    let controller: AbortController | undefined;
    const listeners = new Set<() => void>();
    const publish = (patch: Partial<State>) => {
        state = { ...state, ...patch };
        listeners.forEach((listener) => listener());
    };
    const loadMore = async () => {
        if (state.loading || !state.hasMore) return;
        const requestGeneration = generation;
        controller = new AbortController();
        publish({ loading: true, error: "" });
        try {
            const result = await load({ page, pageSize: 100, kind: "image", keyword, dramaAssetType: kind === "characters" ? "character" : kind === "scenes" ? "scene" : "prop" }, controller.signal);
            if (requestGeneration !== generation) return;
            const assets = [...new Map([...state.assets, ...result.assets].map((asset) => [asset.id, asset])).values()];
            page = result.page + 1;
            publish({ assets, total: result.total, hasMore: result.assets.length > 0 && assets.length < result.total, loading: false });
        } catch (error) {
            if (requestGeneration !== generation) return;
            publish({ loading: false, error: error instanceof Error ? error.message : "素材库加载失败" });
        }
    };
    return {
        getSnapshot: () => state,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        reset(nextKind: VisualAssetKind, nextKeyword: string) {
            generation += 1;
            controller?.abort();
            kind = nextKind;
            keyword = nextKeyword.trim();
            page = 1;
            publish(emptyState());
            return loadMore();
        },
        loadMore,
        dispose() {
            generation += 1;
            controller?.abort();
        },
    };
}
