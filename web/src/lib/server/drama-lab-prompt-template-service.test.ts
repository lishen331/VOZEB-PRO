import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getDatabaseProvider: vi.fn(),
    postgresQuery: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    getDatabaseProvider: mocks.getDatabaseProvider,
    postgresQuery: mocks.postgresQuery,
}));

import { resolveDramaLabPrompt } from "./drama-lab-prompt-template-service";

describe("Drama Lab prompt resolution", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getDatabaseProvider.mockReturnValue("postgres");
    });

    it("resolves a single global override without an administrator filter", async () => {
        mocks.postgresQuery.mockResolvedValue({ rows: [{ id: "template-one", template_key: "story_expansion_system", template: "GLOBAL OVERRIDE" }] });

        const prompt = await resolveDramaLabPrompt("story_generation");

        expect(prompt.template).toBe("GLOBAL OVERRIDE");
        expect(prompt.customized).toBe(true);
        expect(mocks.postgresQuery).toHaveBeenCalledWith(expect.stringContaining("ORDER BY updated_at DESC, id DESC"), ["story_expansion_system"]);
        expect(mocks.postgresQuery.mock.calls[0][0]).not.toContain("user_id");
    });

    it("falls back to the built-in definition when the global override is blank", async () => {
        mocks.postgresQuery.mockResolvedValue({ rows: [{ id: "template-one", template_key: "story_expansion_system", template: "   " }] });

        const prompt = await resolveDramaLabPrompt("story_expansion_system");

        expect(prompt.customized).toBe(false);
        expect(prompt.template).toContain("专业的编剧");
    });
});
