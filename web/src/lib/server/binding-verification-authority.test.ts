import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), fingerprint: vi.fn(() => "fingerprint") }));
vi.mock("./binding-verification-store", () => ({ getBindingVerification: mocks.get }));
vi.mock("./binding-verification-policy", () => ({ bindingVerificationFingerprint: mocks.fingerprint }));
import { authorizeBindingVerificationProxy } from "./binding-verification-authority";
import type { AuthSettings } from "@/lib/auth/store";

describe("binding verification proxy authorization", () => {
    const admin = { id: "admin", role: "admin" as const, status: "active" as const, adminPermissions: ["upstream.manage" as const] };
    const settings: Pick<AuthSettings, "logicalModels" | "systemChannels"> = {
        systemChannels: [{ id: "channel", name: "c", baseUrl: "https://example.com", apiKey: "key", enabled: true, apiFormat: "openai", models: ["upstream"] }],
        logicalModels: [{ id: "model", name: "m", capability: "image", enabled: true, bindings: [{ id: "binding", channelId: "channel", upstreamModel: "upstream", enabled: false, priority: 1 }] }],
    };
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.get.mockResolvedValue({ id: "run", token: "secret", userId: "admin", channelId: "channel", logicalModelId: "model", bindingId: "binding", fingerprint: "fingerprint", status: "running", busyUntil: Date.now() + 10000 });
    });
    it("keeps shared binding disabled and returns one isolated binding", async () => {
        const snapshot = JSON.stringify(settings);
        const scoped = await authorizeBindingVerificationProxy(new Request("https://local.test", { headers: { "x-vozeb-binding-verification": "run:secret" } }), settings, admin, "channel");
        expect(scoped?.settings.logicalModels[0].bindings).toHaveLength(1);
        expect(scoped?.settings.logicalModels[0].bindings[0].enabled).toBe(true);
        expect(JSON.stringify(settings)).toBe(snapshot);
    });
    it.each([null, { ...admin, id: "other" }, { ...admin, adminPermissions: [] }])("rejects non-owner / non-admin %s", async (user) => {
        await expect(authorizeBindingVerificationProxy(new Request("https://local.test", { headers: { "x-vozeb-binding-verification": "run:secret" } }), settings, user, "channel")).rejects.toThrow();
    });
    it("rejects forged token", async () => {
        await expect(authorizeBindingVerificationProxy(new Request("https://local.test", { headers: { "x-vozeb-binding-verification": "run:forged" } }), settings, admin, "channel")).rejects.toThrow();
    });
    it("rejects altered configuration", async () => {
        mocks.fingerprint.mockReturnValueOnce("changed");
        await expect(authorizeBindingVerificationProxy(new Request("https://local.test", { headers: { "x-vozeb-binding-verification": "run:secret" } }), settings, admin, "channel")).rejects.toThrow("配置已改变");
    });
});
