"use client";

import "./director-desk.css";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Spin } from "@/components/gamma-ui/gamma-ant";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { createLibraryAsset, uploadLibraryImageAsset } from "@/services/api/library-assets";
import { uploadImage } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";

import { DirectorDeskShell } from "./app/layout/DirectorDeskShell";
import { DirectorCanvas } from "./editor/canvas/DirectorCanvas";
import { ViewportSensitivitySettings } from "./editor/canvas/ViewportSensitivitySettings";
import { PerformanceSettings } from "./editor/performance/PerformanceSettings";
import { setDirectorDeskCaptureSink } from "./editor/io/hostBridge";
import { useDirectorStore } from "./editor/store/directorStore";
import {
    createDirectorDeskRecord,
    deleteDirectorDeskRecord,
    ensureDirectorDeskRecordForId,
    ensureDirectorDeskRecords,
    getInitialDirectorDeskId,
    touchDirectorDeskRecord,
    writeActiveDirectorDeskId,
    writeDirectorDeskRecords,
    type DirectorDeskRecord,
} from "./editor/workspaces/directorDeskRegistry";

function isEditableShortcutTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

async function dataUrlToFile(dataUrl: string, fileName: string) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], fileName, { type: blob.type || "image/png" });
}

/** base64 截图保存到平台素材库，替代上游的 postMessage 回传。 */
export default function DirectorDeskEditor() {
    const router = useRouter();
    const { message } = App.useApp();
    const theme = useThemeStore((state) => state.theme);
    const viewMode = useDirectorStore((state) => state.viewMode);
    const setViewMode = useDirectorStore((state) => state.setViewMode);
    const motionStudioOpen = useDirectorStore((state) => state.motionStudioOpen);
    const setMotionStudioOpen = useDirectorStore((state) => state.setMotionStudioOpen);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [saving, setSaving] = useState(false);

    const [desks, setDesks] = useState<DirectorDeskRecord[]>([]);
    const [activeDeskId, setActiveDeskId] = useState("");
    const [screen, setScreen] = useState<"home" | "editor">("home");

    useEffect(() => {
        const records = ensureDirectorDeskRecords();
        const initialId = getInitialDirectorDeskId(records) ?? records[0]?.id ?? "";
        setDesks(records);
        setActiveDeskId(initialId);
    }, []);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        root.dataset.theme = theme;
        root.classList.toggle("dark", theme === "dark");
    }, [theme]);

    // 每个导演台独立保存场景，切换时重新打开对应作用域。
    const openDesk = useCallback((id: string) => {
        if (!id) return;
        setDesks((current) => {
            const ensured = ensureDirectorDeskRecordForId(current, id);
            const next = touchDirectorDeskRecord(ensured.records, id);
            writeActiveDirectorDeskId(id);
            return next;
        });
        setActiveDeskId(id);
        setScreen("editor");
        useDirectorStore.getState().openScopedScene(id);
    }, []);

    const createDesk = useCallback(() => {
        setDesks((current) => {
            const record = createDirectorDeskRecord(current);
            const next = [...current, record];
            writeDirectorDeskRecords(next);
            setActiveDeskId(record.id);
            setScreen("editor");
            useDirectorStore.getState().openScopedScene(record.id);
            return next;
        });
    }, []);

    const removeDesk = useCallback(
        (desk: DirectorDeskRecord) => {
            if (!window.confirm(`删除「${desk.name}」？这个导演台里的本地场景也会一起删除。`)) return;
            setDesks((current) => {
                const result = deleteDirectorDeskRecord(current, desk.id);
                writeDirectorDeskRecords(result.records);
                setActiveDeskId(result.activeId ?? result.records[0]?.id ?? "");
                return result.records;
            });
            setScreen("home");
        },
        [],
    );

    const saveCaptures = useCallback(
        async (captures: Array<{ dataUrl: string; fileName: string }>) => {
            setSaving(true);
            let saved = 0;
            try {
                for (const capture of captures) {
                    const file = await dataUrlToFile(capture.dataUrl, capture.fileName);
                    const image = await uploadImage(file);
                    await createLibraryAsset({
                        kind: "image",
                        title: capture.fileName.replace(/\.png$/i, "") || "导演台截图",
                        coverUrl: image.url,
                        tags: [],
                        source: "practice-director-desk",
                        data: {
                            dataUrl: image.url,
                            storageKey: image.storageKey,
                            serverUrl: image.url,
                            width: image.width,
                            height: image.height,
                            bytes: image.bytes,
                            mimeType: image.mimeType,
                        },
                    });
                    saved += 1;
                }
                message.success(`已保存 ${saved} 张截图到素材库`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "截图保存失败");
            } finally {
                setSaving(false);
            }
        },
        [message],
    );

    useEffect(() => {
        setDirectorDeskCaptureSink(saveCaptures);
        return () => setDirectorDeskCaptureSink(null);
    }, [saveCaptures]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;
            if (!event.metaKey && !event.ctrlKey) return;
            if (event.repeat) return;

            const key = event.key.toLowerCase();
            if (key === "c") {
                event.preventDefault();
                useDirectorStore.getState().copySelectedObjects();
                return;
            }
            if (key === "v") {
                event.preventDefault();
                useDirectorStore.getState().pasteClipboardObjects();
                return;
            }
            if (key === "z" && !event.shiftKey) {
                event.preventDefault();
                useDirectorStore.getState().undo();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    if (screen === "home") {
        return (
            <div ref={rootRef} className="director-desk-root director-home-shell">
                <main>
                    <section className="director-home-hero">
                        <div>
                            <p className="director-home-kicker">3D 导演台</p>
                            <h1>选择一个导演台开始摆场景</h1>
                            <p>每个导演台独立保存。创建场景、摆人物道具、记录运镜轨迹，最后导出参考视频或保存截图。</p>
                        </div>
                        <div className="director-home-hero-actions">
                            <button className="director-home-primary-button" type="button" onClick={createDesk}>
                                新建导演台
                            </button>
                            <button
                                className="director-home-scroll-hint"
                                type="button"
                                onClick={() => router.push("/practice")}
                            >
                                <ArrowLeft size={14} />
                                返回练习
                            </button>
                        </div>
                    </section>

                    {desks.length ? (
                        <section className="director-home-grid" aria-label="导演台列表">
                            {desks.map((desk, index) => (
                                <article
                                    key={desk.id}
                                    className={`director-home-card ${desk.id === activeDeskId ? "is-active" : ""}`}
                                >
                                    <button className="director-home-card-main" type="button" onClick={() => openDesk(desk.id)}>
                                        <span className="director-home-card-content">
                                            <span className="director-home-card-title">{desk.name}</span>
                                        </span>
                                        <span className="director-home-card-index">{String(index + 1).padStart(2, "0")}</span>
                                    </button>
                                    <button
                                        className="director-home-card-delete"
                                        type="button"
                                        aria-label={`删除${desk.name}`}
                                        onClick={() => removeDesk(desk)}
                                    >
                                        删除
                                    </button>
                                </article>
                            ))}
                        </section>
                    ) : (
                        <section className="director-home-empty" aria-label="空导演台列表">
                            <h2>还没有导演台</h2>
                            <p>点击“新建导演台”创建一个干净的 3D 场景。</p>
                        </section>
                    )}
                </main>
            </div>
        );
    }

    return (
        <div ref={rootRef} className="director-desk-root app-shell">
            <header className="top-bar">
                <div className="top-bar-left">
                    <button className="top-bar-title top-bar-home-button" type="button" onClick={() => setScreen("home")}>
                        3D 导演台
                    </button>
                    <div className="director-desk-switcher" aria-label="导演台选择器">
                        <select
                            className="director-desk-select"
                            aria-label="选择导演台"
                            value={activeDeskId}
                            onChange={(event) => openDesk(event.currentTarget.value)}
                        >
                            {desks.map((desk) => (
                                <option key={desk.id} value={desk.id}>
                                    {desk.name}
                                </option>
                            ))}
                        </select>
                        <button className="director-desk-create-button" type="button" onClick={createDesk}>
                            新建
                        </button>
                    </div>
                </div>
                <div className="top-bar-center">
                    <div className="mode-toggle ui-segmented" role="group" aria-label="视角切换">
                        <button
                            className={`mode-toggle-button ui-segmented-item ${viewMode === "director" ? "ui-segmented-item-active" : ""}`}
                            aria-pressed={viewMode === "director"}
                            type="button"
                            onClick={() => setViewMode("director")}
                        >
                            导演视角
                        </button>
                        <button
                            className={`mode-toggle-button ui-segmented-item ${viewMode === "camera" ? "ui-segmented-item-active" : ""}`}
                            aria-label="第一视角"
                            aria-pressed={viewMode === "camera"}
                            title="查看摄影机最终画面"
                            type="button"
                            onClick={() => setViewMode("camera")}
                        >
                            第一视角
                        </button>
                    </div>
                    <button
                        className={`top-bar-motion-button${motionStudioOpen ? " is-active" : ""}`}
                        type="button"
                        aria-label={motionStudioOpen ? "关闭运镜工作台" : "打开运镜工作台"}
                        aria-pressed={motionStudioOpen}
                        onClick={() => {
                            setViewMode("director");
                            setMotionStudioOpen(!motionStudioOpen);
                        }}
                    >
                        运镜
                    </button>
                    <ViewportSensitivitySettings />
                    <PerformanceSettings />
                </div>
                <div className="top-bar-actions">
                    {saving ? <Spin size="small" /> : null}
                    <button
                        className="top-bar-action-button"
                        type="button"
                        aria-label="返回练习"
                        title="返回练习"
                        onClick={() => router.push("/practice")}
                    >
                        <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.8} />
                    </button>
                </div>
            </header>
            <DirectorDeskShell>
                <DirectorCanvas />
            </DirectorDeskShell>
        </div>
    );
}
