import type { PracticeSession, PracticeSessionResult } from "@/services/api/practice";

export const PRACTICE_SESSION_STATUS_LABELS: Record<PracticeSession["status"], string> = {
    draft: "草稿",
    queued: "排队中",
    running: "生成中",
    success: "已完成",
    failed: "失败",
    cancelled: "已取消",
};

export function practiceSessionStatusLabel(session: Pick<PracticeSession, "status">) {
    return PRACTICE_SESSION_STATUS_LABELS[session.status];
}

export function practiceSessionPreview(session: Pick<PracticeSession, "module" | "input" | "result">) {
    if (session.result?.text) return session.result.text.slice(0, 80);
    if (session.result?.media) return session.result.media.kind === "image" ? "图片结果" : session.result.media.kind === "video" ? "视频结果" : "音频结果";
    const input = session.input || {};
    const value = typeof input.content === "string" ? input.content : typeof input.text === "string" ? input.text : typeof input.prompt === "string" ? input.prompt : "";
    return value.trim().slice(0, 80) || "尚未生成结果";
}

export function practiceResultStatus(result: PracticeSessionResult | undefined) {
    return result?.status === "error" ? "failed" : result?.status === "cancelled" ? "cancelled" : result?.status === "success" ? "success" : result?.status;
}
