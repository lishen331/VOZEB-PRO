import { describe, expect, it } from "vitest";

import { generationSubmissionResponseError, GenerationSubmissionSafeFailure, GenerationSubmissionUncertainError } from "./generation-submission-error";

describe("generation submission response error", () => {
    it("treats 451 as an explicit content-safety failure", () => {
        const error = generationSubmissionResponseError(451, "Unavailable For Legal Reasons");
        expect(error).toBeInstanceOf(GenerationSubmissionSafeFailure);
        expect(error.message).toBe("内容未通过安全审核：Unavailable For Legal Reasons");
    });

    it("keeps gateway errors uncertain", () => {
        expect(generationSubmissionResponseError(504, "Gateway Timeout")).toBeInstanceOf(GenerationSubmissionUncertainError);
    });
});
