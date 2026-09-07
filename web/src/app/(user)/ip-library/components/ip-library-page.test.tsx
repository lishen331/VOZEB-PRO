import { describe, expect, it } from "vitest";

import { availableIpLibraryScopes, IP_LIBRARY_KIND_OPTIONS } from "./ip-library-page";

describe("IP library page contract", () => {
    it("shows the school library only to active school members", () => {
        expect(availableIpLibraryScopes(false)).toEqual([{ label: "公共 IP", value: "public" }]);
        expect(availableIpLibraryScopes(true).map((item) => item.value)).toEqual(["public", "school"]);
    });
    it("offers all supported content filters", () => expect(IP_LIBRARY_KIND_OPTIONS.map((option) => option.value)).toEqual(["text", "image", "audio", "video"]));
});
