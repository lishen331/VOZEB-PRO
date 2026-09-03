import { normalizeIpReference, type IpReference } from "./ip-library-domain";
import type { UserStatus } from "./auth/store-types";

export type SchoolStatus = "active" | "disabled";
export type SchoolMemberRole = "teacher" | "student";
export type SchoolPermission = "school.manage";
export type SchoolMembershipStatus = "active" | "disabled";
export type PlatformCourseStatus = "draft" | "published" | "disabled";
export type TeachingAssignmentKind = "lesson" | "homework" | "commercial_practice";
export type TeachingAssignmentStatus = "draft" | "published" | "closed";
export type TeachingSubmissionStatus = "submitted" | "revision_required" | "reviewed";
export type TeachingSubmissionReferenceAvailability = "available" | "unavailable";
export type CommercialOrderStatus = "draft" | "assigned" | "in_progress" | "submitted" | "revision_required" | "accepted" | "cancelled";

export const SCHOOL_MEMBER_ROLES = ["teacher", "student"] as const satisfies readonly SchoolMemberRole[];
export const SCHOOL_PERMISSIONS = ["school.manage"] as const satisfies readonly SchoolPermission[];
export const SCHOOL_CONTENT_REFERENCE_TYPES = ["work", "canvas", "drama", "asset", "generation", "ip"] as const;

