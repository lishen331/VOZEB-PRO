import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReversePromptHistoryRecord } from "@/lib/practice-reverse-prompt-history";
import { restoreReversePromptHistoryView } from "./practice-reverse-prompt-history-drawer";
import { PracticeReversePromptTrial } from "./practice-reverse-prompt-trial";

const record: ReversePromptHistoryRecord = {
    id: "analysis-fixture",
    createdAt: 1_791_000_000_000,
    updatedAt: 1_791_000_000_001,
    sourceUrl: "/api/reference-assets/permanent/history/original.png",
    analysisMode: "style",
    extraRequirement: "关注光线",
    analysisText: "林间玻璃温室，暖色晨光",
};

const trial = {
    taskId: "trial-fixture",
    prompt: "玻璃温室，逆光",
    image: { url: "/api/reference-assets/permanent/history/result.png", storageKey: "permanent/history/result.png", width: 512, height: 512, bytes: 1024, mimeType: "image/png" },
};

function renderTrial(restoredTrial?: ReversePromptHistoryRecord["trial"], restoredStatus?: ReversePromptHistoryRecord["trialStatus"]) {
    return renderToStaticMarkup(<PracticeReversePromptTrial initialPrompt={record.analysisText} historyId={record.id} restoredTrial={restoredTrial} restoredStatus={restoredStatus} blocked={false} onBusyChange={() => {}} onDraftDirtyChange={() => {}} />);
}

describe("reverse prompt workbench restoration", () => {
    it("restores the original, input settings and exact historical analysis for the study deck", () => {
        const restored = restoreReversePromptHistoryView(record);
        expect(restored.source?.url).toBe(record.sourceUrl);
        expect(restored.mode).toBe("style");
        expect(restored.extraRequirement).toBe("关注光线");
        expect(restored.result).toEqual({ taskId: record.id, text: record.analysisText });
    });

    it("keeps readable text when the source is missing or not managed", () => {
        for (const sourceUrl of [undefined, "https://example.com/unmanaged-source.png"]) {
            const restored = restoreReversePromptHistoryView({ ...record, sourceUrl, analysisMode: "unrecognized" });
            expect(restored.source).toBeNull();
            expect(restored.mode).toBe("general");
            expect(restored.result.text).toBe(record.analysisText);
        }
    });

    it("pairs the image with the exact successful trial prompt even after a newer failure", () => {
        const html = renderTrial(trial, "failed");
        expect(html).toContain("玻璃温室，逆光");
        expect(html).toContain("result.png");
        expect(html).toContain("保留上次成功结果");
        expect(html).not.toContain(record.analysisText);
    });

    it("restores the full analysis prompt and an empty image area when no trial succeeded", () => {
        const html = renderTrial(undefined, "pending");
        expect(html).toContain(record.analysisText);
        expect(html).toContain("待确认");
        expect(html).toMatch(/<button[^>]*disabled[^>]*>.*?生成一张.*?<\/button>/);
        expect(html).not.toContain("result.png");
        expect(html).not.toContain('试生成结果"');
    });
});
