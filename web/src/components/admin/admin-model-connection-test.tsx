"use client";

import { Button, Modal, Space, Tag, message } from "antd";
import { CheckCircle2, Clock3, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LogicalModelCapability } from "@/lib/auth/store";

export type ConnectionTestTarget = { logicalModelId: string; capability: LogicalModelCapability };
type ChannelResult = { channelId: string; channelName: string; upstreamModel: string; status: "available" | "unavailable"; responseMs: number; requestId: string; error?: string };
type ModelResult = { logicalModelId: string; modelName: string; capability: LogicalModelCapability; status: "available" | "partial" | "unavailable" | "untested"; testedAt: string; signature: string; channels: ChannelResult[] };

type Props = { targets: ConnectionTestTarget[]; label?: string; title?: string; className?: string };

export function AdminModelConnectionTest({ targets, label = "连接测试", title = "连接测试结果", className }: Props) {
    const [open, setOpen] = useState(false);
    const [testing, setTesting] = useState(false);
    const [results, setResults] = useState<ModelResult[]>([]);
    const storageKey = useMemo(() => `vozeb:model-connection-test:${JSON.stringify(targets)}`, [targets]);

    useEffect(() => {
        try {
            const cached = JSON.parse(localStorage.getItem(storageKey) || "null");
            if (Array.isArray(cached)) setResults(cached);
        } catch {
            setResults([]);
        }
    }, [storageKey]);

    const status = results.length ? aggregateStatus(results) : "untested";
    const run = async () => {
        if (!targets.length || testing) return;
        setOpen(true);
        setTesting(true);
        try {
            const response = await fetch("/api/admin/model-connection-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets }) });
            const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: { results?: ModelResult[] } };
            if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "连接测试失败");
            const next = payload.data?.results || [];
            setResults(next);
            localStorage.setItem(storageKey, JSON.stringify(next));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "连接测试失败");
        } finally {
            setTesting(false);
        }
    };

    return (
        <>
            <Button className={className} size="small" loading={testing} icon={status === "untested" ? <RefreshCw className="size-3.5" /> : <StatusIcon status={status} />} onClick={() => (status === "untested" ? void run() : setOpen(true))}>
                {status === "untested" ? label : statusLabel(status)}
            </Button>
            <Modal title={title} open={open} onCancel={() => setOpen(false)} destroyOnHidden footer={<Space><Button onClick={() => setOpen(false)}>关闭</Button><Button type="primary" loading={testing} onClick={() => void run()}>重新测试</Button></Space>}>
                <div className="space-y-3">
                    {results.length ? results.map((result) => (
                        <div key={`${result.capability}:${result.logicalModelId}`} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                            <div className="flex items-center justify-between"><span className="font-medium">{result.modelName}</span><Tag color={result.status === "available" ? "green" : result.status === "partial" ? "orange" : "red"}>{statusLabel(result.status)}</Tag></div>
                            {result.channels.map((channel) => <div key={channel.requestId} className="mt-2 rounded border p-2 text-xs"><div className="flex items-center gap-2"><StatusIcon status={channel.status} />{channel.channelName} · {channel.responseMs}ms</div><div className="text-stone-500">请求 ID：{channel.requestId}</div>{channel.error ? <div className="text-red-600">{channel.error}</div> : null}</div>)}
                        </div>
                    )) : <div className="py-8 text-center text-stone-500">点击“重新测试”开始测试当前实际路由</div>}
                </div>
            </Modal>
        </>
    );
}

function aggregateStatus(results: ModelResult[]): ModelResult["status"] {
    const ok = results.filter((item) => item.status === "available").length;
    return ok === results.length ? "available" : ok ? "partial" : "unavailable";
}
function statusLabel(status: ModelResult["status"]) {
    return status === "available" ? "可用" : status === "partial" ? "部分可用" : status === "unavailable" ? "不可用" : "未测试";
}
function StatusIcon({ status }: { status: ModelResult["status"] }) {
    return status === "available" ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : status === "partial" ? <Clock3 className="size-3.5 text-orange-500" /> : <XCircle className="size-3.5 text-red-600" />;
}
