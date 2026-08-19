import { describe, expect, it } from "vitest";

import { resolveGenerationExecutionPolicy } from "./generation-execution-policy";

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
});
