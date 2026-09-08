import { describe, expect, it } from "vitest";
import groups from "./drama-lab-style-options.json";
import { resolveDramaLabStylePrompt } from "./drama-lab-style-prompt";

describe("production L style preset expansion", () => {
    it.each(groups.flatMap((group) => group.options))("expands $value without shortening its prompt", (option) => {
        expect(resolveDramaLabStylePrompt(option.value)).toEqual({ zh: option.prompt, en: option.promptEn });
    });
    it("keeps arbitrary custom styles verbatim instead of guessing a preset", () => {
        expect(resolveDramaLabStylePrompt("电影感国漫")).toEqual({ zh: "电影感国漫", en: "电影感国漫" });
    });
    it("does not mutate or replace an empty selection", () => {
        expect(resolveDramaLabStylePrompt("  ")).toEqual({ zh: "", en: "" });
        expect(resolveDramaLabStylePrompt(undefined)).toEqual({ zh: "", en: "" });
    });
});
