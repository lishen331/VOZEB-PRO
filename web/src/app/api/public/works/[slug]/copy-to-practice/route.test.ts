import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), copy: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/public-work-process-service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/public-work-process-service")>()),
    copyPublicWorkToPractice: mocks.copy,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ slug: "publicwork123" }) };

describe("POST /api/public/works/[slug]/copy-to-practice", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "student-one", role: "user", status: "active" });
        mocks.copy.mockResolvedValue({ kind: "canvas", projectId: "practice-one", clientRequestId: "request-one" });
    });

    it("requires login and never accepts a caller-selected version or provider", async () => {
        mocks.currentUser.mockResolvedValueOnce(null);
        expect((await POST(new Request("http://localhost/api/public/works/publicwork123/copy-to-practice", { method: "POST", body: "{}" }), context)).status).toBe(401);

        const response = await POST(
            new Request("http://localhost/api/public/works/publicwork123/copy-to-practice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientRequestId: "request-one", kind: "canvas", versionId: "forged-version", provider: "forged-provider", executionProfile: "production" }),
            }),
            context,
        );

        expect(response.status).toBe(200);
        expect(mocks.copy).toHaveBeenCalledWith(expect.objectContaining({ id: "student-one" }), "publicwork123", "request-one", "canvas");
        expect(JSON.stringify(mocks.copy.mock.calls[0])).not.toMatch(/forged-version|forged-provider|production/);
    });

    it("returns the same project when an idempotent request is retried", async () => {
        const request = () =>
            new Request("http://localhost/api/public/works/publicwork123/copy-to-practice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientRequestId: "request-one", kind: "canvas" }),
            });
        const first = await POST(request(), context);
        const second = await POST(request(), context);
        expect((await first.json()).data.projectId).toBe("practice-one");
        expect((await second.json()).data.projectId).toBe("practice-one");
        expect(mocks.copy).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: "student-one" }), "publicwork123", "request-one", "canvas");
    });
});
