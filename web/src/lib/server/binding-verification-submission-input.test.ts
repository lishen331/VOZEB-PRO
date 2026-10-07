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

it("matches an OpenAI video input_reference multipart part to the selected source after image re-encoding", async () => {
    const sourceBytes = Buffer.from("the selected original image bytes");
    const transformedBytes = Buffer.from("adapter resized and re-encoded image bytes");
    const url = "https://fixture.test/selected.png";
    const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
    const run: BindingVerificationRun = {
        ...base,
        capability: "video",
        input: { prompt: "animate this", references: [{ type: "image", url }] },
        referenceEvidence: [{ url, sha256: sourceSha256 }],
    };
    const form = new FormData();
    form.set("seconds", "5");
    form.set("size", "854x480");
    form.set("resolution", "480p");
    form.append("input_reference", new Blob([transformedBytes], { type: "image/jpeg" }), `input-reference-${sourceSha256}.jpg`);

    await expect(assertBindingVerificationSubmission(run, form)).resolves.toMatchObject({ referenceCount: 1 });
});

it("does not accept a mismatched or missing multipart source marker just because an image file exists", async () => {
    const sourceBytes = Buffer.from("the selected original image bytes");
    const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
    const url = "https://fixture.test/selected.png";
    const run: BindingVerificationRun = {
        ...base,
        capability: "video",
        input: { prompt: "animate this", references: [{ type: "image", url }] },
        referenceEvidence: [{ url, sha256: sourceSha256 }],
    };
    const wrongDigest = createHash("sha256").update("another source").digest("hex");
    const wrong = new FormData();
    wrong.set("seconds", "5");
    wrong.set("size", "854x480");
    wrong.set("resolution", "480p");
    wrong.append("input_reference", new Blob(["some image"], { type: "image/jpeg" }), `input-reference-${wrongDigest}.jpg`);
    await expect(assertBindingVerificationSubmission(run, wrong)).rejects.toThrow("参考素材");

    const unmarked = new FormData();
    unmarked.set("seconds", "5");
    unmarked.set("size", "854x480");
    unmarked.set("resolution", "480p");
    unmarked.append("input_reference", new Blob(["re-encoded but without provenance marker"], { type: "image/jpeg" }), "input-reference.jpg");
    await expect(assertBindingVerificationSubmission(run, unmarked)).rejects.toThrow("参考素材");
});

it("requires one multipart source marker per selected image instead of reusing one file identity", async () => {
    const sourceBytes = Buffer.from("same selected source");
    const sha256 = createHash("sha256").update(sourceBytes).digest("hex");
    const first = "https://fixture.test/first.png";
    const second = "https://fixture.test/second.png";
    const run: BindingVerificationRun = {
        ...base,
        capability: "video",
        input: {
            prompt: "animate both",
            references: [
                { type: "image", url: first },
                { type: "image", url: second },
            ],
        },
        referenceEvidence: [
            { url: first, sha256 },
            { url: second, sha256 },
        ],
    };
    const form = new FormData();
    form.set("seconds", "5");
    form.set("size", "854x480");
    form.set("resolution", "480p");
    form.append("input_reference", new Blob(["transformed once"], { type: "image/jpeg" }), `input-reference-${sha256}.jpg`);
    await expect(assertBindingVerificationSubmission(run, form)).rejects.toThrow("2 个参考素材");
});

it("accepts the real OpenAI multipart size field as 480p and its normalized 8s duration", async () => {
    const sourceBytes = Buffer.from("selected OpenAI multipart source image");
    const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
    const url = "https://fixture.test/openai-source.png";
    const run: BindingVerificationRun = {
        ...base,
        capability: "video",
        input: { prompt: "animate this", references: [{ type: "image", url }] },
        referenceEvidence: [{ url, sha256: sourceSha256 }],
        diagnostics: { requestedDurationSeconds: 5, durationSeconds: 8 },
    };
    const form = new FormData();
    form.set("seconds", "8");
    form.set("size", "854x480");
    form.append("input_reference", new Blob(["re-encoded selected image"], { type: "image/jpeg" }), `input-reference-${sourceSha256}.jpg`);

    await expect(assertBindingVerificationSubmission(run, form)).resolves.toMatchObject({ referenceCount: 1, durationSeconds: 8, resolution: "480p" });
});
