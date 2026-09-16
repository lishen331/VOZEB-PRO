import { describe, expect, it } from "vitest";

import { hasUntrustedWorkflowContext, isTrustedPracticeTaskRequest, resolveGenerationExecutionPolicy, trustedPracticeTaskHeaders } from "./generation-execution-policy";

describe("generation execution policy", () => {
    it("keeps production as the default billed profile", () => {
        expect(resolveGenerationExecutionPolicy({})).toEqual({ profile: "production", billingMode: "points", channelPurpose: "production", allowPractice: false, countsTowardConcurrency: true });
    });

    it("allows trusted practice tasks without point consumption but keeps resource guards", () => {
        expect(resolveGenerationExecutionPolicy({ executionProfile: "open-source-practice", trustedPracticeContext: true })).toEqual({
            profile: "open-source-practice",
            billingMode: "none",
            channelPurpose: "open-source-practice",
            allowPractice: true,
            countsTowardConcurrency: true,
        });
        expect(resolveGenerationExecutionPolicy({ executionProfile: "open-source-practice", trustedPracticeContext: true, retryingSameTask: true }).countsTowardConcurrency).toBe(true);
    });

    it("rejects a public request that tries to forge the practice profile", () => {
        expect(() => resolveGenerationExecutionPolicy({ executionProfile: "open-source-practice" })).toThrow("练习执行档案");
    });

    it("rejects a practice task routed to a production-only channel", () => {
        expect(() => resolveGenerationExecutionPolicy({ executionProfile: "open-source-practice", trustedPracticeContext: true, channelPurpose: "production" })).toThrow("渠道用途");
    });

    it("marks all client workflow selectors as untrusted context", () => {
        expect(hasUntrustedWorkflowContext({ context: { workflowKey: "wf", workflowVersion: 1, businessCode: "script", taskOrigin: "user" } })).toBe(true);
        expect(hasUntrustedWorkflowContext({ context: { surface: "canvas", projectId: "canvas-1" } })).toBe(false);
    });

    it("binds trusted practice task signatures to the school scope", () => {
        const headers = trustedPracticeTaskHeaders("user-1", "school-a", "request-1");
        const request = new Request("http://localhost/api/image-tasks", { headers });

        expect(isTrustedPracticeTaskRequest(request, "user-1", { executionProfile: "open-source-practice", schoolId: "school-a", clientRequestId: "request-1" })).toBe(true);
        expect(isTrustedPracticeTaskRequest(request, "user-1", { executionProfile: "open-source-practice", schoolId: "school-b", clientRequestId: "request-1" })).toBe(false);
        expect(isTrustedPracticeTaskRequest(request, "user-1", { executionProfile: "open-source-practice", clientRequestId: "request-1" })).toBe(false);
    });
});
