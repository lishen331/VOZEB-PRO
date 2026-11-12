"use client";

import { Download, History, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { LabParams, LabRunStatus, LabStatus, LabUploadItem } from "@/components/vz-lab";
import { LabButton, LabGenerateButton, LabModelPicker, LabParamPicker, LabPromptEditor, LabResultCard, LabTag, LabUploadZone } from "@/components/vz-lab";

import { useLab } from "./lab-context";
import { IMG, MODELS, PROMPT, SUGGESTIONS, UPLOADS } from "./mock-data";

export function SectionWorkflow() {
    const { getContainer, toast } = useLab();
    const [model, setModel] = useState("m1");
    const [prompt, setPrompt] = useState(PROMPT);
    const [uploads, setUploads] = useState<LabUploadItem[]>(UPLOADS);
    const [params, setParams] = useState<LabParams>({ ratio: "16:9", quality: "高清", count: 2, strength: 60, hd: true });
    const [run, setRun] = useState<LabRunStatus>("idle");
    const [progress, setProgress] = useState(0);
    const [failNext, setFailNext] = useState(false);
    const timers = useRef<number[]>([]);

    const current = MODELS.find((m) => m.id === model) ?? MODELS[0];
    const cost = current.cost * params.count + (params.hd ? 2 : 0);
    const empty = !prompt.trim();

    const clearTimers = () => {
        timers.current.forEach((id) => window.clearTimeout(id));
        timers.current = [];
    };
    useEffect(() => clearTimers, []);

    // Local timeline only — no request is made and no credits are consumed.
    const start = () => {
        if (run === "running" || empty) return;
        clearTimers();
        setRun("running");
        setProgress(0);
        const steps = [8, 22, 38, 54, 63, 76, 88, 100];
        steps.forEach((value, i) => {
            timers.current.push(
                window.setTimeout(
                    () => {
                        if (failNext && value > 60) {
                            clearTimers();
                            setRun("error");
                            toast.error("模拟失败：上游服务繁忙（本地演示，未扣积分）");
                            return;
                        }
                        setProgress(value);
                        if (value === 100) {
                            setRun("success");
                            toast.success(`模拟生成完成 · 预计 ${cost} 积分（未实际扣除）`);
                            timers.current.push(window.setTimeout(() => setRun("idle"), 2000));
                        }
                    },
                    380 * (i + 1),
                ),
            );
        });
    };

    const resultStatus: LabStatus = run === "running" ? (progress < 10 ? "queued" : "running") : run === "error" ? "failed" : "success";

    return (
        <section id="vzl-sec-workflow" style={{ display: "grid", gap: 20, scrollMarginTop: 80 }}>
            <div className="vzl-head">
                <div className="vzl-head__text">
                    <span className="vzl-eyebrow">工作台 · 图片创作</span>
                    <h1 className="vzl-display">把想法变成画面</h1>
                    <p className="vzl-body">真实创作流程的组件组合。所有数据为前端本地 Mock，不请求接口、不写数据库。</p>
                </div>
                <div className="vzl-head__actions">
                    <LabButton variant="ghost" icon={History}>
                        历史记录
                    </LabButton>
                    <LabButton icon={Share2}>分享</LabButton>
                    <LabButton variant="primary" icon={Download}>
                        导出全部
                    </LabButton>
                </div>
            </div>

            <div className="vzl-split">
                <div className="vzl-panel vzl-stack" style={{ gap: 20 }}>
                    <div className="vzl-stack" style={{ gap: 8 }}>
                        <span className="vzl-h3">模型</span>
                        <LabModelPicker models={MODELS} value={model} onChange={setModel} getContainer={getContainer} />
                    </div>
                    <div className="vzl-stack" style={{ gap: 8 }}>
                        <span className="vzl-h3">参考素材</span>
                        <LabUploadZone
                            items={uploads}
                            onRemove={(id) => setUploads((list) => list.filter((item) => item.id !== id))}
                            onAdd={(files) => {
                                if (!files.length) return;
                                setUploads((list) => [...list, ...files.slice(0, 6 - list.length).map((file, i) => ({ id: `${file.name}-${list.length + i}`, src: IMG.e, name: file.name, status: "done" as const }))]);
                                toast.info(`已在本地添加 ${files.length} 个文件（不会上传）`);
                            }}
                        />
                    </div>
                    <LabPromptEditor value={prompt} onChange={setPrompt} suggestions={SUGGESTIONS} disabled={run === "running"} error={empty ? "请先输入提示词再开始生成" : undefined} />
                    <hr className="vzl-divider" />
                    <LabParamPicker value={params} onChange={setParams} disabled={run === "running"} />
                    <div className="vzl-row vzl-between vzl-run-bar" style={{ paddingTop: 4 }}>
                        <label className="vzl-row vzl-caption" style={{ gap: 8, cursor: "pointer" }}>
                            <input type="checkbox" checked={failNext} onChange={(e) => setFailNext(e.target.checked)} style={{ accentColor: "var(--vzl-brand)", width: 16, height: 16 }} />
                            模拟下一次失败
                        </label>
                        <LabGenerateButton status={run} cost={cost} progress={progress} disabled={empty} onClick={run === "error" ? () => setRun("idle") : start} />
                    </div>
                </div>

                <div className="vzl-panel vzl-stack" style={{ gap: 16 }}>
                    <div className="vzl-row vzl-between">
                        <span className="vzl-h3">生成结果</span>
                        <LabTag className="vzl-num">{`${params.ratio} · ${params.quality} · ×${params.count}`}</LabTag>
                    </div>
                    <LabResultCard
                        status={run === "idle" ? "success" : resultStatus}
                        src={IMG.hero}
                        prompt={prompt || PROMPT}
                        model={{ name: current.name, vendor: current.vendor }}
                        progress={progress}
                        error="上游服务繁忙，积分已自动退回"
                        onRetry={() => {
                            setFailNext(false);
                            setRun("idle");
                        }}
                    />
                    <div className="vzl-grid" style={{ "--min": "200px" } as React.CSSProperties}>
                        <LabResultCard status="running" prompt="樱花下的少年剑客，动画分镜" model={{ name: "Kling 2.5", vendor: "Kuaishou" }} progress={46} />
                        <LabResultCard status="failed" prompt="示例：未通过审核的提示词" model={{ name: "GPT Image 2", vendor: "OpenAI" }} error="内容审核未通过" />
                    </div>
                </div>
            </div>
        </section>
    );
}
