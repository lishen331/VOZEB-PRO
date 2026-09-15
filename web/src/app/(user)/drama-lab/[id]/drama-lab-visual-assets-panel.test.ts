import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama lab visual assets", () => {
    it("routes affected-shot regeneration through the server-owned storyboard generation endpoint", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

        expect(source).toContain("/generate-image?episodeId=${encodeURIComponent(shot.episodeId)}");
        expect(source).not.toContain("dramaLabShotPrompt(project, shot)");
    });

    it("serializes project writes and applies generated references to the latest asset state", async () => {
        const projectSource = await readFile(new URL("./drama-workflow-lab-project-complete.tsx", import.meta.url), "utf8");
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

        expect(projectSource).toContain("const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));");
        expect(projectSource).toContain('typeof updatesOrUpdater === "function" ? updatesOrUpdater(current) : updatesOrUpdater');
        expect(source).toContain("const updateAsset");
    });
});

describe("extraction detail wiring", () => {
    it("exposes L-compatible layout and final prompt fields in the asset editor", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-lab-visual-assets-panel.tsx"), "utf8");
        expect(source).not.toContain("<span>鐢熸垚鐗堝紡</span>");
        expect(source).toContain("鏈€缁堢敓鍥炬彁绀鸿瘝");
        expect(source).toContain("normalizeDramaAssetGenerationLayout");
    });

    it("retains extracted visual fields in the persisted UI asset", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("...readDramaLabAssetVisualDetails(asset)");
        expect(source).toContain("buildDramaLabAssetImagePrompt(project, effectiveAsset, assetKind)");
        expect(source).toContain("...readDramaLabAssetVisualDetails(libraryAsset.metadata)");
    });

    it("offers a canvas entry for each asset without removing existing actions", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("onOpenCanvasHref");
        expect(source).toContain("鐢诲竷瀹氫綅");
        expect(source).toContain("PanelsTopLeft");
        expect(source).toContain("AI 鐢熷浘");
        expect(source).toContain("鍔犲叆绱犳潗搴?);
    });
});
describe("drama lab visual asset extraction actions", () => {
    it("offers one-click extraction before the type-specific action", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        const toolbar = source.slice(source.indexOf("tabBarExtraContent"), source.indexOf("items={(Object.keys(ASSET_META)"));

        expect(toolbar).toContain("涓€閿彁鍙?);
        expect(toolbar).toContain("鎻愬彇{definition.label}");
        expect(toolbar.indexOf("涓€閿彁鍙?)).toBeLessThan(toolbar.indexOf("鎻愬彇{definition.label}"));
    });

    it("keeps all three extraction types on the batch path and reports partial failures", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

        expect(source).toContain("const startAssetWorkflow = async () =>");
        expect(source).toContain('body: JSON.stringify({ episodeId: episode.id, mode: "assets"');
        expect(source).toContain("璧勪骇鎻愬彇浠诲姟宸插垱寤?);
        expect(source).toContain('setBusyKey("extract:all")');
    });
});

describe("L-compatible character AI editor actions", () => {
    it("matches L editor structure and keeps only the final prompt/anchor fields visible", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain('width="min(960px, calc(100vw - 32px))"');
        expect(source).toContain('maxHeight: "calc(100vh - 160px)"');
        expect(source).toContain('overflowY: "auto"');

        expect(source).not.toContain("<span>鍘熷鍥剧墖鎻愮ず璇?/span>");
        expect(source).not.toContain("<span>鐢熸垚鐗堝紡</span>");
        expect(source).not.toContain("profileLabel(key)");
    });

    it("uses contain previews and accepts imageUrl-only legacy assets", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("object-contain");
        const references = await readFile(resolve(process.cwd(), "src/lib/drama-asset-references.ts"), "utf8");
        expect(references).toContain("asset.imageUrl?.trim()");
    });

    it("supports multi-file reference upload and immediate L-style actions after upload", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("multiple");
        expect(source).toContain("Promise.all");
        expect(source).toContain("setEditor");
        expect(source).toContain("浠庝富鍥炬彁鍙栨弿杩?);
        expect(source).toContain("绉婚櫎鍙傝€冨浘");
    });

    it("renders reference extraction, prompt regeneration, anchor extraction, and stage generation actions", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("浠庝富鍥炬彁鍙栨弿杩?);
        expect(source).toContain("閲嶆柊鐢熸垚鎻愮ず璇?);
        expect(source).toContain("鎻愮偧瑙嗚閿氱偣");
        expect(source).toContain("AI 鐢熸垚閫犲瀷");
        expect(source).toContain("绉婚櫎鍙傝€冨浘");
    });
});

describe("L-style prop editor modal", () => {
    it("keeps the prop editor compact and limited to L-style fields", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain('title={asset.id ? "缂栬緫閬撳叿" : "鏂板閬撳叿"}');
        expect(source).toContain('if (editor.kind === "props")');

        const propBranch = source.slice(source.indexOf('if (editor.kind === \\"props\\")'), source.indexOf("return (", source.indexOf('if (editor.kind === \\"props\\")')));
        expect(propBranch).not.toContain("鐢熸垚鐗堝紡");
    });
});

describe("L-style prop reference placement", () => {
    it("uses one uploadable reference frame and keeps actions to its right", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        const propStart = source.indexOf('if (editor.kind === "props")');
        const propEnd = source.indexOf("return (", source.indexOf("    }", propStart) + 5);
        const propBranch = source.slice(propStart, propEnd);

        expect(propBranch).not.toContain("+ 涓婁紶");
        expect(propBranch).toContain("鐢熸垚鍥剧墖鐨勫弬鑰冨浘");
        expect(propBranch).toContain("references.map");
    });
});

