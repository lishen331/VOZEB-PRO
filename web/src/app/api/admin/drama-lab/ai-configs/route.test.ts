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

import { GET } from "./route";

describe("GET /api/admin/drama-lab/ai-configs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active" });
        mocks.hasAnyAdminPermission.mockReturnValue(true);
        mocks.getDatabaseProvider.mockReturnValue("postgres");
        mocks.ensurePostgresSchema.mockResolvedValue(undefined);
        mocks.postgresQuery.mockResolvedValue({
            rows: [
                {
                    id: "legacy-config",
                    name: "历史渠道",
                    provider: "legacy",
                    service_type: "text",
                    base_url: "https://legacy.example.test",
                    model: "legacy-model",
                    default_model: "legacy-model",
                    is_default: false,
                    is_active: true,
                    settings: { apiKey: "must-not-leak" },
                    created_at: "2026-09-01T00:00:00.000Z",
                    updated_at: "2026-09-01T00:00:00.000Z",
                    has_api_key: true,
                },
            ],
        });
    });

    it("does not expose legacy settings JSON that may contain credentials", async () => {
        const response = await GET();
        if (!response) throw new Error("Expected an authorization response");
        expect(response.status).toBe(200);
        const payload = await response.json();
        expect(payload.data[0]).toMatchObject({ id: "legacy-config", has_api_key: true });
        expect(payload.data[0]).not.toHaveProperty("settings");
        expect(mocks.postgresQuery.mock.calls[0][0]).not.toContain("settings");
    });
});
