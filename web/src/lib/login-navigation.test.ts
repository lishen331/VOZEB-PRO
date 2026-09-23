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
        // Non-admin default is the sidebar's first visible entry.
        expect(defaultLoginDestination("user")).toBe("/create");
        // creative-agent off (no school context): the first remaining sidebar
        // entry is 画布/canvas, NOT the old hardcoded /practice.
        expect(defaultLoginDestination("user", { "creative-agent": false })).toBe("/canvas");
        expect(resolveLoginDestination({ role: "admin" }, undefined)).toBe("/admin");
        expect(resolveLoginDestination({ role: "user" }, "/admin?section=site", { "creative-agent": false })).toBe("/canvas?auth=forbidden");
        expect(resolveLoginDestination({ role: "admin" }, "/admin?section=site")).toBe("/admin?section=site");
    });

    it("still lands somewhere when every feature module is disabled", () => {
        // 主页/me has no feature-module gate, so it stays in the sidebar even
        // with everything else off and becomes the natural landing floor. The
        // /help fallback in defaultLoginDestination only triggers if that
        // module-less entry is ever removed.
        const allOff = Object.fromEntries(["creative-agent", "canvas", "drama", "drama-lab", "one-click-film", "practice", "works", "assets", "my-prompts", "prompt-library", "community", "ip-library"].map((id) => [id, false]));
        expect(defaultLoginDestination("user", allOff)).toBe("/me");
    });

    it("builds one encoded login URL for a protected target", () => {
        expect(loginHref("/create#prompt=一只猫")).toBe("/login?next=%2Fcreate%23prompt%3D%E4%B8%80%E5%8F%AA%E7%8C%AB");
        expect(loginHref("https://evil.example")).toBe("/login");
    });
});