export type SchoolContentReference = { type: Exclude<(typeof SCHOOL_CONTENT_REFERENCE_TYPES)[number], "ip">; id: string } | IpReference;
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
export type AdminSchoolMemberQuery = { page?: number; pageSize?: number; keyword?: string; role?: SchoolMemberRole; status?: SchoolMembershipStatus };
export type AdminSchoolMemberPoints = SchoolMember & {
    userId: string;
    accountStatus: UserStatus;
    permanentPoints: number;
    dailyPoints: number;
    totalPoints: number;
    dailyPointsExpiresAt: string;
};
export type AdminSchoolMemberPointsAdjustmentInput = { operation: "credit" | "debit"; amount: number; reason: string; idempotencyKey: string };
export type AdminSchoolMemberPointsAdjustmentResult = {
    member: AdminSchoolMemberPoints;
    adjustment: { recordId: string; operation: "credit" | "debit"; amount: number; balanceBefore: number; balanceAfter: number; reason: string; createdAt: string };
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
export type CourseAttachment = {
    title: string;
    url: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    bytes: number;
};
export type CourseMaterialSourceScope = "platform" | "school";
export type CourseMaterialStatus = "active" | "disabled";
export type CourseMaterial = {
    id: string;
    courseId: string;
    chapterId?: string;
    lessonId?: string;
    sourceScope: CourseMaterialSourceScope;
    schoolCourseAssignmentId?: string;
    title: string;
    fileName: string;
    mimeType: string;
    bytes: number;
    storageKey: string;
    url: string;
    sortOrder: number;
    status: CourseMaterialStatus;
    createdByUserId?: string;
    createdAt: string;
    updatedAt: string;
};
export type CourseLesson = {
    id: string;
    courseId: string;
    chapterId: string;
    title: string;
    description: string;
    sortOrder: number;
    materials: CourseMaterial[];
    createdAt: string;
    updatedAt: string;
};
export type CourseChapter = {
    id: string;
    courseId: string;
    title: string;
    description: string;
    sortOrder: number;
    materials: CourseMaterial[];
    lessons: CourseLesson[];
    createdAt: string;
    updatedAt: string;
};
export type PlatformCourseSummary = {
    id: string;
    title: string;
    summary: string;
    content: Record<string, unknown>;
    chapterCount: number;
    lessonCount: number;
    materialCount: number;
    status: PlatformCourseStatus;
    deletedAt?: string;
    deletedByUserId?: string;
    createdAt: string;
    updatedAt: string;
};
export type PlatformCourseDetail = PlatformCourseSummary & { chapters: CourseChapter[] };
export type PlatformCourse = PlatformCourseSummary;
export type PlatformCourseInput = Pick<PlatformCourse, "title" | "summary" | "content">;
export type PlatformCoursePatch = Partial<PlatformCourseInput> & { status?: PlatformCourseStatus };
export type SchoolCourseAssignment = { id: string; courseId: string; schoolId: string; status: SchoolStatus; createdAt: string; updatedAt: string; course: PlatformCourse };
export type CourseOfferingInput = { classId: string; teacherMembershipId: string; status?: SchoolStatus };
export type SchoolPublicIdentity = { accountId: string; username: string; displayName: string };
export type SchoolCourseOffering = {
    id: string;
    schoolId: string;
    assignmentId: string;
    classId: string;
    teacherMembershipId: string;
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
    chapterId?: string;
    lessonId?: string;
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
export type TeachingAssignmentInput = { kind: TeachingAssignmentKind; title: string; instructions?: string; resources?: unknown[]; dueAt?: string; status?: TeachingAssignmentStatus; chapterId?: string; lessonId?: string };
export type TeachingSubmission = {
    id: string;
    schoolId: string;
    assignmentId: string;
    studentMembershipId: string;
    note: string;
    contentReferences: SchoolContentReference[];
    resolvedContentReferences?: TeachingSubmissionReferencePreview[];
    status: TeachingSubmissionStatus;
    feedback: string;
    student: SchoolPublicIdentity;
    submittedAt: string;
    reviewedAt?: string;
    createdAt: string;
    updatedAt: string;
};
export type TeachingSubmissionReferencePreview = {
    reference: SchoolContentReference;
    title: string;
    kind?: SchoolContentReference["type"];
    mediaType: "image" | "video" | "audio" | "text" | "file" | "unknown";
    previewUrl?: string;
    availability: TeachingSubmissionReferenceAvailability;
    unavailableReason?: string;
};
export type CommercialOrderInput = {
    title: string;
    requirements?: string;
    referenceMaterials?: unknown[];
    acceptanceCriteria?: string;
    internalAmountCents: number;
    deadlineAt?: string;
};
export type AdminCommercialOrder = {
    id: string;
    title: string;
    requirements: string;
    referenceMaterials: unknown[];
    acceptanceCriteria: string;
    internalAmountCents: number;
    deadlineAt?: string;
    assignedSchoolId?: string;
    teacherMembershipId?: string;
    classId?: string;
    productionGroupId?: string;
    productionGroupName?: string;
    status: CommercialOrderStatus;
    platformFeedback: string;
    createdAt: string;
    updatedAt: string;
};
export type SchoolCommercialOrder = {
    id: string;
    title: string;
    requirements: string;
    referenceMaterials: unknown[];
    acceptanceCriteria: string;
    deadlineAt?: string;
    assignedSchoolId: string;
    teacherMembershipId?: string;
    teacher?: SchoolPublicIdentity;
    classId?: string;
    className?: string;
    productionGroupId?: string;
    productionGroupName?: string;
    status: CommercialOrderStatus;
    platformFeedback: string;
    createdAt: string;
    updatedAt: string;
};
export type CommercialOrderParticipantSubmission = {
    id: string;
    orderId: string;
    membershipId: string;
    participant: SchoolPublicIdentity;
    candidateReferences: SchoolContentReference[];
    note: string;
    status: "active" | "submitted";
    submittedAt?: string;
    createdAt: string;
    updatedAt: string;
};
export type CommercialOrderParticipantCandidate = {
    membershipId: string;
    participant: SchoolPublicIdentity;
};
export type CommercialOrderParticipantCandidatePage = PageResult<CommercialOrderParticipantCandidate> & {
    selectedMembershipIds: string[];
};
export type CommercialOrderDelivery = {
    id: string;
    orderId: string;
    submittedByMembershipId: string;
    submittedBy: SchoolPublicIdentity;
    contentReferences: SchoolContentReference[];
    resolvedContentReferences?: TeachingSubmissionReferencePreview[];
    note: string;
    status: "submitted" | "revision_required" | "accepted";
    platformFeedback: string;
    submittedAt: string;
    reviewedAt?: string;
    createdAt: string;
    updatedAt: string;
};
export type AdminCommercialOrderDetails = { order: AdminCommercialOrder; deliveries: PageResult<CommercialOrderDelivery> };

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
    if (source.type === "ip") return normalizeIpReference(source);
    if (typeof source.type !== "string" || !SCHOOL_CONTENT_REFERENCE_TYPE_SET.has(source.type as SchoolContentReference["type"]) || typeof source.id !== "string" || !source.id.trim()) return null;
    return { type: source.type as Exclude<SchoolContentReference["type"], "ip">, id: source.id.trim() };
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
