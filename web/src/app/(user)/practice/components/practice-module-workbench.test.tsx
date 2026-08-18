import { describe, expect, it } from "vitest";

import { PRACTICE_MODULES, buildPracticeSessionInput, publicPracticeResult } from "./practice-module-workbench";

describe("practice module workbench contract", () => {
    it("sends only user content, public references and a fresh request id", () => {
        const input = buildPracticeSessionInput("script", "一场雨中的重逢", ["asset-1"]);
        expect(input).toMatchObject({ module: "script", title: "剧本练习", input: { prompt: "一场雨中的重逢" }, references: [{ type: "asset", id: "asset-1" }] });
        expect(input.clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
        expect(JSON.stringify(input)).not.toMatch(/provider|model|points|executionProfile|channel/i);
    });

    it("keeps public result metadata free of task and provider details", () => {
        expect(publicPracticeResult({ status: "success", taskId: "secret-task", model: "secret-model", result: { content: "完成" } })).toEqual({ status: "success", text: "完成" });
        expect(publicPracticeResult({ status: "error", taskId: "secret-task", error: "失败" })).toEqual({ status: "error", error: "失败" });
    });

    it("keeps all five modules in the same workbench contract", () => {
        expect(PRACTICE_MODULES).toHaveLength(5);
    });
});
