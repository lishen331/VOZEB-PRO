import { describe, expect, it } from "vitest";

import type { IpReference } from "@/lib/ip-library-domain";
import { PRACTICE_MODULES, PRACTICE_PROJECT_CARDS, PRACTICE_SCRIPT_ENTRY, PRACTICE_SINGLE_ENTRY, PRACTICE_TOOL_ENTRIES, practiceProjectPath, practiceModulePath } from "./practice-home";

describe("practice home contract", () => {
    it("exposes the six Demo-aligned modules and keeps project cards separately controllable", () => {
        expect(PRACTICE_PROJECT_CARDS.map((item) => item.kind)).toEqual(["canvas", "drama"]);
        expect(PRACTICE_MODULES.map((item) => item.module)).toEqual(["character", "scene", "prop", "storyboard-image", "storyboard-video", "dubbing"]);
    });
    it("exposes the independent script practice entry", () => {
        expect(PRACTICE_SCRIPT_ENTRY.title).toBe("剧本");
        expect(PRACTICE_SCRIPT_ENTRY.description).toContain("单人");
    });
    it("uses a single-item practice entry for the six module workspaces", () => {
        expect(PRACTICE_SINGLE_ENTRY.title).toBe("单项练习");
        expect(PRACTICE_SINGLE_ENTRY.description).toContain("角色");
    });
    it("lists the local tools next to the single-item entry, 3D desk first", () => {
        expect(PRACTICE_TOOL_ENTRIES.map((tool) => tool.id)).toEqual(["director-desk", "multi-angle", "reverse-prompt", "local-edit", "expression-reference", "super-resolution"]);
        expect(PRACTICE_TOOL_ENTRIES.slice(2).map((tool) => tool.path)).toEqual(["/practice/reverse-prompt", "/practice/local-edit", "/practice/expression-reference", "/practice/super-resolution"]);
        const multiAngle = PRACTICE_TOOL_ENTRIES.find((tool) => tool.id === "multi-angle");
        expect(multiAngle?.path).toBe("/practice/multi-angle");
        expect(multiAngle?.title).toBe("多角度练习");
    });
    it("guards the script entry with the admin-controlled script flag", async () => {
        const source = await (await import("node:fs/promises")).readFile(new URL("./practice-home.tsx", import.meta.url), "utf8");
        expect(source).toContain("scriptEnabled ? (");
        expect(source).toContain("PRACTICE_SINGLE_ENTRY");
        expect(source).not.toContain("moduleCards.map");
    });
    it("routes project and module actions to stable workspaces", () => {
        expect(practiceProjectPath("canvas", "canvas-practice-1")).toBe("/practice/canvas/canvas-practice-1");
        expect(practiceProjectPath("drama", "drama-practice-1")).toBe("/drama/drama-practice-1");
        expect(practiceModulePath("storyboard-video")).toBe("/practice/storyboard-video");
    });

    it("keeps module capability visible when project or history requests fail", async () => {
        const source = await (await import("node:fs/promises")).readFile(new URL("./practice-home.tsx", import.meta.url), "utf8");
        const capabilityIndex = source.indexOf("setVisibleModules(configuration.modules.map");
        const auxiliaryIndex = source.indexOf("Promise.allSettled([");

        expect(capabilityIndex).toBeGreaterThan(-1);
        expect(auxiliaryIndex).toBeGreaterThan(capabilityIndex);
        expect(source).not.toContain("const [canvas, drama, recent] = await Promise.all([");
        expect(source).toContain('canvasResult.status === "fulfilled"');
        expect(source).toContain('recentResult.status === "fulfilled"');
    });
    it("keeps a stable child IP when opening a focused practice module", () => {
        const reference: IpReference = { type: "ip", id: "ip-one", subIpId: "child-two", itemIds: [] };

        expect(practiceModulePath("script", reference)).toBe("/practice/script?ipId=ip-one&subIpId=child-two");
    });
});
