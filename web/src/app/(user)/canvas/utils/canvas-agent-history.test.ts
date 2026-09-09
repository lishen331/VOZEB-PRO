import { describe, expect, it } from "vitest";
import { preserveCanvasAgentDecisions } from "./canvas-agent-history";
import type { CanvasAssistantSession } from "../types";
const session = (detail: unknown): CanvasAssistantSession => ({ id: "s", title: "chat", createdAt: "1", updatedAt: "2", messages: [{ id: "a", runId: "r", role: "assistant", text: "done", detail }] });
describe("Canvas history preserves agent decisions", () => {
    it.each([{ layoutOperationId: "layout-r" }, { destructiveProposalId: "confirm-r", destructiveDecision: "applied" }, { destructiveProposalId: "confirm-r", destructiveDecision: "cancelled" }])(
        "does not rewind delivery or confirmation receipts on undo",
        (detail) => {
            const current = [session(detail)],
                restored = [session({ destructiveProposalId: "confirm-r", destructiveDecision: "pending" })];
            expect(preserveCanvasAgentDecisions(current, restored)[0].messages[0].detail).toEqual(detail);
        },
    );
    it("retains receipts even when undo predates the conversation", () => {
        const current = [session({ layoutOperationId: "layout-r" })];
        expect(preserveCanvasAgentDecisions(current, [])[0].messages[0].detail).toEqual({ layoutOperationId: "layout-r" });
    });
    it("does not preserve unrelated or pending conversation changes", () => {
        const restored = [session({})];
        expect(preserveCanvasAgentDecisions([session({ destructiveDecision: "pending" })], restored)).toEqual(restored);
    });
});
