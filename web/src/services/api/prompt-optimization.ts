"use client";

import type { CreativeGenerationMode } from "@/lib/creative-runtime-contract";
import { refreshUserPointsIfSystem } from "@/services/api/points";
import { throwIfClientSessionExpired } from "@/services/api/session-expiration";

export async function optimizePrompt(input: { requestId: string; prompt: string; mode: "agent" | CreativeGenerationMode; practice?: boolean }) {
    try {
        const response = await fetch(input.practice ? "/api/practice/prompt-optimization" : "/api/agent/prompt-optimization", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input.practice ? { requestId: input.requestId, prompt: input.prompt, mode: input.mode } : input),
        });
        throwIfClientSessionExpired(response);
        const payload = (await response.json().catch(() => null)) as { data?: { prompt?: string }; msg?: string } | null;
        const prompt = payload?.data?.prompt?.trim();
        if (!response.ok || !prompt) throw new Error(payload?.msg || "提示词优化失败");
        return prompt;
    } finally {
        if (!input.practice) void refreshUserPointsIfSystem("system");
    }
}
