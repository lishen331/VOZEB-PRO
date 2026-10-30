"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Button, Pagination } from "@/components/gamma-ui/gamma-ant";
import { Download, FileUp, Plus, Trash2, Workflow } from "lucide-react";

import { CompactEmptyState } from "@/components/compact-empty-state";
import { readZip } from "@/lib/zip";
import { APP_EXPORT_ID } from "@/lib/storage-keys";
import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "./components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "./components/canvas-project-card";
import { ipReferenceFromQuery } from "@/components/ip-library/ip-reference-picker";
import type { CanvasExportFile } from "./export-types";
import { useCanvasStore } from "./stores/use-canvas-store";
import { useCanvasUiStore } from "./stores/use-canvas-ui-store";
import { resolveSiteTitle } from "@/lib/site-brand";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { useUserStore } from "@/stores/use-user-store";
import { exportCanvasProjects } from "./utils/canvas-export";

export default function CanvasPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);
    const autoOpenRef = useRef(false);
    const [creating, setCreating] = useState(false);
    const [exporting, setExporting] = useState(false);
    const siteTitle = usePublicSessionStore((state) => resolveSiteTitle(state.payload?.settings?.site?.title));
    const userId = useUserStore((state) => state.user?.id || "");
    const hydrated = useCanvasStore((state) => state.hydrated);
    const hydratedUserId = useCanvasStore((state) => state.hydratedUserId);
    const syncError = useCanvasStore((state) => state.syncError);
    const hydrate = useCanvasStore((state) => state.hydrate);
    const projects = useCanvasStore((state) => state.summaries);
    const total = useCanvasStore((state) => state.summaryTotal);
    const page = useCanvasStore((state) => state.summaryPage);
    const pageSize = useCanvasStore((state) => state.summaryPageSize);
    const loadProject = useCanvasStore((state) => state.loadProject);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const ready = Boolean(userId && hydrated && hydratedUserId === userId);

    const mode = searchParams.get("mode");
    const ipId = searchParams.get("ipId")?.trim() || "";
    const subIpId = searchParams.get("subIpId")?.trim() || "";
    const ipReferenceKey = ipId && subIpId ? `${ipId}:${subIpId}` : "";
    const agentMode = mode === "new" || mode === "recent" || mode === "choose";
    const agentQuery = agentMode ? `?${searchParams.toString()}` : "";
    const enterProject = useCallback(
        (id: string) => {
            router.push(`/canvas/${id}${agentQuery}`);
        },
        [agentQuery, router],
    );
    const createAndEnter = async () => {
        if (creating) return;
        setCreating(true);
        try {
            enterProject(await createProject(`${siteTitle} 画布 ${total + 1}`));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布创建失败");
        } finally {
            setCreating(false);
        }
    };
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            if (data.app !== APP_EXPORT_ID) throw new Error("不是当前应用的画布包");
            await Promise.all(
                data.projects.map(async (item) => {
                    const uploaded = new Map<string, { storageKey: string; url: string }>();
                    await Promise.all(
                        item.files.map(async (file) => {
                            const blob = zip.get(file.path);
                            if (!blob) return;
                            const typedBlob = blob.type ? blob : blob.slice(0, blob.size, file.mimeType);
                            const media = file.mimeType.startsWith("image/") ? await uploadImage(typedBlob) : await uploadMediaFile(typedBlob, file.mimeType.startsWith("audio/") ? "audio" : "video");
                            uploaded.set(file.storageKey, media);
                        }),
                    );
                    await importProject(remapImportedProjectMedia(item.project, uploaded));
                }),
            );
            message.success(`已导入 ${data.projects.length} 个画布`);
        } catch {
            message.error("导入失败，请选择有效的画布压缩包");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };
    const exportSelectedProjects = async () => {
        if (!selectedIds.length || exporting) return;
        setExporting(true);
        try {
            const selected = await Promise.all(selectedIds.map((id) => loadProject(id)));
            await exportCanvasProjects(selected);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布导出失败");
        } finally {
            setExporting(false);
        }
    };

    useEffect(() => {
        void hydrate();
    }, [hydrate, userId]);

    useEffect(() => {
        if (!ready || autoOpenRef.current || (mode !== "new" && mode !== "recent" && !ipReferenceKey)) return;
        autoOpenRef.current = true;
        void (async () => {
            try {
                const defaultName = `${siteTitle} 画布 ${total + 1}`;
                const reference = ipId && subIpId ? ipReferenceFromQuery(new URLSearchParams({ ipId, subIpId })) : undefined;
                const id = reference ? await createProject(defaultName, [reference], `ip-library-${reference.id}-${reference.subIpId}`) : mode === "new" ? await createProject(defaultName) : projects[0]?.id || (await createProject(defaultName));
                enterProject(id);
            } catch (error) {
                autoOpenRef.current = false;
                message.error(error instanceof Error ? error.message : "画布打开失败");
            }
        })();
    }, [createProject, enterProject, ipId, ipReferenceKey, message, mode, projects, ready, siteTitle, subIpId, total]);

    if (ready && (mode === "new" || mode === "recent" || ipReferenceKey)) return <main className="flex h-full items-center justify-center bg-[var(--gm-bg)] text-sm text-[var(--gm-text-3)]">正在打开画布...</main>;

    return (
        <main className="h-full overflow-auto bg-[var(--gm-bg)] text-[var(--gm-text)]">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-2 py-2 sm:gap-6 sm:px-6 sm:py-8">
                <header className="flex flex-wrap items-end justify-between gap-2.5 border-b border-[var(--gm-border)] pb-3 sm:gap-4 sm:pb-5">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm text-[var(--gm-text-3)]">
                            <Workflow className="size-4" />
                            画布库
                        </div>
                        <h1 className="mt-1.5 text-xl font-semibold sm:mt-2 sm:text-2xl">我的画布</h1>
                        {ready ? (
                            <p className="mt-1.5 text-xs leading-5 text-[var(--gm-text-3)] sm:mt-2 sm:text-sm">
                                共 {total} 个画布{selectedIds.length ? ` · 已选 ${selectedIds.length} 个` : ""}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {selectedIds.length ? (
                            <>
                                <Button disabled={!ready} loading={exporting} icon={<Download className="size-4" />} onClick={() => void exportSelectedProjects()}>
                                    导出选中
                                </Button>
                                <Button danger disabled={!ready} icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds(selectedIds)}>
                                    删除选中
                                </Button>
                            </>
                        ) : null}
                        {projects.length ? (
                            <Button danger disabled={!ready} icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                                删除当前页
                            </Button>
                        ) : null}
                        <Button disabled={!ready} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                            导入画布
                        </Button>
                        <Button disabled={!ready} loading={creating} type="primary" icon={<Plus className="size-4" />} onClick={() => void createAndEnter()}>
                            新建画布
                        </Button>
                    </div>
                </header>

                {!ready ? (
                    <section className="flex min-h-24 flex-col items-center justify-center gap-3 px-4 text-center text-sm sm:min-h-48">
                        <span className={syncError ? "text-[var(--gm-danger)]" : "text-[var(--gm-text-3)]"}>{syncError || "正在加载画布..."}</span>
                        {syncError ? (
                            <Button size="small" onClick={() => void hydrate(true)}>
                                重新加载
                            </Button>
                        ) : null}
                    </section>
                ) : projects.length ? (
                    <>
                        <div className="grid gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
                            {projects.map((project) => (
                                <CanvasProjectCard key={project.id} project={project} />
                            ))}
                        </div>
                        {total > pageSize ? (
                            <div className="flex justify-center py-2 sm:py-0">
                                <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger={false} onChange={(nextPage) => void hydrate(true, nextPage)} />
                            </div>
                        ) : null}
                    </>
                ) : (
                    <CompactEmptyState
                        title="还没有画布"
                        description="新建一个画布后，就可以独立保存节点、连线和画布外观。"
                        icon={<Workflow className="size-4" />}
                        className="min-h-24 sm:min-h-40"
                        action={
                            <Button type="primary" loading={creating} icon={<Plus className="size-4" />} onClick={() => void createAndEnter()}>
                                新建画布
                            </Button>
                        }
                    />
                )}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
        </main>
    );
}

function remapImportedProjectMedia(project: CanvasExportFile["projects"][number]["project"], uploaded: Map<string, { storageKey: string; url: string }>) {
    const visit = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(visit);
        if (!value || typeof value !== "object") return value;
        const source = value as Record<string, unknown>;
        const next = Object.fromEntries(Object.entries(source).map(([key, item]) => [key, visit(item)]));
        const media = typeof source.storageKey === "string" ? uploaded.get(source.storageKey) : undefined;
        if (!media) return next;
        next.storageKey = media.storageKey;
        next.serverUrl = media.url;
        delete next.remoteUrl;
        if ("content" in source) next.content = media.url;
        if ("dataUrl" in source) next.dataUrl = media.url;
        if ("url" in source) next.url = media.url;
        return next;
    };
    return visit(project) as typeof project;
}
