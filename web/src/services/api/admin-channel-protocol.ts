import type { ChannelProtocolDraft } from "@/lib/channel-protocol-draft";

export type AdminChannelProtocolDraftResult = {
    drafts: ChannelProtocolDraft[];
    warnings: string[];
    sourcePages: number;
};
export type AdminChannelProtocolInput = { documentationUrl?: string; documentationText?: string; examples?: string; useTextModel?: boolean; referenceTypes?: Array<"image" | "video" | "audio"> };
export type AdminChannelProtocolHistoryRecord = {
    id: string;
    channelId: string;
    model: string;
    createdAt: number;
    input: AdminChannelProtocolInput;
    result?: AdminChannelProtocolDraftResult;
    error?: string;
};
export async function getAdminChannelProtocolHistory(channelId: string, targetModel: string) {
    const query = new URLSearchParams({ channelId, targetModel });
    const response = await fetch(`/api/admin/channel-protocol-draft?${query}`, { cache: "no-store" });
    const payload = (await response.json()) as { history?: AdminChannelProtocolHistoryRecord[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "读取协议分析历史失败");
    return payload.history || [];
}
export async function createAdminChannelProtocolDraft(input: AdminChannelProtocolInput & { channelId?: string; targetModel?: string }) {
    const response = await fetch("/api/admin/channel-protocol-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => ({}))) as { draft?: ChannelProtocolDraft; drafts?: ChannelProtocolDraft[]; warnings?: string[]; sourcePages?: number; error?: string };
    if (!response.ok || !payload.draft) throw new Error(payload.error || "协议分析失败");
    return {
        drafts: payload.drafts?.length ? payload.drafts : [payload.draft],
        warnings: payload.warnings || [],
        sourcePages: payload.sourcePages || 0,
    } satisfies AdminChannelProtocolDraftResult;
}
