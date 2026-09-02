import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getDatabaseProvider: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    hasAnyAdminPermission: vi.fn(),
    readJsonBody: vi.fn(),
    postgresQuery: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/admin-permissions", () => ({ hasAnyAdminPermission: mocks.hasAnyAdminPermission }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readJsonBody }));
vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    getDatabaseProvider: mocks.getDatabaseProvider,
    postgresQuery: mocks.postgresQuery,
}));

import { NextRequest } from "next/server";

import { PUT } from "./route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("PUT /api/admin/drama-lab/prompt-templates/[id]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-two", role: "admin", status: "active" });
        mocks.getDatabaseProvider.mockReturnValue("postgres");
        mocks.ensurePostgresSchema.mockResolvedValue(undefined);
        mocks.hasAnyAdminPermission.mockReturnValue(true);
        mocks.readJsonBody.mockResolvedValue({ template: "CUSTOM PROMPT" });
        mocks.postgresQuery.mockResolvedValue({
            rows: [
                {
                    id: "tpl-existing",
                    template_key: "story_expansion_system",
                    name: "Story expansion",
                    category: "script",
                    template: "CUSTOM PROMPT",
                    variables: [],
                    created_at: "2026-09-02T00:00:00.000Z",
                    updated_at: "2026-09-02T00:00:00.000Z",
                },
            ],
        });
    });

    it("uses one atomic UPSERT for a canonical global template", async () => {
        const response = await PUT(new NextRequest("http://localhost/api/admin/drama-lab/prompt-templates/story_expansion_system", { method: "PUT" }), context("story_expansion_system"));

        if (!response) throw new Error("PUT handler did not return a response");
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { id: "story_expansion_system", template_key: "story_expansion_system", is_builtin: true, is_customized: true } });
        expect(mocks.postgresQuery).toHaveBeenCalledOnce();
        const [statement, values] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(statement).toContain("ON CONFLICT (template_key)");
        expect(statement).toContain("WHERE deleted_at IS NULL AND template_key IS NOT NULL");
        expect(statement).toContain("DO UPDATE SET template = EXCLUDED.template");
        expect(values[1]).toBe("admin-two");
        expect(values[2]).toBe("story_expansion_system");
        expect(values[5]).toBe("CUSTOM PROMPT");
    });

    it("canonicalizes the legacy story_generation key before the UPSERT", async () => {
        mocks.postgresQuery.mockResolvedValueOnce({
            rows: [{ id: "tpl-existing", template_key: "story_expansion_system", template: "LEGACY PROMPT" }],
        });

        const response = await PUT(new NextRequest("http://localhost/api/admin/drama-lab/prompt-templates/story_generation", { method: "PUT" }), context("story_generation"));

        if (!response) throw new Error("PUT handler did not return a response");
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { id: "story_generation", template_key: "story_expansion_system" } });
        const [, values] = mocks.postgresQuery.mock.calls[0] as [string, unknown[]];
        expect(values[2]).toBe("story_expansion_system");
    });

    it("rejects an empty template without touching the database", async () => {
        mocks.readJsonBody.mockResolvedValue({ template: "   " });

        const response = await PUT(new NextRequest("http://localhost/api/admin/drama-lab/prompt-templates/story_expansion_system", { method: "PUT" }), context("story_expansion_system"));

        if (!response) throw new Error("PUT handler did not return a response");
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ code: 400 });
        expect(mocks.postgresQuery).not.toHaveBeenCalled();
    });
});
