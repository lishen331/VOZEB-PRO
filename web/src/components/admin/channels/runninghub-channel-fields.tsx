"use client";

import { Segmented } from "@/components/gamma-ui/gamma-ant";

import { LabeledControl } from "@/components/admin/admin-settings-controls";
import type { SystemModelChannel } from "@/lib/auth/store";

const RUNNINGHUB_DOCS_URL = "https://www.runninghub.cn/runninghub-api-doc-cn/";

export function ChannelPurposeControl({ channel, onChange }: { channel: SystemModelChannel; onChange: (patch: Partial<SystemModelChannel>) => void }) {
    return (
        <LabeledControl label="渠道用途">
            <Segmented
                block
                value={channel.purpose || "shared"}
                options={[
                    { label: "正式生产", value: "production" },
                    { label: "无限练习", value: "open-source-practice" },
                    { label: "共享", value: "shared" },
                ]}
                onChange={(value) => onChange({ purpose: value as SystemModelChannel["purpose"] })}
            />
        </LabeledControl>
    );
}

export function RunningHubChannelFields({ channel }: { channel: SystemModelChannel; onChange?: (patch: Partial<SystemModelChannel>) => void }) {
    if (channel.advancedConfig?.protocol !== "runninghub") return null;
    return (
        <section className="rounded-lg border border-[var(--gm-border)] bg-[var(--gm-wash)] p-3">
            <div className="text-sm font-semibold text-[var(--gm-text)]">RunningHub 无限练习渠道</div>
            <div className="mt-1 text-xs leading-5 text-[var(--gm-text-3)]">RunningHub 仅用于无限练习。工作流的 Workflow ID、输入/节点/输出映射和测试配置请在“工作流”页管理。</div>
            <a className="mt-2 inline-block text-xs text-[var(--gm-accent)] underline underline-offset-2" href={RUNNINGHUB_DOCS_URL} target="_blank" rel="noreferrer">
                RunningHub 官方文档
            </a>
        </section>
    );
}
