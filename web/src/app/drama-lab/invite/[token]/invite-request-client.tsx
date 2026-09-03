"use client";

import { Alert, Button, Card, QRCode, Spin, message } from "antd";
import { ArrowLeft, CheckCircle2, LogIn, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type InvitePreview = { projectId: string; projectTitle?: string; expiresAt: string };

export default function InviteRequestClient({ token }: { token: string }) {
    const [preview, setPreview] = useState<InvitePreview>();
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string>();
    const inviteUrl = useMemo(() => {
        if (typeof window === "undefined") return "";
        return `${window.location.origin}/drama-lab/invite/${encodeURIComponent(token)}`;
    }, [token]);

    useEffect(() => {
        let disposed = false;
        void fetch(`/api/drama-lab/invites/${encodeURIComponent(token)}`, { cache: "no-store" })
            .then(async (response) => {
                const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: InvitePreview; msg?: string };
                if (!response.ok || payload.code !== 0 || !payload.data) throw new Error(payload.msg || "邀请链接无效或已过期");
                if (!disposed) setPreview(payload.data);
            })
            .catch((loadError) => {
                if (!disposed) setError(loadError instanceof Error ? loadError.message : "邀请信息加载失败");
            })
            .finally(() => {
                if (!disposed) setLoading(false);
            });
        return () => {
            disposed = true;
        };
    }, [token]);

    const requestJoin = async () => {
        setJoining(true);
        setError(undefined);
        try {
            const response = await fetch(`/api/drama-lab/invites/${encodeURIComponent(token)}`, { method: "POST" });
            if (response.status === 401) {
                const next = `${window.location.pathname}${window.location.search}`;
                window.location.assign(`/login?next=${encodeURIComponent(next)}`);
                return;
            }
            const payload = (await response.json().catch(() => ({}))) as { code?: number; data?: { projectId?: string; status?: string }; msg?: string };
            if (!response.ok || payload.code !== 0 || !payload.data?.projectId) throw new Error(payload.msg || "加入申请提交失败");
            if (payload.data.status === "approved") {
                window.location.assign(`/drama-lab/${encodeURIComponent(payload.data.projectId)}`);
                return;
            }
            setSubmitted(true);
            message.success("加入申请已提交，等待项目管理员确认");
        } catch (joinError) {
            setError(joinError instanceof Error ? joinError.message : "加入申请提交失败");
        } finally {
            setJoining(false);
        }
    };

    return (
        <main className="min-h-screen bg-background px-4 py-10">
            <div className="mx-auto max-w-lg">
                <Link href="/drama-lab" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="size-4" /> 返回短剧项目
                </Link>
                <Card className="mt-6" bordered>
                    {loading ? (
                        <div className="grid min-h-48 place-items-center">
                            <Spin />
                        </div>
                    ) : error ? (
                        <Alert type="error" showIcon message="邀请链接不可用" description={error} action={<Button onClick={() => window.location.reload()}>重试</Button>} />
                    ) : preview ? (
                        <div className="space-y-5">
                            <div className="flex items-start gap-3">
                                <span className="grid size-10 shrink-0 place-items-center border border-primary/30 bg-primary/10 text-primary">
                                    <Users className="size-5" />
                                </span>
                                <div className="min-w-0">
                                    <h1 className="text-lg font-semibold">加入短剧项目</h1>
                                    <p className="mt-1 truncate text-sm text-muted-foreground">{preview.projectTitle || preview.projectId}</p>
                                </div>
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">确认后，项目管理员会审核你的加入申请。申请通过后，你可以在项目组内协作。</p>
                            {inviteUrl ? <QRCode value={inviteUrl} size={132} className="mx-auto" /> : null}
                            <p className="text-center text-xs text-muted-foreground">邀请有效期至 {new Date(preview.expiresAt).toLocaleString("zh-CN")}</p>
                            {submitted ? (
                                <Alert type="success" showIcon icon={<CheckCircle2 className="size-4" />} message="申请已提交" description="等待项目管理员确认后即可进入项目。" />
                            ) : (
                                <Button type="primary" block size="large" icon={<LogIn className="size-4" />} loading={joining} onClick={() => void requestJoin()}>
                                    申请加入项目
                                </Button>
                            )}
                            {error ? <Alert type="error" showIcon message={error} /> : null}
                        </div>
                    ) : null}
                </Card>
            </div>
        </main>
    );
}
