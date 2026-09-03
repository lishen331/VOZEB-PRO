import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), hasAnyAdminPermission: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/admin-permissions", () => ({ hasAnyAdminPermission: mocks.hasAnyAdminPermission }));

import { NextRequest } from "next/server";

import { POST } from "./route";

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("POST /api/admin/drama-lab/ai-configs/[id]/test", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active" });
        mocks.hasAnyAdminPermission.mockReturnValue(true);
    });

    it("does not report a fake success for an unconnected compatibility config", async () => {
        const started = Date.now();
        const response = await POST(new NextRequest("http://localhost/api/admin/drama-lab/ai-configs/legacy/test", { method: "POST" }), context("legacy"));

        expect(response.status).toBe(410);
        expect(await response.json()).toMatchObject({ code: 410, data: null });
        expect(Date.now() - started).toBeLessThan(500);
    });

    it("still enforces admin authentication before exposing the compatibility status", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await POST(new NextRequest("http://localhost/api/admin/drama-lab/ai-configs/legacy/test", { method: "POST" }), context("legacy"));

        expect(response.status).toBe(401);
    });

    it("keeps the compatibility endpoint retired even when the legacy id is empty", async () => {
        const response = await POST(new NextRequest("http://localhost/api/admin/drama-lab/ai-configs//test", { method: "POST" }), context(""));

        expect(response.status).toBe(410);
        expect(await response.json()).toMatchObject({ code: 410, data: null });
    });
});
