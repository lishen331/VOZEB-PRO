import { describe, expect, it } from "vitest";
import { normalizeImageReferenceRoles, toggleImageReferenceRole } from "./image-reference-roles";

describe("image reference roles", () => {
    it("keeps original as the default and supports legacy scalar values", () => {
        expect(normalizeImageReferenceRoles({ a: undefined, b: "identity" })).toEqual({ a: ["original"], b: ["identity"] });
    });

    it("supports multiple semantic roles while original is mutually exclusive", () => {
        expect(toggleImageReferenceRole(["original"], "identity")).toEqual(["identity"]);
        expect(toggleImageReferenceRole(["identity"], "clothing")).toEqual(["identity", "clothing"]);
        expect(toggleImageReferenceRole(["identity"], "identity")).toEqual(["original"]);
        expect(toggleImageReferenceRole(["identity", "clothing"], "original")).toEqual(["original"]);
    });
});
