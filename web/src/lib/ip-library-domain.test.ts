import { describe, expect, it } from "vitest";

import { IP_ASSET_KINDS, IP_AUTHORIZATION_MODES, IP_REFERENCE_ENTRY_VISIBLE, IP_STATUSES, IP_USAGE_ACTIONS, IP_VERSION_STATUSES, IP_VISIBILITIES, ipAuthorizationLabel, normalizeIpItemCategory, normalizeIpReference } from "./ip-library-domain";

describe("IP library domain contracts", () => {
    it("keeps the designed visibility, authorization, status, and asset values", () => {
        expect(IP_VISIBILITIES).toEqual(["public", "school"]);
        expect(IP_AUTHORIZATION_MODES).toEqual(["multi_school", "exclusive"]);
        expect(IP_STATUSES).toEqual(["draft", "published", "disabled"]);
        expect(IP_VERSION_STATUSES).toEqual(["draft", "published", "disabled"]);
        expect(IP_ASSET_KINDS).toEqual(["text", "image", "audio", "video"]);
    });

    it("accepts only the first-release category whitelist for each asset kind", () => {
        expect(normalizeIpItemCategory("text", "story_summary")).toBe("story_summary");
        expect(normalizeIpItemCategory("image", "character")).toBe("character");
        expect(normalizeIpItemCategory("image", "style")).toBe("style");
        expect(normalizeIpItemCategory("audio", "character_voice")).toBe("character_voice");
        expect(normalizeIpItemCategory("video", "trailer")).toBe("trailer");
        expect(normalizeIpItemCategory("video", "shot")).toBe("shot");
        expect(normalizeIpItemCategory("image", "trailer")).toBeNull();
        expect(normalizeIpItemCategory("unknown", "character")).toBeNull();
        expect(normalizeIpItemCategory("video", "unknown")).toBeNull();
    });

    it("normalizes stable IP references and removes empty item IDs", () => {
        expect(
            normalizeIpReference({
                type: "ip",
                id: " ip-a ",
                versionId: " version-2 ",
                itemIds: [" item-a ", "", "   ", "item-b"],
                manifest: { hidden: true },
            }),
        ).toEqual({ type: "ip", id: "ip-a", versionId: "version-2", itemIds: ["item-a", "item-b"] });
    });

    it("keeps the reference contract dormant while its user entry is hidden", () => {
        expect(IP_REFERENCE_ENTRY_VISIBLE).toBe(false);
        expect(IP_USAGE_ACTIONS).toContain("reference");
        expect(normalizeIpReference({ type: "ip", id: "ip-a", versionId: "v1", itemIds: [] })).not.toBeNull();
    });

    it("rejects duplicate item IDs and malformed IP references", () => {
        expect(normalizeIpReference({ type: "ip", id: "ip-a", versionId: "v1", itemIds: ["item-a", " item-a "] })).toBeNull();
        expect(normalizeIpReference({ type: "asset", id: "ip-a", versionId: "v1", itemIds: [] })).toBeNull();
        expect(normalizeIpReference({ type: "ip", id: "", versionId: "v1", itemIds: [] })).toBeNull();
        expect(normalizeIpReference({ type: "ip", id: "ip-a", versionId: "", itemIds: [] })).toBeNull();
        expect(normalizeIpReference({ type: "ip", id: "ip-a", versionId: "v1", itemIds: "item-a" })).toBeNull();
    });

    it("uses user-facing authorization labels", () => {
        expect(ipAuthorizationLabel("multi_school")).toBe("多校授权");
        expect(ipAuthorizationLabel("exclusive")).toBe("独家授权");
    });
});
