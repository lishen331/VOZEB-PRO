import { describe, expect, it } from "vitest";
import { planBindingVerification, nextVerificationAction, planBindingVerificationTemplate } from "./binding-verification-plan";
describe("cost-controlled binding verification", () => {
    it("uses a single mixed submission when its mappings are confirmed", () => {
        expect(planBindingVerification("video", { image: true, video: true, mixed: true, maxImages: 2 })).toEqual({ mode: "mixed", imageCount: 2, videoCount: 1, outputCount: 1, resolution: "480p", durationSeconds: 5 });
    });
    it("does not infer mixed support from separate capability flags", () => {
        expect(planBindingVerification("video", { image: true, video: true, mixed: false, maxImages: 2 }).mode).toBe("video-reference");
    });
    it("does not force three references on text-only video", () => {
        expect(planBindingVerification("video", {}).imageCount).toBe(0);
    });
    it("limits image verification to one output", () => {
        expect(planBindingVerification("image", { image: true, maxImages: 1 })).toMatchObject({ mode: "single-image", imageCount: 1, videoCount: 0, outputCount: 1 });
    });
    it("stops after success and never resubmits unknown or accepted tasks", () => {
        expect(nextVerificationAction({ status: "success" })).toBe("stop");
        expect(nextVerificationAction({ status: "unknown" })).toBe("review");
        expect(nextVerificationAction({ status: "failed", taskId: "upstream" })).toBe("review");
    });
    it("requires explicit non-billable rejection before offering another mode", () => {
        expect(nextVerificationAction({ status: "failed", rejection: "unsupported-reference", billable: false })).toBe("offer-fallback");
        expect(nextVerificationAction({ status: "failed", rejection: "unsupported-reference" })).toBe("review");
        expect(nextVerificationAction({ status: "failed", rejection: "authentication", billable: false })).toBe("stop");
    });
});

describe("template-based candidate planning", () => {
    it("understands first and last frames from JSON values", () => {
        expect(planBindingVerificationTemplate("video", '{"first":"{{first_frame_url}}","last":"{{last_frame_url}}"}')).toMatchObject({ imageCount: 2, videoCount: 0 });
    });
    it("requires declared input support for generic containers", () => {
        expect(planBindingVerificationTemplate("video", '{"content":"{{content}}"}')).toMatchObject({ imageCount: 0, videoCount: 0 });
        expect(planBindingVerificationTemplate("video", '{"references":"{{references}}"}', { supportsReferenceImage: true })).toMatchObject({ imageCount: 1, videoCount: 0 });
        expect(planBindingVerificationTemplate("video", '{"content":"{{content}}"}', { supportsReferenceImage: true, supportsReferenceVideo: true })).toMatchObject({ imageCount: 0, videoCount: 1 });
        expect(planBindingVerificationTemplate("video", '{"content":"{{content}}"}', { supportsReferenceImage: true, supportsReferenceVideo: true, supportsMixedReference: true, maxReferenceImages: 2 })).toMatchObject({ imageCount: 2, videoCount: 1 });
    });
    it("recognizes multimodal text messages only with image evidence", () => {
        expect(planBindingVerificationTemplate("text", '{"messages":"{{messages}}"}', { supportsReferenceImage: true })).toMatchObject({ imageCount: 1, videoCount: 0 });
    });
    it("does not treat literal keys, prose, or invalid JSON as executable mappings", () => {
        expect(planBindingVerificationTemplate("video", '{"{{videos}}":"ignored","prompt":"look at {{images}}"}')).toMatchObject({ imageCount: 0, videoCount: 0 });
        expect(() => planBindingVerificationTemplate("video", "not json")).toThrow("尚未发起生成");
    });
    it("honors explicit negative capability evidence even when mappings exist", () => {
        expect(planBindingVerificationTemplate("video", '{"images":"{{images}}","videos":"{{videos}}"}', { supportsReferenceVideo: false })).toMatchObject({ imageCount: 2, videoCount: 0 });
    });
});
