import type { PracticeScriptSettings } from "@/lib/auth/store-types";
import { SCRIPT_AGENT_TOOL_NAMES } from "./script-practice-agent-tools";

export const DEFAULT_PRACTICE_SCRIPT_SETTINGS: PracticeScriptSettings = {
    enabled: true,
    defaultModelId: "",
    fallbackModelId: "",
    endpointId: "",
    defaultLanguage: "zh-CN",
    defaultFormat: "structured",
    enabledSkills: [],
    enabledTools: [...SCRIPT_AGENT_TOOL_NAMES],
    agentWorkflowVersion: 1,
    writeConfirmation: "always",
    creativeControlsEnabled: true,
};

export function normalizePracticeScriptSettings(value: unknown): PracticeScriptSettings {
    const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    return {
        enabled: input.enabled !== false,
        defaultModelId: text(input.defaultModelId),
        fallbackModelId: text(input.fallbackModelId),
        endpointId: text(input.endpointId),
        defaultLanguage: text(input.defaultLanguage) || "zh-CN",
        defaultFormat: input.defaultFormat === "fountain" ? "fountain" : "structured",
        enabledSkills: strings(input.enabledSkills),
        enabledTools: Array.isArray(input.enabledTools) ? strings(input.enabledTools).filter((tool) => SCRIPT_AGENT_TOOL_NAMES.includes(tool as (typeof SCRIPT_AGENT_TOOL_NAMES)[number])) : [...SCRIPT_AGENT_TOOL_NAMES],
        agentWorkflowVersion: Number.isSafeInteger(input.agentWorkflowVersion) && Number(input.agentWorkflowVersion) > 0 ? Number(input.agentWorkflowVersion) : 1,
        writeConfirmation: input.writeConfirmation === "high-risk-only" ? "high-risk-only" : "always",
        creativeControlsEnabled: input.creativeControlsEnabled !== false,
    };
}

export function assertPracticeScriptSettingsPatch(value: unknown) {
    const settings = normalizePracticeScriptSettings(value);
    if (typeof value !== "object" || !value || Array.isArray(value)) throw new Error("剧本配置参数无效");
    const input = value as Record<string, unknown>;
    if (
        Object.keys(input).some(
            (key) => !["enabled", "defaultModelId", "fallbackModelId", "endpointId", "defaultLanguage", "defaultFormat", "enabledSkills", "enabledTools", "agentWorkflowVersion", "writeConfirmation", "creativeControlsEnabled"].includes(key),
        )
    )
        throw new Error("剧本配置包含不支持的字段");
    return settings;
}

export function publicPracticeScriptSettings(value: unknown) {
    const settings = normalizePracticeScriptSettings(value);
    return {
        enabled: settings.enabled,
        defaultModelId: settings.defaultModelId,
        fallbackModelId: settings.fallbackModelId,
        defaultLanguage: settings.defaultLanguage,
        defaultFormat: settings.defaultFormat,
        agentWorkflowVersion: settings.agentWorkflowVersion,
        creativeControlsEnabled: settings.creativeControlsEnabled,
    };
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim().slice(0, 200) : "";
}
function strings(value: unknown) {
    return Array.isArray(value)
        ? [
              ...new Set(
                  value
                      .filter((item): item is string => typeof item === "string")
                      .map((item) => item.trim())
                      .filter(Boolean),
              ),
          ].slice(0, 100)
        : [];
}
