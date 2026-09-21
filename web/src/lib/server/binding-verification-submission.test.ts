import { describe, it, expect } from "vitest";
import { assertBindingVerificationSubmission } from "./binding-verification-authority";
import type { BindingVerificationRun } from "./binding-verification-store";
const run: BindingVerificationRun = {
    id: "r",
    userId: "u",
    logicalModelId: "m",
    bindingId: "b",
    channelId: "c",
    capability: "video",
    fingerprint: "f",
    token: "t",
    status: "running",
    phase: "submitting",
    createdAt: 1,
    updatedAt: 1,
    fixtureUrls: ["https://site.test/a.png", "https://site.test/b.png", "https://site.test/c.png"],
};
describe("binding verification wire evidence", () => {
    it("rejects adapters which drop two video references", async () => {
        await expect(assertBindingVerificationSubmission(run, JSON.stringify({ images: run.fixtureUrls.slice(0, 1), seconds: 5, resolution: "480p" }))).rejects.toThrow("参考素材");
    });
    it("rejects silently modified video parameters", async () => {
        await expect(assertBindingVerificationSubmission(run, JSON.stringify({ images: run.fixtureUrls, seconds: 8, resolution: "720p" }))).rejects.toThrow("480p");
    });
    it("accepts exact three-reference 480p 5s evidence", async () => {
        await expect(assertBindingVerificationSubmission(run, JSON.stringify({ images: run.fixtureUrls, seconds: 5, resolution: "480p" }))).resolves.toEqual(expect.objectContaining({ referenceCount: 3, durationSeconds: 5, resolution: "480p" }));
    });
});
