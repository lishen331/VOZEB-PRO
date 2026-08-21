import { formatAccountId } from "@/lib/account-id";
import { AUTH_DATA_FILE } from "@/lib/auth/store-foundation";
import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";
import { SchoolDomainReferenceConflictError } from "@/lib/server/school-domain-errors";
import type {
    CommercialOrderParticipantRecord,
    CommercialOrderParticipantUpdate,
    CommercialOrderRecord,
    CommercialOrderDeliveryRecord,
    CommercialOrderDeliveryUpdate,
    CommercialOrderDraftUpdate,
    CommercialOrderConfigurationUpdate,
    ClassPageQuery,
    MemberPageQuery,
    OrderPageQuery,
    Page,
    PageQuery,
    PlatformCoursePageQuery,
    PlatformCourseRecord,
    PlatformCourseUpdate,
    SchoolClassMemberRecord,
    SchoolClassRecord,
    SchoolClassUpdate,
    SchoolContextRecord,
    SchoolCourseAssignmentRecord,
    SchoolCourseAssignmentInput,
    SchoolCourseOfferingRecord,
    SchoolDomainRepository,
    SchoolInviteCodeRecord,
    SchoolMembershipRecord,
    SchoolMembershipUpdate,
    SchoolRecord,
    SchoolUpdate,
    TeachingAssignmentRecord,
    TeachingAssignmentUpdate,
    TeachingSubmissionRecord,
    TeachingSubmissionPageQuery,
    TeachingSubmissionUpdate,
} from "@/lib/server/school-domain-repository";
import type { CommercialOrderStatus, SchoolMemberRole, SchoolStatus } from "@/lib/school-domain";

export const SCHOOL_DOMAIN_DATA_FILE = "school-domain.json";

type SchoolDomainFile = {
    version: 1;
    schools: SchoolRecord[];
    memberships: SchoolMembershipRecord[];
    inviteCodes: SchoolInviteCodeRecord[];
    classes: SchoolClassRecord[];
    classMembers: SchoolClassMemberRecord[];
    courses: PlatformCourseRecord[];
    courseAssignments: SchoolCourseAssignmentRecord[];
    courseOfferings: SchoolCourseOfferingRecord[];
    teachingAssignments: TeachingAssignmentRecord[];
    teachingSubmissions: TeachingSubmissionRecord[];
    commercialOrders: CommercialOrderRecord[];
    commercialOrderParticipants: CommercialOrderParticipantRecord[];
    commercialOrderDeliveries: CommercialOrderDeliveryRecord[];
};

const EMPTY_SCHOOL_DOMAIN_FILE: SchoolDomainFile = {
    version: 1,
    schools: [],
    memberships: [],
    inviteCodes: [],
    classes: [],
    classMembers: [],
    courses: [],
    courseAssignments: [],
    courseOfferings: [],
    teachingAssignments: [],
    teachingSubmissions: [],
    commercialOrders: [],
    commercialOrderParticipants: [],
    commercialOrderDeliveries: [],
};

let mutationQueue = Promise.resolve();

export function createFileSchoolDomainRepository(): SchoolDomainRepository {
    return new FileSchoolDomainRepository();
}

export async function mutateFileSchoolDomainInsideLock<T>(operation: (repository: SchoolDomainRepository) => Promise<T>): Promise<T> {
    const state = normalizeFile(await readJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, EMPTY_SCHOOL_DOMAIN_FILE));
    const result = await operation(new FileSchoolDomainRepository(state));
    await writeJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, state);
    return result;
}

class FileSchoolDomainRepository implements SchoolDomainRepository {
    constructor(private readonly transactionState?: SchoolDomainFile) {}

    async listSchools(input: PageQuery & { keyword?: string; status?: SchoolStatus }) {
        const state = await this.read();
        const keyword = input.keyword?.trim().toLowerCase();
        return paginate(
            state.schools.filter((school) => (!input.status || school.status === input.status) && (!keyword || school.id.toLowerCase().includes(keyword) || school.name.toLowerCase().includes(keyword))),
            input,
        );
    }

    async listSchoolsByIds(schoolIds: string[]) {
        const selected = new Set(schoolIds);
        return (await this.read()).schools
            .filter((item) => selected.has(item.id))
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((item) => structuredClone(item));
    }

    async getSchool(schoolId: string) {
        return detached((await this.read()).schools.find((item) => item.id === schoolId));
    }

    updateSchool(schoolId: string, patch: SchoolUpdate) {
        return this.mutate((state) => {
            const school = state.schools.find((item) => item.id === schoolId);
            if (!school) return null;
            if (patch.name !== undefined) school.name = patch.name;
            if (patch.profile !== undefined) school.profile = structuredClone(patch.profile);
            if (patch.status !== undefined) school.status = patch.status;
            school.updatedAt = patch.updatedAt;
            return structuredClone(school);
        });
    }

