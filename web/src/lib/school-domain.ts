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

export type PageResult<T> = { items: T[]; total: number; page: number; pageSize: number };
export type SchoolAdministratorSummary = { accountId: string; username: string; displayName: string; email?: string };
export type SchoolSummary = {
    id: string;
    name: string;
    profile: Record<string, unknown>;
    status: SchoolStatus;
    createdAt: string;
    updatedAt: string;
    administrator?: SchoolAdministratorSummary;
};
export type SchoolDetail = SchoolSummary;
export type SchoolMember = {
    id: string;
    accountId: string;
    username: string;
    displayName: string;
    email?: string;
    role: SchoolMemberRole;
    permissions: SchoolPermission[];
    status: SchoolMembershipStatus;
    joinSource: "admin" | "import" | "invite";
    createdAt: string;
    updatedAt: string;
};
export type SchoolClass = {
    id: string;
    schoolId: string;
    name: string;
    description: string;
    status: SchoolStatus;
    createdAt: string;
    updatedAt: string;
};
export type SchoolClassDetail = SchoolClass & { teachers: SchoolMember[]; students: SchoolMember[] };
export type SchoolMemberCreateInput = { username: string; email?: string; displayName?: string; password: string; role: SchoolMemberRole };
export type SchoolMemberPatch = { role?: SchoolMemberRole; permissions?: SchoolPermission[]; status?: SchoolMembershipStatus };
export type SchoolClassInput = { name: string; description?: string };
export type CreateSchoolInput = { name: string; profile?: Record<string, unknown>; administrator: Omit<SchoolMemberCreateInput, "role"> };
export type UpdateSchoolInput = { name?: string; profile?: Record<string, unknown>; status?: SchoolStatus };
export type PlatformCourse = {
    id: string;
    title: string;
    summary: string;
    content: Record<string, unknown>;
    chapters: unknown[];
    attachments: unknown[];
    status: PlatformCourseStatus;
    createdAt: string;
    updatedAt: string;
};
export type PlatformCourseInput = Pick<PlatformCourse, "title" | "summary" | "content" | "chapters" | "attachments">;
export type PlatformCoursePatch = Partial<PlatformCourseInput> & { status?: PlatformCourseStatus };
export type SchoolCourseAssignment = { id: string; courseId: string; schoolId: string; status: SchoolStatus; createdAt: string; updatedAt: string; course: PlatformCourse };
export type CourseOfferingInput = { classId: string; teacherMembershipId: string; supplementalResources?: unknown[]; status?: SchoolStatus };
export type SchoolPublicIdentity = { accountId: string; username: string; displayName: string };
export type SchoolCourseOffering = {
    id: string;
    schoolId: string;
    assignmentId: string;
    classId: string;
    teacherMembershipId: string;
    supplementalResources: unknown[];
    status: SchoolStatus;
    courseTitle: string;
    className: string;
    teacher: SchoolPublicIdentity;
    createdAt: string;
    updatedAt: string;
};
export type TeachingAssignment = {
    id: string;
    schoolId: string;
    offeringId: string;
    teacherMembershipId: string;
    kind: TeachingAssignmentKind;
    title: string;
    instructions: string;
    resources: unknown[];
    dueAt?: string;
    status: TeachingAssignmentStatus;
    courseTitle: string;
    className: string;
    createdAt: string;
    updatedAt: string;
};
export type TeachingAssignmentInput = { kind: TeachingAssignmentKind; title: string; instructions?: string; resources?: unknown[]; dueAt?: string; status?: TeachingAssignmentStatus };
export type TeachingSubmission = {
    id: string;
    schoolId: string;
    assignmentId: string;
    studentMembershipId: string;
    note: string;
    contentReferences: SchoolContentReference[];
    status: TeachingSubmissionStatus;
    feedback: string;
    student: SchoolPublicIdentity;
    submittedAt: string;
    reviewedAt?: string;
    createdAt: string;
    updatedAt: string;
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
