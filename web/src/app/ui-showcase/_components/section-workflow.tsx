"use client";

import { Drawer, Modal } from "antd";
import saveAs from "file-saver";
import { Download, History, Share2, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { VzParams, VzStatus, VzUploadItem } from "@/components/vozeb-ds";
import { VzAlert, VzButton, VzGenerateButton, VzModelPicker, VzParamPicker, VzPromptEditor, VzResultCard, VzTag } from "@/components/vozeb-ds";
import { VzUploadZone } from "@/components/vozeb-ds/upload-zone";

import { createDemoGeneration, type DemoGenerationState } from "./demo-generation";
import { IMG, LONG_PROMPT, MODELS, SUGGESTIONS, UPLOADS } from "./mock-data";
import { useShowcase } from "./showcase-context";

type LocalResult = { id: number; prompt: string; model: string; params: VzParams; references: string[] };

export function SectionWorkflow() {
    const { getContainer, toast } = useShowcase();
    const [model, setModel] = useState("seedream");
    const [prompt, setPrompt] = useState(LONG_PROMPT);
    const [uploads, setUploads] = useState<VzUploadItem[]>(UPLOADS);
    const [params, setParams] = useState<VzParams>({ ratio: "16:9", quality: "高清", count: 2, strength: 60, hd: true });
    const [run, setRun] = useState<DemoGenerationState>({ status: "idle", progress: 0 });
    const [failNext, setFailNext] = useState(false);
    const [history, setHistory] = useState<LocalResult[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const controller = useRef<ReturnType<typeof createDemoGeneration> | null>(null);
    const urls = useRef(new Set<string>());
    const busy = run.status === "running";
    const emptyPrompt = !prompt.trim();

    useEffect(
        () => () => {
            controller.current?.dispose();
            urls.current.forEach((url) => URL.revokeObjectURL(url));
            urls.current.clear();
        },
        [],
    );

    const start = (fail = failNext) => {
        if (busy || emptyPrompt) return;
        setFailNext(false);
        controller.current?.dispose();
        const submitted: LocalResult = { id: Date.now(), prompt, model, params: { ...params }, references: uploads.filter((item) => item.status === "done").map((item) => item.name) };
        controller.current = createDemoGeneration((next) => {
            setRun(next);
            if (next.status === "success") {
                setHistory((items) => [submitted, ...items]);
                toast.success("本地演示完成 · 未调用模型，未消耗积分");
            } else if (next.status === "error") {
                toast.error("模拟失败 · 可重试，不涉及真实任务或扣费");
            }
        });
        controller.current.start(fail);
    };

    const addFiles = (files: File[]) => {
        const images = files.filter((file) => file.type.startsWith("image/"));
        if (images.length !== files.length) toast.warning("图片工作台只接收图片；文件不会上传服务器");
        const selected = images.slice(0, Math.max(0, 6 - uploads.length));
        if (images.length > selected.length) toast.warning("本样板最多展示 6 个参考素材");
        const added = selected.map((file) => {
            const src = URL.createObjectURL(file);
            urls.current.add(src);
            return { id: src, src, name: file.name, status: "done" as const };
        });
        setUploads((list) => [...list, ...added]);
        if (added.length) toast.success(`已添加 ${added.length} 张本地参考图`);
    };
    const removeFile = (id: string) => {
        const item = uploads.find((upload) => upload.id === id);
        if (item && urls.current.delete(item.src)) URL.revokeObjectURL(item.src);
        setUploads((list) => list.filter((upload) => upload.id !== id));
    };
    const exportLocal = () => {
        saveAs(new Blob([JSON.stringify({ demo: true, notice: "本地视觉样板，未发起真实生成", prompt, model, params, references: uploads.map((item) => item.name), history }, null, 2)], { type: "application/json;charset=utf-8" }), "vozeb-ui-demo.json");
        toast.success("已导出本地演示配置（不包含图片文件）");
    };
    const resultStatus: VzStatus = busy ? (run.progress === 0 ? "queued" : "running") : run.status === "error" ? "failed" : "success";

    return (
        <section id="vz-sec-workflow" className="vz-workflow">
            <div className="vz-page-head">
                <div className="vz-page-head__text">
                    <span className="vz-eyebrow">工作台 · 图片创作</span>
                    <h1 className="vz-h-display">把想法变成画面</h1>
                    <p className="vz-body">一个安静、专注的创作空间。以下均为本地交互演示，不调用真实模型、不上传素材、不扣积分。</p>
                </div>
                <div className="vz-page-head__actions">
                    <VzButton variant="ghost" icon={History} onClick={() => setHistoryOpen(true)}>
                        历史记录
                    </VzButton>
                    <VzButton variant="secondary" icon={Share2} onClick={() => setShareOpen(true)}>
                        分享
                    </VzButton>
                    <VzButton variant="primary" icon={Download} onClick={exportLocal}>
                        导出配置
                    </VzButton>
                </div>
            </div>
            <div className="vz-split">
                <div className="vz-panel vz-stack" style={{ gap: 20 }}>
                    <div className="vz-stack" style={{ gap: 8 }}>
                        <span className="vz-h3">模型</span>
                        <VzModelPicker models={MODELS} value={model} onChange={setModel} disabled={busy} getContainer={getContainer} />
                    </div>
                    <div className="vz-stack" style={{ gap: 8 }}>
                        <span className="vz-h3">参考素材</span>
                        <VzUploadZone items={uploads} onRemove={removeFile} onAdd={addFiles} accept="image/*" disabled={busy} getContainer={getContainer} />
                    </div>
                    <VzPromptEditor value={prompt} onChange={setPrompt} suggestions={SUGGESTIONS} disabled={busy} status={emptyPrompt ? "error" : undefined} hint={emptyPrompt ? "请先输入提示词再开始演示" : undefined} />
                    <hr className="vz-divider" />
                    <VzParamPicker value={params} onChange={setParams} disabled={busy} />
                    <div className="vz-generation-actions">
                        <label className="vz-row vz-caption" style={{ gap: 8, cursor: busy ? "not-allowed" : "pointer" }}>
                            <input type="checkbox" checked={failNext} disabled={busy} onChange={(event) => setFailNext(event.target.checked)} />
                            模拟下一次失败
                        </label>
                        <div className="vz-row">
                            {busy ? (
                                <VzButton
                                    variant="ghost"
                                    size="sm"
                                    icon={Square}
                                    onClick={() => {
                                        controller.current?.cancel();
                                        toast.info("已取消本地演示");
                                    }}
                                >
                                    取消
                                </VzButton>
                            ) : null}
                            <VzGenerateButton status={run.status} progress={run.progress} disabled={emptyPrompt} onClick={() => start()} />
                        </div>
                    </div>
                    <span className="vz-caption" role="status">
                        {busy ? `本地演示中 ${run.progress}%` : run.status === "success" ? "演示完成 · 结果使用内置样图，可立即再次体验" : run.status === "error" ? "模拟失败 · 点击重试可重新体验" : "准备就绪 · 所有参数仅保留在当前页面"}
                    </span>
                </div>
                <div className="vz-panel vz-stack" style={{ gap: 16, alignContent: "start" }}>
                    <div className="vz-row" style={{ justifyContent: "space-between" }}>
                        <span className="vz-h3">结果预览</span>
                        <VzTag className="vz-num">
                            {params.ratio} · {params.quality} · ×{params.count}
                        </VzTag>
                    </div>
                    <VzResultCard
                        status={resultStatus}
                        src={IMG.hero}
                        prompt={prompt || LONG_PROMPT}
                        model={{ name: MODELS.find((item) => item.id === model)?.name ?? "", vendor: MODELS.find((item) => item.id === model)?.vendor ?? "" }}
                        progress={run.progress}
                        error="模拟服务繁忙 · 无真实请求、无扣费"
                        onRetry={() => {
                            setFailNext(false);
                            start(false);
                        }}
                        getContainer={getContainer}
                    />
                    <VzAlert tone="info">结果为内置视觉样图。上传参考、填写提示词和参数均可交互，但不会提交上游。</VzAlert>
                    <div className="vz-grid" style={{ "--min": "180px" } as React.CSSProperties}>
                        <VzResultCard status="running" prompt="生成状态样例 · 动效展示" model={{ name: "Studio Image", vendor: "Mock" }} progress={46} />
                        <VzResultCard status="failed" prompt="失败状态样例" model={{ name: "Studio Image", vendor: "Mock" }} error="模拟错误 · 未执行任何真实请求" />
                    </div>
                </div>
            </div>
            <Drawer title="本地演示历史" open={historyOpen} onClose={() => setHistoryOpen(false)} getContainer={getContainer} size={420}>
                <div className="vz-stack" style={{ gap: 16 }}>
                    <VzAlert tone="info">只记录本页成功的模拟操作，刷新后清空，不写入数据库。</VzAlert>
                    {history.length ? (
                        history.map((entry) => (
                            <article className="vz-card" key={entry.id}>
                                <p className="vz-body">{entry.prompt}</p>
                                <span className="vz-caption">
                                    {entry.model} · {entry.params.ratio} · {entry.params.quality}
                                </span>
                            </article>
                        ))
                    ) : (
                        <p className="vz-body">还没有演示记录。完成一次模拟生成后会显示在这里。</p>
                    )}
                </div>
            </Drawer>
            <Modal
                title="分享视觉样板"
                open={shareOpen}
                onCancel={() => setShareOpen(false)}
                getContainer={getContainer}
                centered
                footer={
                    <VzButton
                        variant="primary"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(`${window.location.origin}/ui-showcase`);
                                toast.success("样板地址已复制（不包含本地素材或参数）");
                                setShareOpen(false);
                            } catch {
                                toast.info("浏览器未允许复制，请手动复制地址栏中的样板地址");
                            }
                        }}
                    >
                        复制样板地址
                    </VzButton>
                }
            >
                <p className="vz-body">只分享此 Showcase 的访问地址，不上传、公开或保存你的本地素材。</p>
            </Modal>
        </section>
    );
}
