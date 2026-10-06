import { describe, expect, it } from "vitest";

import { USER_NAVIGATION_MENU_PERMISSION_GROUPS } from "@/lib/feature-modules";

import { permissionTreeCheckState, updatePermissionTreeSelection } from "./admin-rbac-permission-tree";

const tree = [
    { key: "menu-analytics", children: [{ key: "analytics.read" }, { key: "users.read" }, { key: "users.manage" }] },
    { key: "menu-system", children: [{ key: "system.manage" }] },
] as const;

describe("RBAC permission tree linkage", () => {
    it("marks a first-level menu checked only when every child permission is selected", () => {
        const state = permissionTreeCheckState(tree, ["analytics.read", "users.read", "users.manage"]);
        expect(state.checked).toEqual(expect.arrayContaining(["analytics.read", "users.read", "users.manage", "menu-analytics"]));
        expect(state.halfChecked).not.toContain("menu-analytics");
    });

    it("marks a first-level menu half checked when only some children are selected", () => {
        const state = permissionTreeCheckState(tree, ["analytics.read", "users.manage"]);
        expect(state.checked).not.toContain("menu-analytics");
        expect(state.halfChecked).toContain("menu-analytics");
    });

    it("selects or clears every child when a first-level menu is clicked", () => {
        expect(updatePermissionTreeSelection(tree, ["analytics.read"], "menu-analytics", true)).toEqual(["analytics.read", "users.read", "users.manage"]);
        expect(updatePermissionTreeSelection(tree, ["analytics.read", "users.read", "users.manage"], "menu-analytics", false)).toEqual([]);
    });

    it("places the school group immediately before support in the configurable menu tree", () => {
        const keys = USER_NAVIGATION_MENU_PERMISSION_GROUPS.flatMap((group) => group.moduleIds);
        expect(keys).toEqual(expect.arrayContaining(["teaching", "learning"]));
        expect(keys).not.toContain("school-management");
        expect(USER_NAVIGATION_MENU_PERMISSION_GROUPS.slice(-2).map((group) => group.key)).toEqual(["school", "support"]);
    });
});
