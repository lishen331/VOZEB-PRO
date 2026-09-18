import { describe, expect, it } from "vitest";
import { appendDiagnosticEvent, sanitizeDiagnosticEvent, redactDiagnosticText } from "./media-task-diagnostics";

describe("bounded media task diagnostics", () => {
    it("keeps correlation fields but excludes secrets, prompts and media bodies", () => {
        const event = sanitizeDiagnosticEvent(
            { phase: "submit", taskId: "task-1", channelId: "channel-1", apiKey: "secret", prompt: "private prompt", dataUrl: "data:image/png;base64,secret", url: "https://user:password@example.com/images/edits?signature=secret#private", status: 403 },
            10,
        );
        expect(event).toMatchObject({ phase: "submit", taskId: "task-1", channelId: "channel-1", url: "https://example.com/images/edits", status: 403, at: 10 });
        expect(JSON.stringify(event)).not.toMatch(/secret|password|private/);
    });
    it("bounds oversized fields and the total UTF-8 event budget", () => {
        let events: ReturnType<typeof appendDiagnosticEvent> = [];
        for (let i = 0; i < 100; i++) events = appendDiagnosticEvent(events, { phase: "response", requestId: "中".repeat(10000), status: i }, i);
        expect(Buffer.byteLength(JSON.stringify(events), "utf8")).toBeLessThanOrEqual(20 * 1024);
        expect(events.at(-1)?.status).toBe(99);
    });
    it("deduplicates identical poll states, not distinct submissions", () => {
        const input = { phase: "poll", upstreamTaskId: "upstream-1", state: "running" };
        const events = appendDiagnosticEvent(appendDiagnosticEvent([], input, 1), input, 2);
        expect(events).toHaveLength(1);
        expect(appendDiagnosticEvent(events, { ...input, state: "success" }, 3)).toHaveLength(2);
        expect(appendDiagnosticEvent(appendDiagnosticEvent([], { phase: "submit" }, 1), { phase: "submit" }, 2)).toHaveLength(2);
    });
    it("drops expired diagnostic events without touching task records", () => {
        expect(appendDiagnosticEvent([{ at: 0, phase: "submit" }], { phase: "response" }, 7 * 86400000 + 1)).toHaveLength(1);
    });
});

it("redacts provider errors while keeping timeout evidence", () => {
    const text = redactDiagnosticText("UND_ERR_HEADERS_TIMEOUT api_key=private Bearer abc https://user:pwd@host/path?token=xyz data:image/png;base64,abc");
    expect(text).toContain("UND_ERR_HEADERS_TIMEOUT");
    expect(text).not.toMatch(/private|abc|pwd|xyz/);
});