    async getSchoolContextByUserId(userId: string): Promise<SchoolContextRecord | null> {
        const state = await this.read();
        const membership = state.memberships.find((item) => item.userId === userId);
        if (!membership) return null;
        const school = state.schools.find((item) => item.id === membership.schoolId);
        return school ? { school: structuredClone(school), membership: structuredClone(membership), canManageSchool: membership.role === "teacher" && membership.permissions.includes("school.manage") } : null;
    }

    async getMembership(schoolId: string, membershipId: string) {
        return detached((await this.read()).memberships.find((item) => item.schoolId === schoolId && item.id === membershipId));
    }

    async getMembershipByUserId(userId: string) {
        return detached((await this.read()).memberships.find((item) => item.userId === userId));
    }

    updateMembership(schoolId: string, membershipId: string, patch: SchoolMembershipUpdate) {
        return this.mutate((state) => {
            const membership = state.memberships.find((item) => item.schoolId === schoolId && item.id === membershipId);
            if (!membership) return null;
            if (patch.role !== undefined) membership.role = patch.role;
            if (patch.permissions !== undefined) membership.permissions = structuredClone(patch.permissions);
            if (patch.status !== undefined) membership.status = patch.status;
            membership.updatedAt = patch.updatedAt;
            return structuredClone(membership);
        });
    }

    deleteMembership(schoolId: string, membershipId: string) {
        return this.mutate((state) => {
            const index = state.memberships.findIndex((item) => item.schoolId === schoolId && item.id === membershipId);
            if (index < 0) return false;
            if (
                state.courseOfferings.some((item) => item.schoolId === schoolId && item.teacherMembershipId === membershipId) ||
                state.teachingAssignments.some((item) => item.schoolId === schoolId && item.teacherMembershipId === membershipId) ||
                state.teachingSubmissions.some((item) => item.schoolId === schoolId && item.studentMembershipId === membershipId) ||
                state.commercialOrders.some((item) => item.assignedSchoolId === schoolId && item.teacherMembershipId === membershipId) ||
                state.commercialOrderParticipants.some((item) => item.schoolId === schoolId && item.membershipId === membershipId) ||
                state.commercialOrderDeliveries.some((item) => item.schoolId === schoolId && item.submittedByMembershipId === membershipId)
            ) {
                throw new Error("学校成员仍被业务记录引用");
            }
            state.memberships.splice(index, 1);
            state.classMembers = state.classMembers.filter((item) => item.schoolId !== schoolId || item.membershipId !== membershipId);
            return true;
        });
    }

    async listMembers(schoolId: string, input: MemberPageQuery) {
        const keyword = input.keyword?.trim().toLowerCase();
        const state = await this.read();
        const auth = keyword ? await readJsonDataFile<{ users?: Array<{ id?: unknown; accountId?: unknown; username?: unknown; displayName?: unknown; email?: unknown }> }>(AUTH_DATA_FILE, { users: [] }) : undefined;
        const matchingUserIds = new Set(
            (auth?.users || [])
                .filter((user) => {
                    const accountId = user.accountId === undefined ? "" : formatAccountId(user.accountId);
                    return [accountId, user.username, user.displayName, user.email].some((value) =>
                        String(value || "")
                            .toLowerCase()
                            .includes(keyword || ""),
                    );
                })
                .map((user) => String(user.id || ""))
                .filter(Boolean),
        );
        const classMembershipIds = input.classId ? new Set(state.classMembers.filter((item) => item.schoolId === schoolId && item.classId === input.classId).map((item) => item.membershipId)) : undefined;
        return paginate(
            state.memberships.filter(
                (item) =>
                    item.schoolId === schoolId &&
                    (!input.role || item.role === input.role) &&
                    (!input.status || item.status === input.status) &&
                    (!classMembershipIds || classMembershipIds.has(item.id)) &&
                    (!keyword || item.id.toLowerCase().includes(keyword) || matchingUserIds.has(item.userId)),
            ),
            input,
        );
    }

