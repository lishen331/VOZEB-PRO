import type { CanvasAssistantSession } from "../types";
/** Undo restores canvas content, not authorization/delivery receipts. Otherwise reopening could replay an undone operation. */
export function preserveCanvasAgentDecisions(current: CanvasAssistantSession[], restored: CanvasAssistantSession[]): CanvasAssistantSession[] {
    let next = restored;
    for (const session of current) {
        const receipts = session.messages.filter((message) => {
            const detail = message.detail;
            return (
                message.runId && detail && typeof detail === "object" && (("layoutOperationId" in detail && Boolean(detail.layoutOperationId)) || ("destructiveDecision" in detail && ["applied", "cancelled"].includes(String(detail.destructiveDecision))))
            );
        });
        if (!receipts.length) continue;
        const previous = next.find((s) => s.id === session.id);
        if (!previous) {
            next = [...next, { ...session, messages: receipts }];
            continue;
        }
        const ids = new Set(receipts.map((m) => m.id));
        next = next.map((s) => (s.id === session.id ? { ...s, messages: [...s.messages.filter((m) => !ids.has(m.id)), ...receipts] } : s));
    }
    return next;
}
