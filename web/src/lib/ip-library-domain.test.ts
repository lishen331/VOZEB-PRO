import { describe, expect, it } from "vitest";

import { IP_ASSET_KINDS, IP_AUTHORIZATION_MODES, IP_REFERENCE_ENTRY_VISIBLE, IP_STATUSES, IP_USAGE_ACTIONS, IP_VISIBILITIES, ipAuthorizationLabel, ipItemCategoryLabel, normalizeIpItemCategory, normalizeIpReference } from "./ip-library-domain";

describe("IP library domain contracts", () => {
    it("uses parent IP visibility, child grants, and enabled status without versions", () => {
        expect(IP_VISIBILITIES).toEqual(["public", "school"]);
        expect(IP_AUTHORIZATION_MODES).toEqual(["multi_school", "exclusive"]);
        expect(IP_STATUSES).toEqual(["enabled", "disabled"]);
        expect(IP_ASSET_KINDS).toEqual(["text", "image", "audio", "video"]);
    });

    it("normalizes references to one child IP", () => {
        expect(normalizeIpReference({ type: "ip", id: " ip-a ", subIpId: " child-a ", itemIds: [" item-a ", "", "item-b"] })).toEqual({ type: "ip", id: "ip-a", subIpId: "child-a", itemIds: ["item-a", "item-b"] });
        expect(normalizeIpReference({ type: "ip", id: "ip-a", subIpId: "child-a", itemIds: ["item-a", " item-a "] })).toBeNull();
        expect(normalizeIpReference({ type: "ip", id: "ip-a", versionId: "old", itemIds: [] })).toBeNull();
    });

    it("keeps the existing content whitelist and dormant reference entry", () => {
        expect(normalizeIpItemCategory("text", "worldbuilding")).toBe("worldbuilding");
        expect(normalizeIpItemCategory("image", "character")).toBe("character");
        expect(normalizeIpItemCategory("audio", "trailer")).toBeNull();
        expect(IP_REFERENCE_ENTRY_VISIBLE).toBe(false);
        expect(IP_USAGE_ACTIONS).toContain("reference");
        expect(ipAuthorizationLabel("exclusive")).toBe("独家授权");
        expect(ipItemCategoryLabel("story_summary")).toBe("故事梗概");
        expect(ipItemCategoryLabel("background_music")).toBe("背景音乐");
    });
});
