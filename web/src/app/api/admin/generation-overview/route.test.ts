import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getAdminGenerationOverviewSummary: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/generation-overview-service", () => ({ getAdminGenerationOverviewSummary: mocks.getAdminGenerationOverviewSummary }));

import { GET } from "./route";

describe("GET /api/admin/generation-overview", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["analytics.read"] });
        mocks.getAdminGenerationOverviewSummary.mockResolvedValue({ windowDays: 7, totalCalls: 0, dailyCalls: [] });
    });

    it("requires an administrator", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user", role: "user" });

        expect((await GET()).status).toBe(403);
        expect(mocks.getAdminGenerationOverviewSummary).not.toHaveBeenCalled();
    });

    it("allows the commerce duty to read the business overview", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "commerce-admin", role: "admin", status: "active", adminPermissions: ["commerce.manage"] });

        const response = await GET();

        expect(response.status).toBe(200);
        expect(mocks.getAdminGenerationOverviewSummary).toHaveBeenCalledTimes(1);
    });

    it("returns the lightweight overview contract", async () => {
        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { windowDays: 7, totalCalls: 0 }, msg: "OK" });
        expect(mocks.getAdminGenerationOverviewSummary).toHaveBeenCalledTimes(1);
    });
});
