export type SchoolStatus = "active" | "disabled";
export type SchoolMemberRole = "teacher" | "student";
export type SchoolPermission = "school.manage";
export type SchoolMembershipStatus = "active" | "disabled";
export type PlatformCourseStatus = "draft" | "published" | "disabled";
export type TeachingAssignmentKind = "lesson" | "homework" | "commercial_practice";
export type TeachingAssignmentStatus = "draft" | "published" | "closed";
export type TeachingSubmissionStatus = "submitted" | "revision_required" | "reviewed";
export type CommercialOrderStatus = "draft" | "assigned" | "in_progress" | "submitted" | "revision_required" | "accepted" | "cancelled";

export const SCHOOL_MEMBER_ROLES = ["teacher", "student"] as const satisfies readonly SchoolMemberRole[];
export const SCHOOL_PERMISSIONS = ["school.manage"] as const satisfies readonly SchoolPermission[];
export const SCHOOL_CONTENT_REFERENCE_TYPES = ["work", "canvas", "drama", "asset", "generation"] as const;

export type SchoolContentReference = { type: (typeof SCHOOL_CONTENT_REFERENCE_TYPES)[number]; id: string };
export type SchoolContext = {
    school: { id: string; name: string; status: SchoolStatus };
    membership: { id: string; role: SchoolMemberRole; permissions: SchoolPermission[]; status: SchoolMembershipStatus };
    canManageSchool: boolean;
};

const SCHOOL_MEMBER_ROLE_SET = new Set<SchoolMemberRole>(SCHOOL_MEMBER_ROLES);
const SCHOOL_PERMISSION_SET = new Set<SchoolPermission>(SCHOOL_PERMISSIONS);
const SCHOOL_CONTENT_REFERENCE_TYPE_SET = new Set<SchoolContentReference["type"]>(SCHOOL_CONTENT_REFERENCE_TYPES);

export function normalizeSchoolMemberRole(value: unknown): SchoolMemberRole | null {
    return typeof value === "string" && SCHOOL_MEMBER_ROLE_SET.has(value as SchoolMemberRole) ? (value as SchoolMemberRole) : null;
}

export function normalizeSchoolPermissions(value: unknown): SchoolPermission[] {
    if (!Array.isArray(value)) return [];
    const selected = new Set(value.filter((item): item is SchoolPermission => typeof item === "string" && SCHOOL_PERMISSION_SET.has(item as SchoolPermission)));
    return SCHOOL_PERMISSIONS.filter((permission) => selected.has(permission));
}

export function normalizeSchoolContentReference(value: unknown): SchoolContentReference | null {
    if (!value || typeof value !== "object") return null;
    const source = value as Record<string, unknown>;
    if (typeof source.type !== "string" || !SCHOOL_CONTENT_REFERENCE_TYPE_SET.has(source.type as SchoolContentReference["type"]) || typeof source.id !== "string" || !source.id.trim()) return null;
    return { type: source.type as SchoolContentReference["type"], id: source.id.trim() };
}

const COMMERCIAL_ORDER_TRANSITIONS = {
    draft: ["assigned", "cancelled"],
    assigned: ["in_progress", "cancelled"],
    in_progress: ["submitted", "cancelled"],
    submitted: ["revision_required", "accepted"],
    revision_required: ["submitted", "cancelled"],
    accepted: [],
    cancelled: [],
} as const satisfies Record<CommercialOrderStatus, readonly CommercialOrderStatus[]>;

export function canTransitionCommercialOrder(from: CommercialOrderStatus, to: CommercialOrderStatus): boolean {
    return (COMMERCIAL_ORDER_TRANSITIONS[from] as readonly CommercialOrderStatus[]).includes(to);
}
