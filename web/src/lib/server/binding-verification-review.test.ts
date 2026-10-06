import { describe, expect, it } from "vitest";
import { reviewBindingVerification } from "./binding-verification-review";
const run = { id: "r", userId: "u", status: "needs_review", phase: "needs_review", busyUntil: 0, result: { url: "/media/video.mp4" }, diagnostics: { requestDigest: "digest", specificationMismatch: true }, error: "resolution mismatch" } as const;
describe("manual verification decisions", () => {
    it("accepts an existing result without pretending its specification matched", () => {
        const next = reviewBindingVerification(run, "accept-result", "u", true);
        expect(next.status).toBe("passed");
        expect(next.diagnostics.specificationMismatch).toBe(true);
        expect(next.error).toBe("resolution mismatch");
        expect(next.diagnostics.manualReview.action).toBe("accept-result");
    });
    it("requires explicit consent and ownership", () => {
        expect(() => reviewBindingVerification(run, "accept-result", "u", false)).toThrow();
        expect(() => reviewBindingVerification(run, "accept-result", "other", true)).toThrow();
    });
    it("cannot accept failed or missing results", () => {
        expect(() => reviewBindingVerification({ ...run, result: undefined }, "accept-result", "u", true)).toThrow();
        expect(() => reviewBindingVerification({ ...run, status: "failed" }, "accept-result", "u", true)).toThrow();
    });
    it("releases a retry lock without deleting the old task or claiming cancellation", () => {
        const next = reviewBindingVerification({ ...run, status: "running" }, "allow-retry", "u", true);
        expect(next.status).toBe("running");
        expect(next.diagnostics.retryAuthorized).toBe(true);
        expect(next.result).toEqual(run.result);
    });
});
