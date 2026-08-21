import { describe, expect, it } from "vitest";

import { DRAMA_LAB_PROMPT_DEFINITIONS, DRAMA_LAB_PROMPT_KEYS, dramaLabPromptDefinition } from "./drama-lab-prompt-templates";

describe("drama lab prompt templates", () => {
    it("ships the complete short-drama workflow template set", () => {
        expect(DRAMA_LAB_PROMPT_KEYS).toEqual([
            "story_expansion_system",
            "character_extraction",
            "scene_extraction",
            "prop_extraction",
            "storyboard_system",
            "storyboard_user_suffix",
            "first_frame_prompt",
            "key_frame_prompt",
            "last_frame_prompt",
        ]);
        expect(DRAMA_LAB_PROMPT_DEFINITIONS.every((item) => item.template.trim() && item.variables.length)).toBe(true);
    });

    it("keeps every runtime key resolvable to one definition", () => {
        for (const key of DRAMA_LAB_PROMPT_KEYS) expect(dramaLabPromptDefinition(key).key).toBe(key);
    });

    it("keeps legacy callers mapped to the canonical LocalMiniDrama keys", () => {
        expect(dramaLabPromptDefinition("story_generation").key).toBe("story_expansion_system");
        expect(dramaLabPromptDefinition("storyboard_output_format").key).toBe("storyboard_user_suffix");
    });
});
