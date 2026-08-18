import { describe, expect, it } from "vitest";

import {
    ADMIN_PERMISSION_DEFINITIONS,
    ADMIN_PERMISSION_GROUPS,
    ADMIN_PERMISSION_PRESETS,
    ALL_ADMIN_PERMISSIONS,
    adminPermissionSummary,
    allowedAdminBillingTabs,
    hasAdminPermission,
    hasAnyAdminPermission,
    isFullAdminPermissions,
    normalizeAdminPermissions,
    resolveAdminBillingTab,
} from "./admin-permissions";

describe("administrator permissions", () => {
    it("normalizes known permissions in registry order", () => {
        expect(normalizeAdminPermissions(["billing.manage", "unknown", "users.read", "billing.manage"])).toEqual(["users.read", "billing.manage"]);
    });

    it("requires an active administrator with an explicit permission", () => {
        expect(hasAdminPermission({ role: "admin", status: "active", adminPermissions: ["users.read"] }, "users.read")).toBe(true);
        expect(hasAdminPermission({ role: "admin", status: "active" }, "users.read")).toBe(false);
        expect(hasAdminPermission({ role: "admin", status: "disabled", adminPermissions: ["users.read"] }, "users.read")).toBe(false);
        expect(hasAdminPermission({ role: "user", status: "active", adminPermissions: ["users.read"] }, "users.read")).toBe(false);
    });

    it("keeps presets inside the declared permission registry", () => {
        for (const preset of ADMIN_PERMISSION_PRESETS) expect(normalizeAdminPermissions(preset.permissions)).toEqual(preset.permissions);
        expect(isFullAdminPermissions(ADMIN_PERMISSION_PRESETS[0].permissions)).toBe(true);
        expect(hasAnyAdminPermission({ role: "admin", status: "active", adminPermissions: ["audit.read"] })).toBe(true);
        expect(ALL_ADMIN_PERMISSIONS.length).toBeGreaterThan(0);
    });

    it("registers education operations as one platform responsibility", () => {
        expect(ADMIN_PERMISSION_GROUPS).toContainEqual({ key: "education", label: "产教运营", description: "学校、课程教学与商单运营" });
        expect(ADMIN_PERMISSION_DEFINITIONS).toContainEqual({ key: "education.manage", group: "education", label: "产教运营", description: "管理学校、平台课程和商单。" });
        expect(normalizeAdminPermissions(["education.manage"])).toEqual(["education.manage"]);
        expect(ADMIN_PERMISSION_PRESETS.find((item) => item.key === "full")?.permissions).toContain("education.manage");
    });

    it("limits financial workspace tabs to the current duties", () => {
        const finance = { role: "admin", status: "active", adminPermissions: ["billing.read"] };
        const commerce = { role: "admin", status: "active", adminPermissions: ["commerce.manage"] };

        expect(allowedAdminBillingTabs(finance)).toEqual(["orders"]);
        expect(resolveAdminBillingTab(finance, "payments")).toBe("orders");
        expect(allowedAdminBillingTabs(commerce)).toEqual(["products", "promotions", "coupons"]);
        expect(resolveAdminBillingTab(commerce, "orders")).toBe("products");
    });

    it("uses a preset label or a precise custom responsibility count", () => {
        expect(adminPermissionSummary(["users.read", "billing.read", "billing.manage"])).toBe("财务");
        expect(adminPermissionSummary(["users.read", "audit.read"])).toBe("2 项职责");
    });
});
