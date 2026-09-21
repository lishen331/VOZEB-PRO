import { describe, expect, it, vi } from "vitest";
import {
    bindingVerificationFixtures,
    validateBindingVerificationMedia,
    publicBindingVerification,
    assertBindingVerificationVideoSpecification,
    BindingVerificationMediaSpecificationError,
    bindingReferenceContentDigest,
} from "./binding-verification-runner";
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
    it("retains actual metadata for the known ModelBay nominal-480p result without passing it", () => {
        const metadata = { mimeType: "video/mp4", width: 864, height: 496, durationSeconds: 5.062, bytes: 721881 };
        try {
            assertBindingVerificationVideoSpecification(metadata, 1 / 24);
            throw new Error("expected mismatch");
        } catch (error) {
            expect(error).toBeInstanceOf(BindingVerificationMediaSpecificationError);
            expect((error as BindingVerificationMediaSpecificationError).metadata).toEqual(metadata);
            expect((error as Error).message).toContain("禁止自动重提");
        }
    });
    it("accepts only the expected dimensions and duration tolerance", () => {
        const metadata = { mimeType: "video/mp4", width: 864, height: 480, durationSeconds: 5, bytes: 500 };
        expect(() => assertBindingVerificationVideoSpecification(metadata, 1 / 24)).not.toThrow();
        expect(() => assertBindingVerificationVideoSpecification({ ...metadata, durationSeconds: 8 }, 1 / 24)).toThrow(BindingVerificationMediaSpecificationError);
        expect(() => assertBindingVerificationVideoSpecification(metadata, Infinity)).toThrow(BindingVerificationMediaSpecificationError);
    });
    it("computes binary evidence from the actual image bytes rather than the source URL", () => {
        const a = bindingReferenceContentDigest("data:image/png;base64,YWJj");
        expect(a).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        expect(bindingReferenceContentDigest("data:image/jpeg;base64,YWJj")).toBe(a);
        expect(() => bindingReferenceContentDigest("https://example.test/image.png")).toThrow();
    });
});

it("publishes only system fixtures through external object storage URLs", async () => {
    const { publishVerificationFixtures } = await import("./binding-verification-runner");
    const registration = { storageProvider: "object" as const, externalObjectKey: "fixture.png" } as never;
    const dependencies = { write: vi.fn(async () => ({ token: "permanent/fixture.png" })) as never, registration: vi.fn(async () => registration) as never, externalUrl: vi.fn(async () => "https://oss.example/fixture.png") as never };
    await expect(publishVerificationFixtures([{ type: "image", url: "https://app.example/api/admin/binding-verifications/fixtures/0" }], "https://app.example", "user", dependencies)).resolves.toEqual([
        { type: "image", url: "https://oss.example/fixture.png" },
    ]);
    await expect(publishVerificationFixtures([{ type: "image", url: "https://user-cdn.example/image.png" }], "https://app.example", "user", dependencies)).resolves.toEqual([{ type: "image", url: "https://user-cdn.example/image.png" }]);
});
it("stops before provider submission when fixture storage is not external", async () => {
    const { publishVerificationFixtures } = await import("./binding-verification-runner");
    const dependencies = { write: vi.fn(async () => ({ token: "permanent/fixture.png" })) as never, registration: vi.fn(async () => ({ storageProvider: "local" })) as never };
    await expect(publishVerificationFixtures([{ type: "image", url: "https://app.example/api/admin/binding-verifications/fixtures/0" }], "https://app.example", "user", dependencies)).rejects.toThrow("OSS");
});
