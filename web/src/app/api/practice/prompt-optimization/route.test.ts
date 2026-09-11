import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    optimizeCreativePrompt: vi.fn(),
    checkGenerationRateLimit: vi.fn(),
    requirePracticeAccess: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ isAuthInputError: () => false }));
vi.mock("@/lib/server/internal-origin", () => ({ resolveInternalOrigin: (origin: string) => origin }));
vi.mock("@/lib/server/prompt-optimization-service", () => ({ optimizeCreativePrompt: mocks.optimizeCreativePrompt }));
vi.mock("@/lib/server/security", () => ({ checkGenerationRateLimit: mocks.checkGenerationRateLimit, rateLimitHeaders: () => new Headers() }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));

import { POST } from "./route";

describe("practice prompt optimization route", () => {
    beforeEach(() => {
        mocks.getCurrentUser.mockReset().mockResolvedValue({ id: "user-one" });
        mocks.optimizeCreativePrompt.mockReset().mockResolvedValue("免费练习提示词");
        mocks.checkGenerationRateLimit.mockReset().mockResolvedValue({ allowed: true });
        mocks.requirePracticeAccess.mockReset().mockResolvedValue({ schoolId: "school-one", membershipId: "member-one", role: "student" });
    });

    it("requires practice access and invokes the free execution profile", async () => {
        const response = await POST(request({ requestId: "practice-request", prompt: "练习原文", mode: "image" }));

        expect(response.status).toBe(200);
        expect(mocks.requirePracticeAccess).toHaveBeenCalledWith({ id: "user-one" });
        expect(mocks.optimizeCreativePrompt).toHaveBeenCalledWith(expect.objectContaining({ executionProfile: "open-source-practice" }));
    });

    it("rejects users without practice access before the model call", async () => {
        mocks.requirePracticeAccess.mockRejectedValueOnce(Object.assign(new Error("当前账号不是老师或学生"), { status: 403 }));

        const response = await POST(request({ requestId: "practice-request", prompt: "练习原文", mode: "image" }));

        expect(response.status).toBe(403);
        expect(mocks.optimizeCreativePrompt).not.toHaveBeenCalled();
    });
});

function request(body: unknown) {
    return new Request("http://localhost:3000/api/practice/prompt-optimization", { method: "POST", headers: { "content-type": "application/json", cookie: "session=1" }, body: JSON.stringify(body) });
}
