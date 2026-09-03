import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    validate: vi.fn(),
}));

vi.mock("./school-content-reference-service", () => ({ validateSchoolContentReferences: mocks.validate }));

import { resolveTeachingSubmissionReferences } from "./school-submission-reference-service";

describe("school submission reference service", () => {
    beforeEach(() => {
        mocks.validate.mockReset();
    });

    it("resolves every submitted reference for the submitting student", async () => {
        const titles = { work: "文本作品", canvas: "画布", asset: "图片素材", generation: "生成结果" };
        mocks.validate.mockImplementation(async ({ references }: { references: Array<{ type: keyof typeof titles; id: string }> }) => [
            { reference: references[0], title: titles[references[0].type], previewUrl: references[0].type === "asset" ? "https://cdn.example.test/asset.png" : undefined },
        ]);

        const result = await resolveTeachingSubmissionReferences({
            ownerUserId: "student-user",
            schoolId: "school-a",
            references: [
                { type: "work", id: "work-a" },
                { type: "canvas", id: "canvas-a" },
                { type: "asset", id: "asset-a" },
                { type: "generation", id: "generation-a" },
            ],
        });

        expect(result).toHaveLength(4);
        expect(result.map((item) => item.title)).toEqual(["文本作品", "画布", "图片素材", "生成结果"]);
        expect(result.every((item) => item.availability === "available")).toBe(true);
        expect(mocks.validate).toHaveBeenCalledTimes(4);
    });

    it("keeps unavailable references while resolving the rest", async () => {
        mocks.validate.mockResolvedValueOnce([{ reference: { type: "asset", id: "asset-a" }, title: "海报", previewUrl: "https://cdn.example.test/poster.png" }]).mockRejectedValueOnce(Object.assign(new Error("成果不存在"), { status: 404 }));

        await expect(
            resolveTeachingSubmissionReferences({
                ownerUserId: "student-user",
                schoolId: "school-a",
                references: [
                    { type: "asset", id: "asset-a" },
                    { type: "work", id: "work-missing" },
                ],
            }),
        ).resolves.toEqual([
            {
                reference: { type: "asset", id: "asset-a" },
                title: "海报",
                kind: "asset",
                mediaType: "image",
                previewUrl: "https://cdn.example.test/poster.png",
                availability: "available",
            },
            {
                reference: { type: "work", id: "work-missing" },
                title: "成果不可用",
                kind: "work",
                mediaType: "unknown",
                availability: "unavailable",
                unavailableReason: "成果当前不存在或无权访问",
            },
        ]);
    });

    it("does not hide unexpected resolver failures", async () => {
        mocks.validate.mockRejectedValue(new Error("数据库暂不可用"));
        await expect(resolveTeachingSubmissionReferences({ ownerUserId: "student-user", schoolId: "school-a", references: [{ type: "asset", id: "asset-a" }] })).rejects.toThrow("数据库暂不可用");
    });
});