    async listFirstManagers(schoolIds: string[]) {
        if (!schoolIds.length) return [];
        const selected = new Set(schoolIds);
        const managers = (await this.read()).memberships
            .filter((item) => selected.has(item.schoolId) && item.role === "teacher" && item.permissions.includes("school.manage"))
            .sort((left, right) => left.schoolId.localeCompare(right.schoolId) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
        const seen = new Set<string>();
        return managers.filter((manager) => !seen.has(manager.schoolId) && Boolean(seen.add(manager.schoolId))).map((manager) => structuredClone(manager));
    }

    async getInviteCodeByRole(schoolId: string, role: SchoolInviteCodeRecord["role"]) {
        return detached((await this.read()).inviteCodes.find((item) => item.schoolId === schoolId && item.role === role));
    }

    async getInviteCodeByDigest(codeDigest: string) {
        return detached((await this.read()).inviteCodes.find((item) => item.codeDigest === codeDigest));
    }

    upsertInviteCode(record: SchoolInviteCodeRecord) {
        return this.mutate((state) => {
            if (!state.schools.some((item) => item.id === record.schoolId)) throw new Error("学校不存在");
            if (state.inviteCodes.some((item) => item.codeDigest === record.codeDigest && (item.schoolId !== record.schoolId || item.role !== record.role))) throw new Error("邀请码摘要已存在");
            const existing = state.inviteCodes.find((item) => item.schoolId === record.schoolId && item.role === record.role);
            if (state.inviteCodes.some((item) => item.id === record.id && item !== existing)) throw new Error(`记录已存在：${record.id}`);
            if (existing) {
                existing.codeDigest = record.codeDigest;
                existing.status = record.status;
                existing.expiresAt = record.expiresAt;
                existing.updatedAt = record.updatedAt;
                return structuredClone(existing);
            }
            assertUniqueId(state.inviteCodes, record.id);
            state.inviteCodes.push(structuredClone(record));
            return structuredClone(record);
        });
    }

    async listClasses(schoolId: string, input: ClassPageQuery) {
        const keyword = input.keyword?.trim().toLowerCase() || "";
        return paginate(
            (await this.read()).classes.filter((item) => item.schoolId === schoolId && (!input.status || item.status === input.status) && (!keyword || `${item.name} ${item.description}`.toLowerCase().includes(keyword))),
            input,
        );
    }

    async getClass(schoolId: string, classId: string) {
        return detached((await this.read()).classes.find((item) => item.schoolId === schoolId && item.id === classId));
    }

    updateClass(schoolId: string, classId: string, patch: SchoolClassUpdate) {
        return this.mutate((state) => {
            const schoolClass = state.classes.find((item) => item.schoolId === schoolId && item.id === classId);
            if (!schoolClass) return null;
            if (patch.name !== undefined) schoolClass.name = patch.name;
            if (patch.description !== undefined) schoolClass.description = patch.description;
            if (patch.status !== undefined) schoolClass.status = patch.status;
            schoolClass.updatedAt = patch.updatedAt;
            return structuredClone(schoolClass);
        });
    }

    deleteClass(schoolId: string, classId: string) {
        return this.mutate((state) => {
            const index = state.classes.findIndex((item) => item.schoolId === schoolId && item.id === classId);
            if (index < 0) return false;
            if (state.courseOfferings.some((item) => item.schoolId === schoolId && item.classId === classId) || state.commercialOrders.some((item) => item.assignedSchoolId === schoolId && item.classId === classId)) {
                throw new SchoolDomainReferenceConflictError("班级仍被课程或商单引用");
            }
            state.classes.splice(index, 1);
            state.classMembers = state.classMembers.filter((item) => item.schoolId !== schoolId || item.classId !== classId);
            return true;
        });
    }

    async listClassMembers(schoolId: string, classId: string, input: PageQuery) {
        const state = await this.read();
        const membershipIds = new Set(state.classMembers.filter((item) => item.schoolId === schoolId && item.classId === classId).map((item) => item.membershipId));
        return paginate(
            state.memberships.filter((item) => item.schoolId === schoolId && membershipIds.has(item.id)),
            input,
        );
    }

    async listAssignedCourses(schoolId: string, input: PageQuery) {
        return paginate(
            (await this.read()).courseAssignments.filter((item) => item.schoolId === schoolId),
            input,
        );
    }

    async listVisibleCourses(schoolId: string, membershipId: string, role: SchoolMemberRole, input: PageQuery) {
        const state = await this.read();
        const classIds = role === "student" ? new Set(state.classMembers.filter((item) => item.schoolId === schoolId && item.membershipId === membershipId).map((item) => item.classId)) : null;
        const assignmentIds = new Set(state.courseOfferings.filter((item) => item.schoolId === schoolId && (role === "teacher" ? item.teacherMembershipId === membershipId : classIds?.has(item.classId))).map((item) => item.assignmentId));
        return paginate(
            state.courseAssignments.filter((item) => item.schoolId === schoolId && assignmentIds.has(item.id)),
            input,
        );
    }

    async listPlatformCourses(input: PlatformCoursePageQuery) {
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const courses = (await this.read()).courses
            .filter((item) => !input.status || item.status === input.status)
            .filter((item) => !keyword || `${item.id} ${item.title} ${item.summary}`.toLowerCase().includes(keyword))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
        return paginate(courses, input);
    }

    async getPlatformCourse(courseId: string) {
        return detached((await this.read()).courses.find((item) => item.id === courseId));
    }

    updatePlatformCourse(courseId: string, patch: PlatformCourseUpdate) {
        return this.mutate((state) => {
            const course = state.courses.find((item) => item.id === courseId);
            if (!course) return null;
            Object.assign(course, { ...patch, id: course.id });
            return structuredClone(course);
        });
    }

    async getSchoolCourseAssignment(schoolId: string, assignmentId: string) {
        return detached((await this.read()).courseAssignments.find((item) => item.schoolId === schoolId && item.id === assignmentId));
    }

    async listOfferingsForAssignment(schoolId: string, assignmentId: string, input: PageQuery) {
        return paginate(
            (await this.read()).courseOfferings.filter((item) => item.schoolId === schoolId && item.assignmentId === assignmentId),
            input,
        );
    }

    async getCourseOffering(schoolId: string, offeringId: string) {
        return detached((await this.read()).courseOfferings.find((item) => item.schoolId === schoolId && item.id === offeringId));
    }

    async listOfferingsForTeacher(schoolId: string, membershipId: string, input: PageQuery) {
        return paginate(
            (await this.read()).courseOfferings.filter((item) => item.schoolId === schoolId && item.teacherMembershipId === membershipId),
            input,
        );
    }

    async listAssignmentsForStudent(schoolId: string, membershipId: string, input: PageQuery) {
        const state = await this.read();
        const classIds = new Set(state.classMembers.filter((item) => item.schoolId === schoolId && item.membershipId === membershipId).map((item) => item.classId));
        const offeringIds = new Set(state.courseOfferings.filter((item) => item.schoolId === schoolId && classIds.has(item.classId)).map((item) => item.id));
        return paginate(
            state.teachingAssignments.filter((item) => item.schoolId === schoolId && (item.status === "published" || item.status === "closed") && offeringIds.has(item.offeringId)),
            input,
        );
    }

    async listAssignmentsForTeacher(schoolId: string, membershipId: string, input: PageQuery) {
        return paginate(
            (await this.read()).teachingAssignments.filter((item) => item.schoolId === schoolId && item.teacherMembershipId === membershipId),
            input,
        );
    }

    async getTeachingAssignment(schoolId: string, assignmentId: string) {
        return detached((await this.read()).teachingAssignments.find((item) => item.schoolId === schoolId && item.id === assignmentId));
    }

    updateTeachingAssignment(schoolId: string, assignmentId: string, patch: TeachingAssignmentUpdate) {
        return this.mutate((state) => {
            const assignment = state.teachingAssignments.find((item) => item.schoolId === schoolId && item.id === assignmentId);
            if (!assignment) return null;
            Object.assign(assignment, patch);
            if (patch.dueAt === "") delete assignment.dueAt;
            return structuredClone(assignment);
        });
    }

    async listTeachingSubmissions(schoolId: string, assignmentId: string, input: PageQuery) {
        return paginate(
            (await this.read()).teachingSubmissions.filter((item) => item.schoolId === schoolId && item.assignmentId === assignmentId),
            input,
        );
    }

    async listTeachingSubmissionsForStudent(schoolId: string, studentMembershipId: string, input: TeachingSubmissionPageQuery) {
        const assignmentIds = new Set(input.assignmentIds || []);
        const state = await this.read();
        const classIds = new Set(state.classMembers.filter((item) => item.schoolId === schoolId && item.membershipId === studentMembershipId).map((item) => item.classId));
        const offeringIds = new Set(state.courseOfferings.filter((item) => item.schoolId === schoolId && classIds.has(item.classId)).map((item) => item.id));
        const visibleAssignmentIds = new Set(state.teachingAssignments.filter((item) => item.schoolId === schoolId && offeringIds.has(item.offeringId) && (item.status === "published" || item.status === "closed")).map((item) => item.id));
        return paginate(
            state.teachingSubmissions.filter((item) => item.schoolId === schoolId && item.studentMembershipId === studentMembershipId && visibleAssignmentIds.has(item.assignmentId) && (!assignmentIds.size || assignmentIds.has(item.assignmentId))),
            input,
        );
    }

    async getTeachingSubmission(schoolId: string, submissionId: string) {
        return detached((await this.read()).teachingSubmissions.find((item) => item.schoolId === schoolId && item.id === submissionId));
    }

    async getTeachingSubmissionByAssignmentAndStudent(schoolId: string, assignmentId: string, studentMembershipId: string) {
        return detached((await this.read()).teachingSubmissions.find((item) => item.schoolId === schoolId && item.assignmentId === assignmentId && item.studentMembershipId === studentMembershipId));
    }

    updateTeachingSubmission(schoolId: string, submissionId: string, patch: TeachingSubmissionUpdate) {
        return this.mutate((state) => {
            const submission = state.teachingSubmissions.find((item) => item.schoolId === schoolId && item.id === submissionId);
            if (!submission) return null;
            Object.assign(submission, patch);
            if (patch.reviewedAt === "") delete submission.reviewedAt;
            return structuredClone(submission);
        });
    }

    async isClassMember(schoolId: string, classId: string, membershipId: string) {
        return (await this.read()).classMembers.some((item) => item.schoolId === schoolId && item.classId === classId && item.membershipId === membershipId);
    }

    async getCommercialOrder(schoolId: string, orderId: string) {
        return detached((await this.read()).commercialOrders.find((item) => item.assignedSchoolId === schoolId && item.id === orderId));
    }

    async listCommercialOrders(schoolId: string, input: OrderPageQuery) {
        const keyword = input.keyword?.trim().toLowerCase();
        return paginate(
            (await this.read()).commercialOrders.filter(
                (item) => item.assignedSchoolId === schoolId && (!input.status || item.status === input.status) && (!keyword || item.id.toLowerCase().includes(keyword) || item.title.toLowerCase().includes(keyword)),
            ),
            input,
        );
    }

    async getPlatformCommercialOrder(orderId: string) {
        return detached((await this.read()).commercialOrders.find((item) => item.id === orderId));
    }

    async listPlatformCommercialOrders(input: OrderPageQuery) {
        const keyword = input.keyword?.trim().toLowerCase();
        return paginate(
            (await this.read()).commercialOrders.filter((item) => (!input.status || item.status === input.status) && (!keyword || item.id.toLowerCase().includes(keyword) || item.title.toLowerCase().includes(keyword))),
            input,
        );
    }

    updateCommercialOrderDraft(orderId: string, patch: CommercialOrderDraftUpdate) {
        return this.mutate((state) => {
            const order = state.commercialOrders.find((item) => item.id === orderId && item.status === "draft");
            if (!order) return null;
            Object.assign(order, patch);
            if (patch.deadlineAt === "") delete order.deadlineAt;
            return structuredClone(order);
        });
    }

    assignCommercialOrderToSchool(orderId: string, schoolId: string, updatedAt: string) {
        return this.mutate((state) => {
            const order = state.commercialOrders.find((item) => item.id === orderId && (item.status === "draft" || item.status === "assigned"));
            if (!order) return null;
            if (!state.schools.some((item) => item.id === schoolId && item.status === "active")) throw new Error("学校不存在或已停用");
            if (order.assignedSchoolId && order.assignedSchoolId !== schoolId) {
                state.commercialOrderParticipants = state.commercialOrderParticipants.filter((item) => item.orderId !== orderId);
                state.commercialOrderDeliveries = state.commercialOrderDeliveries.filter((item) => item.orderId !== orderId);
                delete order.teacherMembershipId;
                delete order.classId;
                delete order.productionGroupId;
            }
            order.assignedSchoolId = schoolId;
            order.status = "assigned";
            order.updatedAt = updatedAt;
            return structuredClone(order);
        });
    }

    configureCommercialOrder(schoolId: string, orderId: string, patch: CommercialOrderConfigurationUpdate) {
        return this.mutate((state) => {
            const order = state.commercialOrders.find((item) => item.assignedSchoolId === schoolId && item.id === orderId);
            if (!order) return null;
            if (patch.teacherMembershipId) assertSchoolRelation(state.memberships, schoolId, patch.teacherMembershipId, "学校成员");
            if (patch.classId) assertSchoolRelation(state.classes, schoolId, patch.classId, "班级");
            Object.assign(order, patch);
            if (!patch.classId) delete order.classId;
            return structuredClone(order);
        });
    }

    setCommercialOrderProductionGroup(schoolId: string, orderId: string, groupId: string | undefined, updatedAt: string) {
        return this.mutate((state) => {
            const order = state.commercialOrders.find((item) => item.assignedSchoolId === schoolId && item.id === orderId);
            if (!order) return null;
            if (groupId && !state.commercialOrders.some((item) => item.id === orderId && item.assignedSchoolId === schoolId)) throw new Error("商单不属于当前学校");
            order.productionGroupId = groupId;
            order.updatedAt = updatedAt;
            return structuredClone(order);
        });
    }

    listCommercialOrdersForProductionGroup(schoolId: string, groupId: string, input: OrderPageQuery) {
        return this.filterCommercialOrders(input, (item) => item.assignedSchoolId === schoolId && item.productionGroupId === groupId);
    }

    async listCommercialOrdersForTeacher(schoolId: string, membershipId: string, input: OrderPageQuery) {
        return this.filterCommercialOrders(input, (item) => item.assignedSchoolId === schoolId && item.teacherMembershipId === membershipId);
    }

    async listCommercialOrdersForParticipant(schoolId: string, membershipId: string, input: OrderPageQuery) {
        const state = await this.read();
        const ids = new Set(state.commercialOrderParticipants.filter((item) => item.schoolId === schoolId && item.membershipId === membershipId).map((item) => item.orderId));
        return paginate(
            filterOrders(state.commercialOrders, input, (item) => item.assignedSchoolId === schoolId && ids.has(item.id)),
            input,
        );
    }

    async listCommercialOrderParticipants(schoolId: string, orderId: string, input: PageQuery) {
        return paginate(
            (await this.read()).commercialOrderParticipants.filter((item) => item.schoolId === schoolId && item.orderId === orderId),
            input,
        );
    }

    async listCommercialOrderParticipantMembershipIds(schoolId: string, orderId: string) {
        const state = await this.read();
        const activeStudentIds = new Set(state.memberships.filter((item) => item.schoolId === schoolId && item.role === "student" && item.status === "active").map((item) => item.id));
        return state.commercialOrderParticipants.filter((item) => item.schoolId === schoolId && item.orderId === orderId && activeStudentIds.has(item.membershipId)).map((item) => item.membershipId);
    }

    async hasActiveCommercialOrderParticipant(schoolId: string, orderId: string) {
        const state = await this.read();
        return state.commercialOrderParticipants.some(
            (participant) =>
                participant.schoolId === schoolId &&
                participant.orderId === orderId &&
                state.memberships.some((membership) => membership.schoolId === schoolId && membership.id === participant.membershipId && membership.role === "student" && membership.status === "active"),
        );
    }

    async getCommercialOrderParticipant(schoolId: string, orderId: string, membershipId: string) {
        return detached((await this.read()).commercialOrderParticipants.find((item) => item.schoolId === schoolId && item.orderId === orderId && item.membershipId === membershipId));
    }

    replaceCommercialOrderParticipants(schoolId: string, orderId: string, records: CommercialOrderParticipantRecord[]) {
        return this.mutate((state) => {
            assertCommercialOrderRelation(state, schoolId, orderId);
            const membershipIds = new Set<string>();
            for (const record of records) {
                if (record.schoolId !== schoolId || record.orderId !== orderId || membershipIds.has(record.membershipId)) throw new Error("商单参与记录无效");
                assertSchoolRelation(state.memberships, schoolId, record.membershipId, "学校成员");
                membershipIds.add(record.membershipId);
            }
            state.commercialOrderParticipants = state.commercialOrderParticipants.filter((item) => item.schoolId !== schoolId || item.orderId !== orderId);
            state.commercialOrderParticipants.push(...structuredClone(records));
        });
    }

    updateCommercialOrderParticipant(schoolId: string, orderId: string, membershipId: string, patch: CommercialOrderParticipantUpdate) {
        return this.mutate((state) => {
            const participant = state.commercialOrderParticipants.find((item) => item.schoolId === schoolId && item.orderId === orderId && item.membershipId === membershipId);
            if (!participant) return null;
            Object.assign(participant, patch);
            if (patch.submittedAt === "") delete participant.submittedAt;
            return structuredClone(participant);
        });
    }

    async listCommercialOrderDeliveries(schoolId: string, orderId: string, input: PageQuery) {
        return paginate(
            (await this.read()).commercialOrderDeliveries.filter((item) => item.schoolId === schoolId && item.orderId === orderId),
            input,
        );
    }

    async getLatestCommercialOrderDelivery(orderId: string) {
        return detached((await this.read()).commercialOrderDeliveries.filter((item) => item.orderId === orderId).sort((left, right) => right.submittedAt.localeCompare(left.submittedAt) || right.id.localeCompare(left.id))[0]);
    }

    updateCommercialOrderDelivery(deliveryId: string, patch: CommercialOrderDeliveryUpdate) {
        return this.mutate((state) => {
            const delivery = state.commercialOrderDeliveries.find((item) => item.id === deliveryId);
            if (!delivery) return null;
            Object.assign(delivery, patch);
            if (!patch.reviewedAt) delete delivery.reviewedAt;
            return structuredClone(delivery);
        });
    }

    insertSchool(record: SchoolRecord) {
        return this.insert("schools", record);
    }

    insertMembership(record: SchoolMembershipRecord) {
        return this.mutate((state) => {
            if (!state.schools.some((item) => item.id === record.schoolId)) throw new Error("学校不存在");
            assertUniqueId(state.memberships, record.id);
            if (state.memberships.some((item) => item.userId === record.userId)) throw new Error("用户已加入学校");
            state.memberships.push(structuredClone(record));
            return record;
        });
    }

    insertClass(record: SchoolClassRecord) {
        return this.mutate((state) => {
            if (!state.schools.some((item) => item.id === record.schoolId)) throw new Error("学校不存在");
            assertUniqueId(state.classes, record.id);
            state.classes.push(structuredClone(record));
            return record;
        });
    }

    replaceClassMembers(schoolId: string, classId: string, membershipIds: string[]) {
        return this.mutate((state) => {
            if (!state.classes.some((item) => item.schoolId === schoolId && item.id === classId)) throw new Error("班级不存在");
            const selected = Array.from(new Set(membershipIds));
            if (selected.some((id) => !state.memberships.some((item) => item.schoolId === schoolId && item.id === id))) throw new Error("班级只能添加本学校成员");
            state.classMembers = state.classMembers.filter((item) => item.schoolId !== schoolId || item.classId !== classId);
            const createdAt = new Date().toISOString();
            state.classMembers.push(...selected.map((membershipId) => ({ id: `${classId}:${membershipId}`, schoolId, classId, membershipId, createdAt })));
        });
    }

    insertPlatformCourse(record: PlatformCourseRecord) {
        return this.insert("courses", record);
    }

    assignCourseToSchools(courseId: string, records: SchoolCourseAssignmentInput[]) {
        return this.mutate((state) => {
            if (!state.courses.some((item) => item.id === courseId)) throw new Error("课程不存在");
            const assignedRecords: SchoolCourseAssignmentRecord[] = [];
            for (const record of records) {
                if (!state.schools.some((item) => item.id === record.schoolId)) throw new Error("课程学校分配无效");
                const assigned = { ...structuredClone(record), courseId };
                const existing = state.courseAssignments.find((item) => item.courseId === courseId && item.schoolId === record.schoolId);
                if (state.courseAssignments.some((item) => item.id === record.id && item !== existing)) throw new Error(`记录已存在：${record.id}`);
                if (existing) {
                    existing.status = assigned.status;
                    existing.updatedAt = assigned.updatedAt;
                    assignedRecords.push(structuredClone(existing));
                } else {
                    assertUniqueId(state.courseAssignments, record.id);
                    state.courseAssignments.push(assigned);
                    assignedRecords.push(structuredClone(assigned));
                }
            }
            return assignedRecords;
        });
    }

    insertCourseOffering(record: SchoolCourseOfferingRecord) {
        return this.mutate((state) => {
            assertSchoolRelation(state.courseAssignments, record.schoolId, record.assignmentId, "课程分配");
            assertSchoolRelation(state.classes, record.schoolId, record.classId, "班级");
            assertSchoolRelation(state.memberships, record.schoolId, record.teacherMembershipId, "学校成员");
            assertUniqueId(state.courseOfferings, record.id);
            if (state.courseOfferings.some((item) => item.assignmentId === record.assignmentId && item.classId === record.classId && item.teacherMembershipId === record.teacherMembershipId)) throw new Error("课程安排已存在");
            state.courseOfferings.push(structuredClone(record));
            return record;
        });
    }

    insertTeachingAssignment(record: TeachingAssignmentRecord) {
        return this.mutate((state) => {
            assertSchoolRelation(state.courseOfferings, record.schoolId, record.offeringId, "课程安排");
            assertSchoolRelation(state.memberships, record.schoolId, record.teacherMembershipId, "学校成员");
            assertUniqueId(state.teachingAssignments, record.id);
            state.teachingAssignments.push(structuredClone(record));
            return record;
        });
    }

    insertTeachingSubmission(record: TeachingSubmissionRecord) {
        return this.mutate((state) => {
            assertSchoolRelation(state.teachingAssignments, record.schoolId, record.assignmentId, "教学任务");
            assertSchoolRelation(state.memberships, record.schoolId, record.studentMembershipId, "学校成员");
            assertUniqueId(state.teachingSubmissions, record.id);
            if (state.teachingSubmissions.some((item) => item.assignmentId === record.assignmentId && item.studentMembershipId === record.studentMembershipId)) throw new Error("作业提交已存在");
            state.teachingSubmissions.push(structuredClone(record));
            return record;
        });
    }

    insertCommercialOrder(record: CommercialOrderRecord) {
        return this.mutate((state) => {
            if (!record.assignedSchoolId && record.status !== "draft" && record.status !== "cancelled") throw new Error("非草稿商单必须指定分配学校");
            if (!record.assignedSchoolId && (record.teacherMembershipId || record.classId)) throw new Error("商单负责人和班级需要分配学校");
            if (record.assignedSchoolId) {
                if (!state.schools.some((item) => item.id === record.assignedSchoolId)) throw new Error("学校不存在");
                if (record.teacherMembershipId) assertSchoolRelation(state.memberships, record.assignedSchoolId, record.teacherMembershipId, "学校成员");
                if (record.classId) assertSchoolRelation(state.classes, record.assignedSchoolId, record.classId, "班级");
            }
            assertUniqueId(state.commercialOrders, record.id);
            state.commercialOrders.push(structuredClone(record));
            return record;
        });
    }

    insertCommercialOrderParticipant(record: CommercialOrderParticipantRecord) {
        return this.mutate((state) => {
            assertCommercialOrderRelation(state, record.schoolId, record.orderId);
            assertSchoolRelation(state.memberships, record.schoolId, record.membershipId, "学校成员");
            assertUniqueId(state.commercialOrderParticipants, record.id);
            if (state.commercialOrderParticipants.some((item) => item.orderId === record.orderId && item.membershipId === record.membershipId)) throw new Error("商单参与记录已存在");
            state.commercialOrderParticipants.push(structuredClone(record));
            return record;
        });
    }

    insertCommercialOrderDelivery(record: CommercialOrderDeliveryRecord) {
        return this.mutate((state) => {
            assertCommercialOrderRelation(state, record.schoolId, record.orderId);
            assertSchoolRelation(state.memberships, record.schoolId, record.submittedByMembershipId, "学校成员");
            assertUniqueId(state.commercialOrderDeliveries, record.id);
            state.commercialOrderDeliveries.push(structuredClone(record));
            return record;
        });
    }

    compareAndSetCommercialOrderStatus(schoolId: string, orderId: string, expected: CommercialOrderStatus, next: CommercialOrderStatus, updatedAt: string) {
        return this.mutate((state) => {
            const order = state.commercialOrders.find((item) => item.assignedSchoolId === schoolId && item.id === orderId && item.status === expected);
            if (!order) return false;
            order.status = next;
            order.updatedAt = updatedAt;
            return true;
        });
    }

    compareAndSetPlatformCommercialOrderStatus(orderId: string, expected: CommercialOrderStatus, next: CommercialOrderStatus, updatedAt: string, platformFeedback?: string) {
        return this.mutate((state) => {
            const order = state.commercialOrders.find((item) => item.id === orderId && item.status === expected);
            if (!order) return false;
            order.status = next;
            order.updatedAt = updatedAt;
            if (platformFeedback !== undefined) order.platformFeedback = platformFeedback;
            return true;
        });
    }

    transact<T>(operation: (repository: SchoolDomainRepository) => Promise<T>): Promise<T> {
        if (this.transactionState) return operation(this);
        return this.mutate((state) => operation(new FileSchoolDomainRepository(state)));
    }

    private insert<K extends "schools" | "courses", T extends SchoolDomainFile[K][number]>(collection: K, record: T): Promise<T> {
        return this.mutate((state) => {
            assertUniqueId(state[collection], record.id);
            (state[collection] as T[]).push(structuredClone(record));
            return record;
        });
    }

    private read() {
        return this.transactionState ? Promise.resolve(this.transactionState) : readJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, EMPTY_SCHOOL_DOMAIN_FILE).then(normalizeFile);
    }