describe("L-style prop reference actions", () => {
    it("keeps only extraction then remove beside the single frame", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        const prop = source.slice(source.indexOf('if (editor.kind === "props")'));
        expect(prop.indexOf("鎻愬彇鐗瑰緛鎻忚堪")).toBeLessThan(prop.indexOf("绉婚櫎"));
        expect(source).toContain("璁句负涓诲弬鑰冨浘");
        expect(source).toContain("鍙傝€冨浘鍊欓€?);
    });
});

describe("L-style prop prompt row", () => {
    it("keeps the prompt label, AI note, and regenerate action on one row", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        const propStart = source.indexOf('if (editor.kind === "props")');
        const promptStart = source.indexOf('<span className="flex min-w-0 items-center gap-2 whitespace-nowrap">', propStart);
        const promptEnd = source.indexOf("<Input.TextArea rows={5}", promptStart);
        const row = source.slice(promptStart, promptEnd);
        expect(row).toContain("鍥剧敓鎻愮ず璇?);
        expect(row).toContain("AI 娑﹁壊鍚庣殑鍥剧墖鎻愮ず璇?);
        expect(row).toContain("閲嶆柊鐢熸垚鎻愮ず璇?);
        expect(row).toContain("whitespace-nowrap");
    });
});

describe("asset card and editor reference interactions", () => {
    it("opens the editor from the card body and deletes an asset only through confirmation", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

        expect(source).toContain("const deleteAsset");
        expect(source).toContain('title: "鍒犻櫎纭"');
        expect(source).toContain("纭畾鍒犻櫎銆?{assetName(asset)}銆嶏紵");
        expect(source).toContain("current.filter((item) => item.id !== asset.id)");
        expect(source).toContain("aria-label={`鍒犻櫎${meta.label}`}");
        expect(source).toContain("onClick={() => setEditor({ kind: assetKind, asset: cloneAsset(asset) })}");
        expect(source).not.toContain('aria-label="缂栬緫璁惧畾"');
    });

    it("prevents nested asset actions from opening the card editor", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        const card = source.slice(source.indexOf("data-drama-lab-asset-card"), source.indexOf("</article>", source.indexOf("data-drama-lab-asset-card")));

        expect(card).toContain("event.stopPropagation()");
        expect(card).toContain("void generateAssetReference(asset, assetKind)");
        expect(card).toContain("void saveToLibrary(asset, assetKind, meta.label, messageApi)");
        expect(card).toContain("void setPrimary(asset, reference)");
    });

    it("keeps the four asset actions on one compact row", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain('aria-label="璧勪骇鎿嶄綔"');
        expect(source).toContain("flex-nowrap");
        expect(source).toContain("鍏ョ礌鏉愬簱");
        expect(source).toContain("鐢诲竷瀹氫綅");
    });

    it("renders the card thumbnail inside a fixed frame without forcing the image to fill it", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        const cardFrame = source.slice(source.indexOf("data-drama-lab-asset-card"), source.indexOf('<div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">'));
        expect(cardFrame).toContain('className="relative flex h-44 shrink-0 items-center justify-center overflow-hidden bg-muted/50"');
        expect(cardFrame).toContain('className="block max-h-full max-w-full object-contain"');
        expect(cardFrame).toContain("setPreviewImage");
    });

    it("labels reference upload frames on the left and disables nested image preview", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

        expect(source).not.toContain("preview={{ src: primary.url }}");
        expect(source).toContain("鐢熸垚鍥涘鏍煎満鏅紙榛樿鍗曞浘锛?);
        expect(source).toContain("鐢熸垚鍥涜鍥鹃亾鍏凤紙榛樿鍗曞浘锛岀函鑹叉棤缂濊儗鏅級");
        expect(source).toContain('action: "prompt"');
        expect(source).toContain("storedPrompt");
        expect(source).toContain("referenceRoles");
        expect(source).toContain("promoteGeneratedReference(effectiveAsset, references)");
    });

    it("keeps history beside the primary and exposes hover-only primary actions", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("data-asset-primary-history-layout");
        expect(source).toContain("data-asset-primary-actions");
        expect(source).toContain("涓婁紶鍥剧墖 / 鏇挎崲涓诲浘");
        expect(source).toContain("鍔犲叆鍙傝€?);
        expect(source).toContain("浠庝富鍥炬彁鍙栨弿杩?);
        expect(source).toContain("group-hover:opacity-100");
        expect(source).toContain("data-asset-generation-action");
    });
});

describe("character prompt mention highlighting", () => {
    it("renders a single visible highlight layer and supports keyboard selection", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("highlightResourceMentions");
        expect(source).toContain("promptMirrorRef");
        expect(source).toContain("!text-transparent caret-foreground");
        expect(source).toContain('event.key === "ArrowDown"');
        expect(source).toContain('event.key === "ArrowUp"');
        expect(source).toContain('event.key === "Enter"');
        expect(source).toContain('event.key === "Escape"');
        expect(source).toContain("mentionIndex");
    });
});

describe("asset reference thumbnail framing", () => {
    it("keeps scene, prop, and character history/reference images centered without cropping", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

        expect(source).toContain('className="!block !h-24 !w-full !object-contain"');
        expect(source).toMatch(/className="!block !size-(?:full|16) !object-contain"/);
        expect(source).toContain('className="block size-8 rounded object-contain"');
        expect(source).toContain('className="!block !size-full !object-contain"');
        expect(source).not.toContain('className="!h-24 !object-cover"');
        expect(source).not.toContain('className="!size-16 !object-cover"');
        expect(source).not.toContain('className="!size-full !object-cover"');
    });
});
