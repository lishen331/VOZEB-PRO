"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Switch, message } from "antd";

export default function OneClickFilmFeaturesClient() {
    const router = useRouter();
    const [enabled, setEnabled] = useState(true);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch("/api/admin/settings")
            .then((response) => response.json())
            .then((payload) => setEnabled(payload.settings?.featureModules?.["one-click-film"] !== false))
            .finally(() => setLoading(false));
    }, []);

    async function save(next: boolean) {
        setEnabled(next);
        setSaving(true);
        try {
            const current = await fetch("/api/admin/settings").then((response) => response.json());
            const response = await fetch("/api/admin/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    featureModules: { ...(current.settings?.featureModules || {}), "one-click-film": next },
                    settingsRevision: current.settingsRevision ?? 1,
                }),
            });
            if (!response.ok) throw new Error();
            message.success(next ? "一键成片入口已显示" : "一键成片入口已隐藏");
        } catch {
            setEnabled(!next);
            message.error("保存失败，请刷新后重试");
        } finally {
            setSaving(false);
        }
    }

    return (
        <main className="min-h-screen overflow-y-auto bg-stone-50 p-6 text-stone-950">
            <div className="mx-auto max-w-4xl pb-12">
                <Button type="link" onClick={() => router.push("/admin?section=plugins")} className="!px-0">
                    ← 返回插件市场
                </Button>
                <div className="mb-5 mt-3">
                    <div className="mb-2 text-sm text-stone-500">插件市场 / 一键成片 / 独立配置</div>
                    <h1 className="text-2xl font-semibold">一键成片配置</h1>
                    <p className="mt-1 text-sm text-stone-500">本配置当前只控制前台入口是否显示，不改变业务逻辑、任务或历史数据。</p>
                </div>
                <section className="flex items-center justify-between rounded-xl border bg-white p-6">
                    <div>
                        <h2 className="text-lg font-semibold">一键成片入口</h2>
                        <p className="mt-1 text-sm text-stone-500">开启后，前台导航会在创作工坊下方显示“一键成片”。</p>
                    </div>
                    <Switch checked={enabled} loading={loading || saving} onChange={save} />
                </section>
            </div>
        </main>
    );
}
