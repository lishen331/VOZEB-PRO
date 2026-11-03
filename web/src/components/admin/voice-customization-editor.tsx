"use client";

import { useState } from "react";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Button } from "@/components/gamma-ui/gamma-ant";
import type { SystemChannelAdvancedConfig } from "@/lib/auth/store";
import { normalizeVoiceCustomization, VOICE_CUSTOMIZATION_TEMPLATES } from "@/lib/custom-voice-config";

export function VoiceCustomizationEditor({ advanced, updateAdvanced }: { advanced: SystemChannelAdvancedConfig; updateAdvanced: (patch: Partial<SystemChannelAdvancedConfig>) => void }) {
    const [jsonText, setJsonText] = useState(() => (advanced.voiceCustomization ? JSON.stringify(advanced.voiceCustomization, null, 2) : ""));
    const [jsonError, setJsonError] = useState<string | undefined>();
    const { message } = App.useApp();

    const applyJson = () => {
        if (!jsonText.trim()) {
            updateAdvanced({ voiceCustomization: undefined });
            setJsonError(undefined);
            message.success("已清除自定义音色配置");
            return;
        }
        try {
            const parsed = JSON.parse(jsonText);
            const normalized = normalizeVoiceCustomization(parsed);
            if (!normalized) {
                setJsonError("配置格式无效，请检查 provider 字段是否为 minimax 或 qwen");
                return;
            }
            updateAdvanced({ voiceCustomization: normalized });
            setJsonText(JSON.stringify(normalized, null, 2));
            setJsonError(undefined);
            message.success("自定义音色配置已保存");
        } catch (error) {
            setJsonError(error instanceof Error ? error.message : "JSON 解析失败");
        }
    };

    const loadTemplate = (provider: "minimax" | "qwen") => {
        const template = VOICE_CUSTOMIZATION_TEMPLATES[provider];
        setJsonText(JSON.stringify(template, null, 2));
        setJsonError(undefined);
    };

    return (
        <div className="md:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-[var(--gm-text-3)]">自定义音色配置 (JSON)</div>
                <div className="flex gap-1.5">
                    <Button size="small" onClick={() => loadTemplate("minimax")}>
                        MiniMax 模板
                    </Button>
                    <Button size="small" onClick={() => loadTemplate("qwen")}>
                        Qwen 模板
                    </Button>
                    <Button size="small" type="primary" onClick={applyJson}>
                        应用配置
                    </Button>
                </div>
            </div>
            <Input.TextArea
                value={jsonText}
                rows={8}
                placeholder='{"provider":"minimax","region":"cn",...}'
                className="font-mono text-xs"
                onChange={(event) => {
                    setJsonText(event.target.value);
                    setJsonError(undefined);
                }}
            />
            {jsonError ? <div className="text-xs text-red-500">{jsonError}</div> : null}
            <div className="text-[11px] leading-5 text-[var(--gm-text-3)]">
                配置自定义音色功能的上游接口参数、定价和限制。点击模板按钮加载 MiniMax 或 Qwen 的默认配置，修改后点击"应用配置"保存。留空则禁用自定义音色功能。
            </div>
        </div>
    );
}
