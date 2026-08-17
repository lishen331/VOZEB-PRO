import type {
    CommercialOrderStatus,
    PlatformCourseStatus,
    SchoolContentReference,
    SchoolMemberRole,
    SchoolMembershipStatus,
    SchoolPermission,
    SchoolStatus,
    TeachingAssignmentKind,
    TeachingAssignmentStatus,
    TeachingSubmissionStatus,
} from "@/lib/school-domain";
import type { JsonValue } from "./database/repository-types";
import type { QueryExecutor } from "./database/postgres";
import { getDatabaseProvider } from "./database/postgres";
import { createPostgresSchoolDomainRepository } from "./database/school-domain-repository";
import { createFileSchoolDomainRepository } from "./school-domain-file-repository";

export type PageQuery = { page?: number; pageSize?: number };
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export type MemberPageQuery = PageQuery & { keyword?: string; role?: SchoolMemberRole; status?: SchoolMembershipStatus };
export type OrderPageQuery = PageQuery & { keyword?: string; status?: CommercialOrderStatus };

export type SchoolRecord = { id: string; name: string; profile: JsonValue; status: SchoolStatus; createdAt: string; updatedAt: string };
export type SchoolUpdate = Partial<Pick<SchoolRecord, "name" | "profile" | "status">> & { updatedAt: string };
export type SchoolMembershipRecord = {
    id: string;
    schoolId: string;
    userId: string;
    role: SchoolMemberRole;
    permissions: SchoolPermission[];
    status: SchoolMembershipStatus;
    joinSource: "admin" | "import" | "invite";
    createdAt: string;
    updatedAt: string;
};
export type SchoolContextRecord = { school: SchoolRecord; membership: SchoolMembershipRecord; canManageSchool: boolean };
export type SchoolMembershipUpdate = Partial<Pick<SchoolMembershipRecord, "role" | "permissions" | "status">> & { updatedAt: string };
export type SchoolClassRecord = { id: string; schoolId: string; name: string; description: string; status: SchoolStatus; createdAt: string; updatedAt: string };
export type SchoolClassUpdate = Partial<Pick<SchoolClassRecord, "name" | "description" | "status">> & { updatedAt: string };
export type SchoolClassMemberRecord = { id: string; schoolId: string; classId: string; membershipId: string; createdAt: string };
export type SchoolInviteCodeRecord = {
    id: string;
    schoolId: string;
    role: SchoolMemberRole;
    codeDigest: string;
    status: SchoolStatus;
    expiresAt?: string;
    createdAt: string;
    updatedAt: string;
};
export type PlatformCourseRecord = {
    id: string;
    title: string;
    summary: string;
    content: JsonValue;
    chapters: JsonValue;
    attachments: JsonValue;
    status: PlatformCourseStatus;
    createdByUserId?: string;
    createdAt: string;
    updatedAt: string;
};
export type SchoolCourseAssignmentRecord = { id: string; courseId: string; schoolId: string; status: SchoolStatus; createdAt: string; updatedAt: string };
export type SchoolCourseAssignmentInput = Omit<SchoolCourseAssignmentRecord, "courseId">;
export type SchoolCourseOfferingRecord = {
    id: string;
    schoolId: string;
    assignmentId: string;
    classId: string;
    teacherMembershipId: string;
    supplementalResources: JsonValue;
    status: SchoolStatus;
    createdAt: string;
    updatedAt: string;
};
export type TeachingAssignmentRecord = {
    id: string;
    schoolId: string;
    offeringId: string;
    teacherMembershipId: string;
    kind: TeachingAssignmentKind;
    title: string;
    instructions: string;
    resources: JsonValue;
    dueAt?: string;
    status: TeachingAssignmentStatus;
    createdAt: string;
    updatedAt: string;
};
export type TeachingSubmissionRecord = {
    id: string;
    schoolId: string;
    assignmentId: string;
    studentMembershipId: string;
    note: string;
    contentReferences: SchoolContentReference[];
    status: TeachingSubmissionStatus;
    feedback: string;
    submittedAt: string;
    reviewedAt?: string;
    createdAt: string;
    updatedAt: string;
};
export type CommercialOrderRecord = {
    id: string;
    title: string;
    requirements: string;
    referenceMaterials: JsonValue;
    acceptanceCriteria: string;
    internalAmountCents: number;
    deadlineAt?: string;
    assignedSchoolId?: string;
    teacherMembershipId?: string;
    classId?: string;
    status: CommercialOrderStatus;
    platformFeedback: string;
    createdByUserId?: string;
    createdAt: string;
    updatedAt: string;
};
export type CommercialOrderParticipantRecord = {
    id: string;
    schoolId: string;
    orderId: string;
    membershipId: string;
    candidateReferences: JsonValue;
    note: string;
    status: "active" | "submitted";
    submittedAt?: string;
    createdAt: string;
    updatedAt: string;
};
export type CommercialOrderDeliveryRecord = {
    id: string;
    schoolId: string;
    orderId: string;
    submittedByMembershipId: string;
    contentReferences: SchoolContentReference[];
    note: string;
    status: "submitted" | "revision_required" | "accepted";
    platformFeedback: string;
    submittedAt: string;
    reviewedAt?: string;
    createdAt: string;
    updatedAt: string;
};

