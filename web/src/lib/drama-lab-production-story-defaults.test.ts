import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { dramaLabPromptDefinition, type DramaLabCanonicalPromptKey } from "./drama-lab-prompt-templates";
const hashes = {
    story_expansion_system: "2033118480cb19668a78962ed9ce5eff8238a4422be5975c601911e0b02c9bf1",
    storyboard_system: "02de810b6bbc732740837a2ee4ff722ee24655482d38d866d0b1493d0711446f",
    storyboard_user_suffix: "88945cebf726742b527f4e54f9345995bd7900dd8171ebc1b55f31e201412e65",
};
describe("production L story defaults", () => {
    it.each(Object.entries(hashes))("preserves %s", (key, hash) => {
        expect(
            createHash("sha256")
                .update(dramaLabPromptDefinition(key as DramaLabCanonicalPromptKey).template)
                .digest("hex"),
        ).toBe(hash);
    });
});
