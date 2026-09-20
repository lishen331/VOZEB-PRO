import { describe, expect, it } from "vitest";
import { bindingVerificationFixtures, validateBindingVerificationMedia, publicBindingVerification } from "./binding-verification-runner";
import { withBindingVerificationScope, bindingVerificationRequestHeaders } from "./binding-verification-authority";
describe("binding verification isolation", () => {
    it("does not attach authority outside the server scope", () => {
        expect(bindingVerificationRequestHeaders("http://localhost/api/ai/system/a/images/edits", {}).has("x-vozeb-binding-verification")).toBe(false);
    });
    it("attaches authority only to the exact local channel proxy", async () => {
        await withBindingVerificationScope({ id: "run", token: "secret", channelId: "a", origin: "http://localhost" }, async () => {
            expect(bindingVerificationRequestHeaders("http://localhost/api/ai/system/a/images/edits", {}).get("x-vozeb-binding-verification")).toBe("run:secret");
            expect(bindingVerificationRequestHeaders("https://evil.test/api/ai/system/a/images/edits", {}).has("x-vozeb-binding-verification")).toBe(false);
            expect(bindingVerificationRequestHeaders("http://localhost/api/ai/system/b/images/edits", {}).has("x-vozeb-binding-verification")).toBe(false);
        });
    });
    it("provides three distinct real PNG fixtures", async () => {
        const fixtures = await bindingVerificationFixtures();
        expect(fixtures).toHaveLength(3);
        expect(new Set(fixtures.map((b) => b.toString("base64"))).size).toBe(3);
        for (const b of fixtures) expect(b.subarray(1, 4).toString()).toBe("PNG");
    });
    it("rejects HTML disguised as an image", async () => {
        await expect(validateBindingVerificationMedia(Buffer.from("<html>not image</html>"), "image")).rejects.toThrow();
    });
    it("does not expose authority", () => {
        const r = publicBindingVerification({
            id: "r",
            status: "running",
            phase: "submitting",
            token: "secret",
            fingerprint: "fp",
            userId: "u",
            taskId: "t",
            createdAt: 1,
            updatedAt: 1,
            logicalModelId: "m",
            bindingId: "b",
            channelId: "c",
            capability: "text",
            fixtureUrls: [],
        });
        expect(r).not.toHaveProperty("token");
        expect(r).not.toHaveProperty("fingerprint");
    });
});