export interface SchoolDomainRepository {
    listSchools(input: PageQuery & { keyword?: string; status?: SchoolStatus }): Promise<Page<SchoolRecord>>;
    getSchool(schoolId: string, forUpdate?: boolean): Promise<SchoolRecord | null>;
    updateSchool(schoolId: string, patch: SchoolUpdate): Promise<SchoolRecord | null>;
    getSchoolContextByUserId(userId: string): Promise<SchoolContextRecord | null>;
    getMembership(schoolId: string, membershipId: string, forUpdate?: boolean): Promise<SchoolMembershipRecord | null>;
    getMembershipByUserId(userId: string, forUpdate?: boolean): Promise<SchoolMembershipRecord | null>;
    updateMembership(schoolId: string, membershipId: string, patch: SchoolMembershipUpdate): Promise<SchoolMembershipRecord | null>;
    deleteMembership(schoolId: string, membershipId: string): Promise<boolean>;
    listMembers(schoolId: string, input: MemberPageQuery): Promise<Page<SchoolMembershipRecord>>;
    getInviteCodeByRole(schoolId: string, role: SchoolMemberRole, forUpdate?: boolean): Promise<SchoolInviteCodeRecord | null>;
    getInviteCodeByDigest(codeDigest: string, forUpdate?: boolean): Promise<SchoolInviteCodeRecord | null>;
    upsertInviteCode(record: SchoolInviteCodeRecord): Promise<SchoolInviteCodeRecord>;
    listClasses(schoolId: string, input: PageQuery): Promise<Page<SchoolClassRecord>>;
    getClass(schoolId: string, classId: string, forUpdate?: boolean): Promise<SchoolClassRecord | null>;
    updateClass(schoolId: string, classId: string, patch: SchoolClassUpdate): Promise<SchoolClassRecord | null>;
    deleteClass(schoolId: string, classId: string): Promise<boolean>;
    listClassMembers(schoolId: string, classId: string, input: PageQuery): Promise<Page<SchoolMembershipRecord>>;
    listAssignedCourses(schoolId: string, input: PageQuery): Promise<Page<SchoolCourseAssignmentRecord>>;
    listOfferingsForTeacher(schoolId: string, membershipId: string, input: PageQuery): Promise<Page<SchoolCourseOfferingRecord>>;
    listAssignmentsForStudent(schoolId: string, membershipId: string, input: PageQuery): Promise<Page<TeachingAssignmentRecord>>;
    getCommercialOrder(schoolId: string, orderId: string, forUpdate?: boolean): Promise<CommercialOrderRecord | null>;
    listCommercialOrders(schoolId: string, input: OrderPageQuery): Promise<Page<CommercialOrderRecord>>;
    insertSchool(record: SchoolRecord): Promise<SchoolRecord>;
    insertMembership(record: SchoolMembershipRecord): Promise<SchoolMembershipRecord>;
    insertClass(record: SchoolClassRecord): Promise<SchoolClassRecord>;
    replaceClassMembers(schoolId: string, classId: string, membershipIds: string[]): Promise<void>;
    insertPlatformCourse(record: PlatformCourseRecord): Promise<PlatformCourseRecord>;
    assignCourseToSchools(courseId: string, records: SchoolCourseAssignmentInput[]): Promise<SchoolCourseAssignmentRecord[]>;
    insertCourseOffering(record: SchoolCourseOfferingRecord): Promise<SchoolCourseOfferingRecord>;
    insertTeachingAssignment(record: TeachingAssignmentRecord): Promise<TeachingAssignmentRecord>;
    insertTeachingSubmission(record: TeachingSubmissionRecord): Promise<TeachingSubmissionRecord>;
    insertCommercialOrder(record: CommercialOrderRecord): Promise<CommercialOrderRecord>;
    insertCommercialOrderParticipant(record: CommercialOrderParticipantRecord): Promise<CommercialOrderParticipantRecord>;
    insertCommercialOrderDelivery(record: CommercialOrderDeliveryRecord): Promise<CommercialOrderDeliveryRecord>;
    compareAndSetCommercialOrderStatus(schoolId: string, orderId: string, expected: CommercialOrderStatus, next: CommercialOrderStatus, updatedAt: string): Promise<boolean>;
    transact<T>(operation: (repository: SchoolDomainRepository) => Promise<T>): Promise<T>;
}

export function createSchoolDomainRepository(executor?: QueryExecutor): SchoolDomainRepository {
    if (executor) return createPostgresSchoolDomainRepository(executor);
    return getDatabaseProvider() === "file" ? createFileSchoolDomainRepository() : createPostgresSchoolDomainRepository();
}
