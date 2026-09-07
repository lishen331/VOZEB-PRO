import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as null | { id: string; role: string; status: string; adminPermissions: string[] }, write: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => state.user) }));
vi.mock("@/lib/server/login-page-media", () => ({
    LoginPageMediaError: class LoginPageMediaError extends Error {
        status = 400;
    },
    writeLoginPageMedia: state.write,
}));

import { POST } from "./route";

describe("POST /api/admin/login-page-media", () => {
    afterEach(() => {
        state.user = null;
        state.write.mockReset();
    });
    it("requires system management permission", async () => {
        expect((await POST(request())).status).toBe(401);
        state.user = { id: "admin", role: "admin", status: "active", adminPermissions: [] };
        expect((await POST(request())).status).toBe(403);
    });
    it("returns the stored public URL", async () => {
        state.user = { id: "admin", role: "admin", status: "active", adminPermissions: ["system.manage"] };
        state.write.mockResolvedValue({ url: "/api/login-page-media/hero-poster.webp" });
        const response = await POST(request());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: "/api/login-page-media/hero-poster.webp" });
    });
});
function request() {
    const form = new FormData();
    form.set("kind", "heroPosterUrl");
    form.set("file", new File(["image"], "poster.webp", { type: "image/webp" }));
    return new Request("http://localhost/api/admin/login-page-media", { method: "POST", body: form });
}
