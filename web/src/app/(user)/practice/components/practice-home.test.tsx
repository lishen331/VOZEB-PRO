import { describe, expect, it } from "vitest";

import type { IpReference } from "@/lib/ip-library-domain";
import { PRACTICE_ASSET_MODULES, PRACTICE_MODULES, PRACTICE_PROJECT_CARDS, practiceProjectPath, practiceModulePath } from "./practice-home";

describe("practice home contract", () => {
    it("exposes two project cards and five focused modules", () => {
        expect(PRACTICE_PROJECT_CARDS.map((item) => item.kind)).toEqual(["canvas", "drama"]);
        expect(PRACTICE_MODULES.map((item) => item.module)).toEqual(["script", "storyboard-image", "storyboard-video", "dubbing", "music"]);
    });

    it("routes project and module actions to stable workspaces", () => {
        expect(practiceProjectPath("canvas", "canvas-practice-1")).toBe("/canvas/canvas-practice-1");
        expect(practiceProjectPath("drama", "drama-practice-1")).toBe("/drama/drama-practice-1");
        expect(practiceModulePath("storyboard-video")).toBe("/practice/storyboard-video");
    });

    it("adds the three asset practice entries without changing the focused module array", () => {
        expect(PRACTICE_MODULES.map((item) => item.module)).toEqual(["script", "storyboard-image", "storyboard-video", "dubbing", "music"]);
        expect(PRACTICE_ASSET_MODULES.map((item) => item.module)).toEqual(["character", "scene", "prop"]);
    });

    it("keeps a stable IP version when opening a focused practice module", () => {
        const reference: IpReference = { type: "ip", id: "ip-one", versionId: "version-two", itemIds: [] };

        expect(practiceModulePath("script", reference)).toBe("/practice/script?ipId=ip-one&versionId=version-two");
    });
});
