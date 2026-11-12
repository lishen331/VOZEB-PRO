"use client";

import { Switch } from "@/components/gamma-ui/gamma-ant";

import { LabeledControl } from "@/components/admin/admin-settings-controls";
import type { SystemModelChannel } from "@/lib/auth/store";
import { channelSwitchState } from "@/lib/model-routing-config";

const RUNNINGHUB_DOCS_URL = "https://www.runninghub.cn/runninghub-api-doc-cn/";

/**
 * 渠道的两个启用开关：正式生产 / 无限练习，各自独立。
 * 生产开关写 enabled，练习开关写 practiceEnabled（未设置时回落 enabled）。
 *
 * 显示的勾选状态一律取 channelSwitchState（真实生效状态），与列表保持一致：
 * 用途仍是「正式生产」的渠道，练习开关在这里也必须显示为关。
 */
export function ChannelEnableControls({ channel, onChange }: { channel: SystemModelChannel; onChange: (patch: Partial<SystemModelChannel>) => void }) {
    const runningHub = channel.advancedConfig?.protocol === "runninghub";
    const productionOn = channelSwitchState(channel, "production");
    const practiceOn = channelSwitchState(channel, "open-source-practice");
    const practiceBlocked = !practiceOn && channel.purpose === "production";
    return (
        <LabeledControl label="启用">
            <div className="space-y-2">
                <ToggleRow label="正式生产" description="打开后，逻辑模型的“正式生产”里能看到这个渠道的模型，并可设为生产默认模型。" checked={productionOn} disabled={runningHub} onChange={(enabled) => onChange({ enabled })} />
                <ToggleRow
                    label="无限练习"
                    description="打开后，逻辑模型的“无限练习”里能看到这个渠道的模型，并可在练习模型池中逐个勾选。"
                    checked={practiceOn}
                    onChange={(practiceEnabled) => onChange({ practiceEnabled })}
                    note={practiceBlocked ? "当前用途是「正式生产」，打开练习开关会自动把用途改为「共享」并保存后生效。" : undefined}
                />
                {runningHub ? <p className="text-xs text-[var(--gm-text-3)]">RunningHub 渠道只用于无限练习，生产开关不参与。</p> : null}
            </div>
        </LabeledControl>
    );
}

function ToggleRow({ label, description, checked, disabled, onChange, note }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; note?: string }) {
    return (
        <div className={`flex items-start justify-between gap-3 rounded-md border border-[var(--gm-border)] p-3 ${disabled ? "opacity-60" : ""}`}>
            <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--gm-text)]">{label}</div>
                <div className="mt-1 text-xs leading-5 text-[var(--gm-text-3)]">{description}</div>
                {note ? <div className="mt-1 text-xs text-[var(--gm-warning)]">{note}</div> : null}
            </div>
            <Switch checked={checked} disabled={disabled} checkedChildren="启用" unCheckedChildren="停用" onChange={onChange} />
        </div>
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
