import { describe, expect, it } from "vitest";

import {
    SCHOOL_CONTENT_REFERENCE_TYPES,
    SCHOOL_MEMBER_ROLES,
    SCHOOL_PERMISSIONS,
    canTransitionCommercialOrder,
    normalizeSchoolContentReference,
    normalizeSchoolMemberRole,
    normalizeSchoolPermissions,
    type CommercialOrderStatus,
    type AdminCommercialOrder,
    type SchoolCommercialOrder,
} from "./school-domain";

describe("school domain contracts", () => {
    it("only accepts teacher and student as school member roles", () => {
        expect(SCHOOL_MEMBER_ROLES).toEqual(["teacher", "student"]);
        expect(normalizeSchoolMemberRole("teacher")).toBe("teacher");
        expect(normalizeSchoolMemberRole("student")).toBe("student");
        expect(normalizeSchoolMemberRole("admin")).toBeNull();
        expect(normalizeSchoolMemberRole("school_admin")).toBeNull();
    });

    it("only keeps the school management permission", () => {
        expect(SCHOOL_PERMISSIONS).toEqual(["school.manage"]);
        expect(normalizeSchoolPermissions(["unknown", "school.manage", "school.manage"])).toEqual(["school.manage"]);
        expect(normalizeSchoolPermissions("school.manage")).toEqual([]);
    });

    it("accepts existing owner references and stable child IP references", () => {
        expect(SCHOOL_CONTENT_REFERENCE_TYPES).toEqual(["work", "canvas", "drama", "asset", "generation", "ip"]);
        expect(normalizeSchoolContentReference({ type: "canvas", id: "canvas-1" })).toEqual({ type: "canvas", id: "canvas-1" });
        expect(normalizeSchoolContentReference({ type: "ip", id: "ip-1", subIpId: "child-1", itemIds: ["item-1"] })).toEqual({
            type: "ip",
            id: "ip-1",
            subIpId: "child-1",
            itemIds: ["item-1"],
        });
        expect(normalizeSchoolContentReference({ type: "ip", id: "ip-1", subIpId: "child-1", itemIds: ["item-1", "item-1"] })).toBeNull();
        expect(normalizeSchoolContentReference({ type: "audio", id: "audio-1" })).toBeNull();
        expect(normalizeSchoolContentReference({ type: "work", id: "" })).toBeNull();
    });

    it("allows only the designed commercial order status transitions", () => {
        const allowed: Array<[CommercialOrderStatus, CommercialOrderStatus]> = [
            ["draft", "assigned"],
            ["draft", "cancelled"],
            ["assigned", "in_progress"],
            ["assigned", "cancelled"],
            ["in_progress", "submitted"],
            ["in_progress", "cancelled"],
            ["submitted", "revision_required"],
            ["submitted", "accepted"],
            ["revision_required", "submitted"],
            ["revision_required", "cancelled"],
        ];
        const statuses: CommercialOrderStatus[] = ["draft", "assigned", "in_progress", "submitted", "revision_required", "accepted", "cancelled"];

        for (const from of statuses) {
            for (const to of statuses) {
                expect(canTransitionCommercialOrder(from, to), `${from} -> ${to}`).toBe(allowed.some(([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to));
            }
        }
    });

    it("keeps internal amount out of school commercial order DTOs", () => {
        const admin = { internalAmountCents: 1200 } as AdminCommercialOrder;
        const school = { id: "order-a", title: "商单" } as SchoolCommercialOrder;
        expect(admin.internalAmountCents).toBe(1200);
        expect(JSON.stringify(school)).not.toContain("internalAmountCents");
    });
});
