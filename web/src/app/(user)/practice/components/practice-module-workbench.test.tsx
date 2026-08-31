import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { IpReference } from "@/lib/ip-library-domain";
import { PRACTICE_MODULES, buildPracticeSessionInput, editablePracticeTextReducer, publicPracticeResult } from "./practice-module-workbench";

describe("practice module workbench contract", () => {
    it("sends only user content, public references and a fresh request id", () => {
        const input = buildPracticeSessionInput("script", "一场雨中的重逢", ["asset-1"]);
        expect(input).toMatchObject({ module: "script", title: "剧本练习", input: { prompt: "一场雨中的重逢" }, references: [{ type: "asset", id: "asset-1" }] });
        expect(input.clientRequestId).toMatch(/^[0-9a-f-]{36}$/i);
        expect(JSON.stringify(input)).not.toMatch(/provider|model|points|executionProfile|channel/i);
    });

    it("submits stable IP versions together with ordinary asset references", () => {
        const reference: IpReference = { type: "ip", id: "ip-one", versionId: "version-two", itemIds: ["item-three"] };

        expect(buildPracticeSessionInput("music", "雨夜配乐", ["asset-1"], [reference]).references).toEqual([{ type: "asset", id: "asset-1" }, reference]);
    });

    it("keeps the IP picker code dormant behind the shared entry flag", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/components/practice-module-workbench.tsx"), "utf8");

        expect(source).toContain("IP_REFERENCE_ENTRY_VISIBLE ? (");
        expect(source).toContain("<IpReferencePicker");
    });

    it("keeps public result metadata free of task and provider details", () => {
        expect(publicPracticeResult({ status: "success", taskId: "secret-task", model: "secret-model", result: { content: "完成" } })).toEqual({ status: "success", text: "完成" });
        expect(publicPracticeResult({ status: "error", taskId: "secret-task", error: "失败" })).toEqual({ status: "error", error: "失败" });
    });

    it("keeps all five modules in the same workbench contract", () => {
        expect(PRACTICE_MODULES).toHaveLength(5);
    });

    it("keeps generated script text editable until another result is selected", () => {
        expect(editablePracticeTextReducer("初稿", { type: "edit", value: "人工修改稿" })).toBe("人工修改稿");
        expect(editablePracticeTextReducer("人工修改稿", { type: "replace", value: "另一份结果" })).toBe("另一份结果");
    });
});
