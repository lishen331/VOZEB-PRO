import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { assertBindingVerificationSubmission } from "./binding-verification-authority";
import type { BindingVerificationRun } from "./binding-verification-store";
const base: BindingVerificationRun = {
    id: "run",
    userId: "u",
    logicalModelId: "m",
    bindingId: "b",
    channelId: "c",
    capability: "image",
    fingerprint: "fp",
    token: "secret",
    status: "running",
    phase: "submitting",
    createdAt: 1,
    updatedAt: 1,
    fixtureUrls: [],
};
it("accepts image content identity after conversion to multipart or base64", async () => {
    const bytes = Buffer.from("test image bytes");
    const url = "https://fixture.test/input.png";
    const run = { ...base, input: { prompt: "edit", references: [{ type: "image" as const, url }] }, referenceEvidence: [{ url, sha256: createHash("sha256").update(bytes).digest("hex") }] };
    const multipart = new FormData();
    multipart.append("image", new Blob([bytes], { type: "image/png" }), "input.png");
    await expect(assertBindingVerificationSubmission(run, multipart)).resolves.toMatchObject({ referenceCount: 1 });
    await expect(assertBindingVerificationSubmission(run, JSON.stringify({ image: `data:image/png;base64,${bytes.toString("base64")}` }))).resolves.toMatchObject({ referenceCount: 1 });
    await expect(assertBindingVerificationSubmission(run, JSON.stringify({ contents: [{ parts: [{ inlineData: { mimeType: "image/png", data: bytes.toString("base64") } }] }] }))).resolves.toMatchObject({ referenceCount: 1 });
    await expect(assertBindingVerificationSubmission(run, JSON.stringify({ prompt: url }))).rejects.toThrow("参考素材");
    const wrong = new FormData();
    wrong.append("image", new Blob(["wrong"], { type: "image/png" }), "wrong.png");
    await expect(assertBindingVerificationSubmission(run, wrong)).rejects.toThrow("参考素材");
});
it("checks every selected mixed reference rather than a fixed three-image count", async () => {
    const input = {
        prompt: "test",
        references: [
            { type: "image" as const, url: "https://fixture.test/i.png" },
            { type: "video" as const, url: "https://fixture.test/v.mp4" },
        ],
    };
    const run = { ...base, capability: "video" as const, input };
    await expect(assertBindingVerificationSubmission(run, JSON.stringify({ references: input.references, resolution: "480p", duration: 5 }))).resolves.toMatchObject({ referenceCount: 2 });
    await expect(assertBindingVerificationSubmission(run, JSON.stringify({ references: input.references.slice(0, 1), resolution: "480p", duration: 5 }))).rejects.toThrow("参考素材");
});
