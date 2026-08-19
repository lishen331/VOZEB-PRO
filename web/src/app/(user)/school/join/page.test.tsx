import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("school invitation join page", () => {
    it("previews the school and role before the explicit join action", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/school/join/page.tsx"), "utf8");
        expect(source).toContain("schoolApi.previewInvite");
        expect(source).toContain("schoolApi.joinByInvite");
        expect(source).toContain("确认加入");
        expect(source).toContain("目标学校");
        expect(source).toContain("校内身份");
        expect(source).toContain("requestSequence");
        expect(source).toContain("joinByInvite(preview.code)");
        expect(source).not.toContain("localStorage");
    });
});
