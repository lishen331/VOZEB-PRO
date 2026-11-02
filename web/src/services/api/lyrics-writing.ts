"use client";

import { refreshUserPointsIfSystem } from "@/services/api/points";
import { throwIfClientSessionExpired } from "@/services/api/session-expiration";

export async function writeLyrics(input: { requestId: string; prompt: string }) {
    try {
        const response = await fetch("/api/agent/lyrics-writing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });
        throwIfClientSessionExpired(response);
        const payload = (await response.json().catch(() => null)) as { data?: { lyrics?: string }; msg?: string } | null;
        const lyrics = payload?.data?.lyrics?.trim();
        if (!response.ok || !lyrics) throw new Error(payload?.msg || "歌词生成失败");
        return lyrics;
    } finally {
        void refreshUserPointsIfSystem("system");
    }
}
