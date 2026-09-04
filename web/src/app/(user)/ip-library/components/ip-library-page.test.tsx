import { describe, expect, it } from "vitest";

import { availableIpLibraryScopes, IP_LIBRARY_KIND_OPTIONS, shouldShowExclusiveBadge } from "./ip-library-page";

describe("IP library page contract", () => {
    it("shows only public IPs to an ordinary user", () => {
        expect(availableIpLibraryScopes(false)).toEqual([{ label: "公共 IP", value: "public" }]);
    });

    it("adds the current-school scope for an active school member", () => {
        expect(availableIpLibraryScopes(true).map((item) => item.label)).toEqual(["公共 IP", "本校 IP"]);
    });

    it("shows exclusive authorization only on school IP cards", () => {
        expect(shouldShowExclusiveBadge("public", true)).toBe(false);
        expect(shouldShowExclusiveBadge("school", true)).toBe(true);
        expect(shouldShowExclusiveBadge("school", false)).toBe(false);
    });

    it("offers every supported content type as a list filter", () => {
        expect(IP_LIBRARY_KIND_OPTIONS.map((option) => option.value)).toEqual(["text", "image", "audio", "video"]);
    });
});
