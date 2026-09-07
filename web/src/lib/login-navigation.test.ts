import { describe, expect, it } from "vitest";

import { defaultLoginDestination, loginHref, resolveLoginDestination, safeLoginNextPath } from "./login-navigation";

describe("login navigation", () => {
    it("rejects external and protocol-relative next targets", () => {
        expect(safeLoginNextPath("https://evil.example/admin")).toBeNull();
        expect(safeLoginNextPath("//evil.example/admin")).toBeNull();
        expect(safeLoginNextPath("/create#draft=one")).toBe("/create#draft=one");
    });

    it("uses role defaults and only lets administrators enter admin paths", () => {
        expect(defaultLoginDestination("admin")).toBe("/admin");
        expect(defaultLoginDestination("user")).toBe("/create");
        expect(resolveLoginDestination({ role: "admin" }, undefined)).toBe("/admin");
        expect(resolveLoginDestination({ role: "user" }, "/admin?section=site")).toBe("/create?auth=forbidden");
        expect(resolveLoginDestination({ role: "admin" }, "/admin?section=site")).toBe("/admin?section=site");
    });

    it("builds one encoded login URL for a protected target", () => {
        expect(loginHref("/create#prompt=一只猫")).toBe("/login?next=%2Fcreate%23prompt%3D%E4%B8%80%E5%8F%AA%E7%8C%AB");
        expect(loginHref("https://evil.example")).toBe("/login");
    });
});
