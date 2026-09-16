"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Select, Spin, Switch, Table, Tag } from "antd";
import type { AuthSettings } from "@/lib/auth/store";
type Profile = { agentKey: string; name: string; enabled: boolean; primaryLogicalModelId: string; fallbackLogicalModelId: string; toolAllowlist: string[]; skillBindings: string[]; version: number };
export function AdminPracticeScriptAgent({ settings }: { settings: AuthSettings }) {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const modelOptions = settings.logicalModels
        .filter(
            (model) =>
                model.enabled &&
                model.capability === "text" &&
                model.bindings.some((binding) => binding.enabled && settings.systemChannels.some((channel) => channel.id === binding.channelId && channel.enabled && channel.purpose === "open-source-practice")),
        )
        .map((model) => ({ value: model.id, label: model.name || model.id }));
    useEffect(() => {
        void fetch("/api/admin/practice-script/overview", { cache: "no-store" })
            .then((r) => r.json())
            .then((p) => setProfiles(p.data?.profiles || []))
            .finally(() => setLoading(false));
    }, []);
    const save = async (profile: Profile) => {
        setLoading(true);
        try {
            const r = await fetch(`/api/admin/practice-script/agents/${profile.agentKey}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
            if (!r.ok) throw new Error((await r.json()).msg || "保存失败");
            setProfiles((current) => current.map((item) => (item.agentKey === profile.agentKey ? { ...profile, version: profile.version + 1 } : item)));
        } finally {
            setLoading(false);
        }
    };
    if (loading && !profiles.length) return <Spin />;
    return (
        <div className="space-y-4" aria-label="剧本 Agent 真实配置">
            <Alert type={modelOptions.length ? "success" : "warning"} showIcon message={modelOptions.length ? "已发现可供剧本 Agent 使用的无限练习文本模型" : "请先在模型渠道中配置 purpose=open-source-practice 的文本逻辑模型"} />
            <Table
                rowKey="agentKey"
                pagination={false}
                dataSource={profiles}
                columns={[
                    {
                        title: "Agent",
                        render: (_, row) => (
                            <div>
                                <div className="font-medium">{row.name}</div>
                                <code className="text-xs text-zinc-500">{row.agentKey}</code>
                            </div>
                        ),
                    },
                    { title: "启用", width: 80, render: (_, row) => <Switch checked={row.enabled} onChange={(enabled) => setProfiles((current) => current.map((item) => (item.agentKey === row.agentKey ? { ...item, enabled } : item)))} /> },
                    {
                        title: "真实模型",
                        render: (_, row) => (
                            <Select
                                className="min-w-52"
                                value={row.primaryLogicalModelId || undefined}
                                placeholder="选择无限练习文本模型"
                                options={modelOptions}
                                onChange={(value) => setProfiles((current) => current.map((item) => (item.agentKey === row.agentKey ? { ...item, primaryLogicalModelId: value } : item)))}
                            />
                        ),
                    },
                    {
                        title: "Skill / Tool",
                        render: (_, row) => (
                            <div className="flex flex-wrap gap-1">
                                <Tag>{row.skillBindings.length} Skills</Tag>
                                <Tag>{row.toolAllowlist.length} Tools</Tag>
                                <Tag>v{row.version}</Tag>
                            </div>
                        ),
                    },
                    {
                        title: "操作",
                        width: 90,
                        render: (_, row) => (
                            <Button size="small" type="primary" onClick={() => void save(row)}>
                                保存
                            </Button>
                        ),
                    },
                ]}
            />
        </div>
    );
}
