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

    it("only accepts the five stable content reference types", () => {
        expect(SCHOOL_CONTENT_REFERENCE_TYPES).toEqual(["work", "canvas", "drama", "asset", "generation"]);
        expect(normalizeSchoolContentReference({ type: "canvas", id: "canvas-1" })).toEqual({ type: "canvas", id: "canvas-1" });
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
});
