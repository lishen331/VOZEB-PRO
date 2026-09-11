import { describe, expect, it } from "vitest";

import type { IpReference } from "@/lib/ip-library-domain";
import { PRACTICE_MODULES, PRACTICE_PROJECT_CARDS, PRACTICE_SCRIPT_ENTRY, practiceProjectPath, practiceModulePath } from "./practice-home";

describe("practice home contract", () => {
    it("exposes the six Demo-aligned modules and keeps project cards separately controllable", () => {
        expect(PRACTICE_PROJECT_CARDS.map((item) => item.kind)).toEqual(["canvas", "drama"]);
        expect(PRACTICE_MODULES.map((item) => item.module)).toEqual(["character", "scene", "prop", "storyboard-image", "storyboard-video", "dubbing"]);
    });
    it("exposes the independent script practice entry", () => {
        expect(PRACTICE_SCRIPT_ENTRY.title).toBe("剧本");
        expect(PRACTICE_SCRIPT_ENTRY.description).toContain("单人");
    });
    it("routes project and module actions to stable workspaces", () => {
        expect(practiceProjectPath("canvas", "canvas-practice-1")).toBe("/canvas/canvas-practice-1");
        expect(practiceProjectPath("drama", "drama-practice-1")).toBe("/drama/drama-practice-1");
        expect(practiceModulePath("storyboard-video")).toBe("/practice/storyboard-video");
    });

    it("keeps a stable child IP when opening a focused practice module", () => {
        const reference: IpReference = { type: "ip", id: "ip-one", subIpId: "child-two", itemIds: [] };

        expect(practiceModulePath("script", reference)).toBe("/practice/script?ipId=ip-one&subIpId=child-two");
    });
});