    private mutate<T>(operation: (state: SchoolDomainFile) => Promise<T> | T): Promise<T> {
        if (this.transactionState) return Promise.resolve(operation(this.transactionState));
        const pending = mutationQueue
            .catch(() => undefined)
            .then(() =>
                withJsonDataFileLock(SCHOOL_DOMAIN_DATA_FILE, async () => {
                    const state = normalizeFile(await readJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, EMPTY_SCHOOL_DOMAIN_FILE));
                    const result = await operation(state);
                    await writeJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, state);
                    return result;
                }),
            );
        mutationQueue = pending.then(
            () => undefined,
            () => undefined,
        );
        return pending;
    }

    private async filterCommercialOrders(input: OrderPageQuery, predicate: (record: CommercialOrderRecord) => boolean) {
        return paginate(filterOrders((await this.read()).commercialOrders, input, predicate), input);
    }
}

function normalizeFile(value: Partial<SchoolDomainFile>): SchoolDomainFile {
    const source = value && typeof value === "object" ? value : {};
    return {
        version: 1,
        schools: arrayValue(source.schools),
        memberships: arrayValue(source.memberships),
        inviteCodes: arrayValue(source.inviteCodes),
        classes: arrayValue(source.classes),
        classMembers: arrayValue(source.classMembers),
        courses: arrayValue(source.courses),
        courseAssignments: arrayValue(source.courseAssignments),
        courseOfferings: arrayValue(source.courseOfferings),
        teachingAssignments: arrayValue(source.teachingAssignments),
        teachingSubmissions: arrayValue(source.teachingSubmissions),
        commercialOrders: arrayValue(source.commercialOrders),
        commercialOrderParticipants: arrayValue(source.commercialOrderParticipants),
        commercialOrderDeliveries: arrayValue(source.commercialOrderDeliveries),
    };
}

