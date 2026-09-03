import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    hasAnyAdminPermission: vi.fn(),
    getDatabaseProvider: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    postgresQuery: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/admin-permissions", () => ({ hasAnyAdminPermission: mocks.hasAnyAdminPermission }));
vi.mock("@/lib/server/database", () => ({
    getDatabaseProvider: mocks.getDatabaseProvider,
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    postgresQuery: mocks.postgresQuery,
}));

import { NextRequest } from "next/server";

import { GET } from "./route";

describe("GET /api/admin/drama-lab/prompt-templates", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active" });
        mocks.hasAnyAdminPermission.mockReturnValue(true);
        mocks.getDatabaseProvider.mockReturnValue("postgres");
        mocks.ensurePostgresSchema.mockResolvedValue(undefined);
        mocks.postgresQuery.mockResolvedValue({
            rows: [
                {
                    id: "legacy-blank",
                    template_key: "story_expansion_system",
                    name: "历史名称",
                    category: "script",
                    template: "   ",
                    variables: [],
                    created_at: "2026-09-01T00:00:00.000Z",
                    updated_at: "2026-09-01T00:00:00.000Z",
                },
            ],
        });
    });

    it("does not present a blank override as active customization", async () => {
        const response = await GET(new NextRequest("http://localhost/api/admin/drama-lab/prompt-templates"));
        if (!response) throw new Error("Expected an authorization response");
        expect(response.status).toBe(200);
        const payload = await response.json();
        const item = payload.data.find((entry: { template_key: string }) => entry.template_key === "story_expansion_system");
        expect(item).toMatchObject({ is_builtin: true, is_customized: false });
        expect(item.template).not.toBe("   ");
    });

    it("queries global overrides without an administrator filter", async () => {
        await GET(new NextRequest("http://localhost/api/admin/drama-lab/prompt-templates"));
        expect(mocks.postgresQuery.mock.calls[0][0]).not.toContain("user_id =");
    });
});
