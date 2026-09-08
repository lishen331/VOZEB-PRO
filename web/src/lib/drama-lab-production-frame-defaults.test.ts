import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { dramaLabPromptDefinition, type DramaLabCanonicalPromptKey } from "./drama-lab-prompt-templates";

// Hashes captured from production L promptI18n getters (not its abbreviated admin bodies).
const expected = {
    first_frame_prompt: "eec72602dbf9940750bfbdbbf2316858bf443ac356fd6d28739b4c8508df6c41",
    key_frame_prompt: "568e13df487fbe5f7e936f36450999fddf71dbcc68ee06a354814cbf25e7172e",
    last_frame_prompt: "6d2decce4b414b52bd3572af3df5b341e6d9cc8e161b26833f70d6c914310001",
};
describe("production L complete frame defaults", () => {
    it.each(Object.entries(expected))("preserves the actual %s runtime template verbatim", (key, digest) => {
        expect(
            createHash("sha256")
                .update(dramaLabPromptDefinition(key as DramaLabCanonicalPromptKey).template)
                .digest("hex"),
        ).toBe(digest);
    });
});