function arrayValue<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? structuredClone(value) : [];
}

function paginate<T extends { id: string; updatedAt?: string; createdAt?: string }>(records: T[], input: PageQuery): Page<T> {
    const page = normalizePositiveInteger(input.page, 1);
    const pageSize = Math.min(100, normalizePositiveInteger(input.pageSize, 20));
    const sorted = [...records].sort((left, right) => (right.updatedAt || right.createdAt || "").localeCompare(left.updatedAt || left.createdAt || "") || right.id.localeCompare(left.id));
    return { items: structuredClone(sorted.slice((page - 1) * pageSize, page * pageSize)), total: sorted.length, page, pageSize };
}

function filterOrders(records: CommercialOrderRecord[], input: OrderPageQuery, predicate: (record: CommercialOrderRecord) => boolean) {
    const keyword = input.keyword?.trim().toLowerCase();
    return records.filter((item) => predicate(item) && (!input.status || item.status === input.status) && (!keyword || item.id.toLowerCase().includes(keyword) || item.title.toLowerCase().includes(keyword)));
}

function detached<T>(value: T | undefined): T | null {
    return value === undefined ? null : structuredClone(value);
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
    return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function assertUniqueId(records: Array<{ id: string }>, id: string) {
    if (records.some((item) => item.id === id)) throw new Error(`记录已存在：${id}`);
}

function assertSchoolRelation(records: Array<{ id: string; schoolId: string }>, schoolId: string, id: string, label: string) {
    if (!records.some((item) => item.schoolId === schoolId && item.id === id)) throw new Error(`${label}不属于当前学校`);
}

function assertCommercialOrderRelation(state: SchoolDomainFile, schoolId: string, orderId: string) {
    if (!state.commercialOrders.some((item) => item.assignedSchoolId === schoolId && item.id === orderId)) throw new Error("商单不属于当前学校");
}
