import { describe, expect, it } from "vitest";

import { availableIpLibraryScopes } from "./ip-library-page";

describe("IP library page contract", () => {
    it("shows only public IPs to an ordinary user", () => {
        expect(availableIpLibraryScopes(false)).toEqual([{ label: "公共 IP", value: "public" }]);
    });

    it("adds the current-school scope for an active school member", () => {
        expect(availableIpLibraryScopes(true).map((item) => item.label)).toEqual(["公共 IP", "本校 IP"]);
    });
});
