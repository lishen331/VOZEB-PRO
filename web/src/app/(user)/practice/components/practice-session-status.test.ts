import { describe, expect, it } from "vitest";

import { practiceSessionPreview, practiceSessionStatusLabel, PRACTICE_SESSION_STATUS_LABELS } from "./practice-session-status";

describe("practice session status", () => {
    it("maps every persisted status without a processing fallback", () => {
        expect(Object.keys(PRACTICE_SESSION_STATUS_LABELS)).toHaveLength(6);
        expect(practiceSessionStatusLabel({ status: "queued" })).toBe("排队中");
        expect(practiceSessionStatusLabel({ status: "running" })).toBe("生成中");
        expect(practiceSessionStatusLabel({ status: "failed" })).toBe("失败");
    });

    it("summarizes public text and media results", () => {
        expect(practiceSessionPreview({ module: "script", input: { content: "场景一" }, result: undefined })).toBe("场景一");
        expect(practiceSessionPreview({ module: "music", input: { prompt: "雨夜" }, result: { status: "success", media: { kind: "audio", url: "/audio.mp3" } } })).toBe("音频结果");
    });
});
