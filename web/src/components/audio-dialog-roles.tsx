"use client";

import { Input, Select } from "antd";

import { detectDialogScript } from "@/lib/audio-dialog-script";
import type { AudioParamOption } from "@/lib/audio-model-params";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { VoiceSelector } from "@/components/voice-selector";

export type DialogRoleSetting = { voice: string; instruction?: string; emotion?: string };

const EMOTIONS = [
    { value: "auto", label: "自动" },
    { value: "happy", label: "高兴" },
    { value: "sad", label: "悲伤" },
    { value: "angry", label: "愤怒" },
    { value: "fearful", label: "害怕" },
    { value: "disgusted", label: "厌恶" },
    { value: "surprised", label: "惊讶" },
    { value: "calm", label: "平静" },
];

/**
 * 多人对话的角色卡片：角色从文本里解析，不单独录入。
 * 每个角色一行音色；千问加一句角色指令，MiniMax 只能选情绪（上游不支持自由指令）。
 */
export function AudioDialogRoles({
    text,
    roles,
    model,
    family,
    presetVoices,
    theme,
    onChange,
}: {
    text: string;
    roles: Record<string, DialogRoleSetting>;
    model: string;
    family: "qwen" | "minimax";
    presetVoices: AudioParamOption[];
    theme: CanvasTheme;
    onChange: (roles: Record<string, DialogRoleSetting>) => void;
}) {
    const { lines, roles: names, suggested } = detectDialogScript(text);
    const countByRole = new Map<string, number>();
    for (const line of lines) countByRole.set(line.role, (countByRole.get(line.role) || 0) + 1);
    if (!suggested) {
        return (
            <p className="rounded-lg px-2 py-2 text-[11px] leading-5" style={{ background: theme.node.fill, color: theme.node.muted }}>
                按「名字：台词」每行一句，至少 2 个角色。例如：
                <br />
                小美：今天去哪吃饭？
                <br />
                阿强：楼下新开了一家面馆。
            </p>
        );
    }
    const update = (name: string, patch: Partial<DialogRoleSetting>) => onChange({ ...roles, [name]: { ...(roles[name] || { voice: "" }), ...patch } });
    return (
        <div className="space-y-2">
            {names.map((name) => {
                const role = roles[name] || { voice: "" };
                return (
                    <div key={name} className="space-y-1.5 rounded-xl border p-2" style={{ borderColor: theme.node.stroke }}>
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                            <span className="shrink-0" style={{ color: theme.node.muted }}>
                                {countByRole.get(name) || 0} 句
                            </span>
                        </div>
                        <VoiceSelector compact value={role.voice} presetVoices={presetVoices} model={model} theme={theme} onChange={(voice) => update(name, { voice })} />
                        {family === "minimax" ? (
                            <Select
                                size="small"
                                className="w-full"
                                value={role.emotion || "auto"}
                                options={EMOTIONS}
                                popupMatchSelectWidth={false}
                                styles={{ popup: { root: { zIndex: 1305 } } }}
                                onChange={(emotion) => update(name, { emotion })}
                                aria-label={`${name} 的情绪`}
                            />
                        ) : (
                            <Input size="small" value={role.instruction || ""} placeholder="角色指令，如：语速偏慢，带点犹豫" maxLength={200} onChange={(event) => update(name, { instruction: event.target.value })} aria-label={`${name} 的指令`} />
                        )}
                    </div>
                );
            })}
            {lines.length > 100 ? <p className="text-[11px] text-orange-500">台词超过 100 句，只会合成前 100 句</p> : null}
        </div>
    );
}
