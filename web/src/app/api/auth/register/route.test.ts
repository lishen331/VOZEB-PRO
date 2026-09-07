import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// This public endpoint is intentionally disabled after installation.
const mocks = vi.hoisted(() => ({
    checkAuthRateLimit: vi.fn(),
    createFirstAdmin: vi.fn(),
    createSession: vi.fn(),
    createUser: vi.fn(),
    getInstallStatus: vi.fn(),
    readJsonBody: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({
    createFirstAdmin: mocks.createFirstAdmin,
    createSession: mocks.createSession,
    createUser: mocks.createUser,
    isAuthInputError: vi.fn(() => false),
}));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readJsonBody }));
vi.mock("@/lib/auth/session", () => ({ serializeCurrentUser: vi.fn((user) => user), setSessionCookie: vi.fn() }));
vi.mock("@/lib/server/install-status", () => ({ getInstallStatus: mocks.getInstallStatus, invalidateInstallStatusCache: vi.fn() }));
vi.mock("@/lib/server/security", () => ({ checkAuthRateLimit: mocks.checkAuthRateLimit, getClientIp: vi.fn(() => "203.0.113.8") }));
vi.mock("@/lib/server/referral-service", () => ({ REFERRAL_COOKIE_NAME: "vozeb_referral" }));

import { POST } from "./route";

function registerRequest() {
    return new NextRequest("http://localhost/api/auth/register", { method: "POST" });
}

describe("POST /api/auth/register", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getInstallStatus.mockResolvedValue({ ready: true, firstAdminRequired: false });
        mocks.checkAuthRateLimit.mockResolvedValue({ allowed: true });
        mocks.createFirstAdmin.mockResolvedValue({ id: "admin-one", role: "admin" });
        mocks.createSession.mockResolvedValue("session-token");
        mocks.readJsonBody.mockResolvedValue({ username: "admin", password: "password123", installToken: "install-token" });
    });

    it("rejects every public self-service registration request", async () => {
        const response = await POST(registerRequest());

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "注册已关闭，请联系管理员创建账号" });
        expect(mocks.readJsonBody).not.toHaveBeenCalled();
        expect(mocks.createUser).not.toHaveBeenCalled();
    });

    it("preserves first-administrator installation", async () => {
        mocks.getInstallStatus.mockResolvedValue({ ready: false, firstAdminRequired: true });

        const response = await POST(registerRequest());

        expect(response.status).toBe(200);
        expect(mocks.createFirstAdmin).toHaveBeenCalledWith(expect.objectContaining({ username: "admin", installToken: "install-token" }));
        expect(mocks.createUser).not.toHaveBeenCalled();
    });
});
