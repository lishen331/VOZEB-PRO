"use client";

import { App, Button, Input, Tag } from "antd";
import { ArrowRight, School, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SchoolMemberRole } from "@/lib/school-domain";
import { schoolApi, type SchoolInvitePreview } from "@/services/api/school";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

export default function SchoolJoinPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const searchParams = useSearchParams();
    const setContext = useSchoolContextStore((state) => state.setContext);
    const [code, setCode] = useState(() => searchParams.get("code")?.trim() || "");
    const [preview, setPreview] = useState<(SchoolInvitePreview & { code: string }) | null>(null);
    const [loading, setLoading] = useState(false);
    const [joining, setJoining] = useState(false);
    const requestSequence = useRef(0);

    const loadPreview = useCallback(
        async (value: string) => {
            const requestId = ++requestSequence.current;
            const normalized = value.trim();
            if (!normalized) {
                setPreview(null);
                message.warning("请填写邀请码");
                return;
            }
            setLoading(true);
            try {
                const result = await schoolApi.previewInvite(normalized);
                if (requestId !== requestSequence.current) return;
                setPreview({ ...result, code: normalized });
            } catch (error) {
                if (requestId !== requestSequence.current) return;
                setPreview(null);
                message.error(error instanceof Error ? error.message : "邀请信息读取失败");
            } finally {
                if (requestId === requestSequence.current) setLoading(false);
            }
        },
        [message],
    );

    useEffect(() => {
        const initialCode = searchParams.get("code")?.trim();
        if (initialCode) void loadPreview(initialCode);
    }, [loadPreview, searchParams]);

    const join = async () => {
        if (!preview) return;
        setJoining(true);
        try {
            const context = await schoolApi.joinByInvite(preview.code);
            setContext(context);
            message.success(`已加入${context.school.name}`);
            router.replace(context.membership.role === "student" ? "/learning" : "/teaching");
            router.refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "加入学校失败");
        } finally {
            setJoining(false);
        }
    };

    return (
        <main className="h-full min-h-0 overflow-y-auto px-4 py-8 sm:px-6">
            <div className="mx-auto max-w-xl">
                <header className="mb-5 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                    <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-100">加入学校</h1>
                </header>
                <Input.Search
                    value={code}
                    allowClear
                    enterButton="查看邀请"
                    size="large"
                    loading={loading}
                    placeholder="输入学校邀请码"
                    aria-label="学校邀请码"
                    onChange={(event) => {
                        requestSequence.current += 1;
                        setCode(event.target.value);
                        setPreview(null);
                        setLoading(false);
                    }}
                    onSearch={(value) => void loadPreview(value)}
                />

                {preview ? (
                    <section className="mt-5 rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950" aria-label="邀请确认">
                        <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            <InviteField icon={<School className="size-4" />} label="目标学校" value={preview.school.name} />
                            <InviteField icon={<UserRound className="size-4" />} label="校内身份" value={<Tag color={preview.role === "teacher" ? "blue" : "green"}>{roleLabel(preview.role)}</Tag>} />
                        </dl>
                        <Button className="mt-4 w-full" type="primary" size="large" icon={<ArrowRight className="size-4" />} iconPlacement="end" loading={joining} onClick={() => void join()}>
                            确认加入
                        </Button>
                    </section>
                ) : null}
            </div>
        </main>
    );
}

function InviteField({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3 py-3 first:pt-0 last:pb-0">
            <dt className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                {icon}
                {label}
            </dt>
            <dd className="min-w-0 truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">{value}</dd>
        </div>
    );
}

function roleLabel(role: SchoolMemberRole) {
    return role === "teacher" ? "老师" : "学生";
}
