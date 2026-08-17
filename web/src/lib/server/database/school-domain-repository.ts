import type { CommercialOrderStatus, PlatformCourseStatus, SchoolMembershipStatus, SchoolPermission, SchoolStatus, TeachingAssignmentKind, TeachingAssignmentStatus, TeachingSubmissionStatus } from "@/lib/school-domain";
import type {
    CommercialOrderDeliveryRecord,
    CommercialOrderParticipantRecord,
    CommercialOrderRecord,
    MemberPageQuery,
    OrderPageQuery,
    PageQuery,
    PlatformCourseRecord,
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
    TeachingSubmissionRecord,
} from "@/lib/server/school-domain-repository";
import { postgresQuery, withPostgresTransaction, type QueryExecutor } from "./postgres";
import { isoValue, jsonParam, jsonValue, normalizePage, normalizePageSize, numberValue, optionalIso, optionalString, pageResult, stringValue } from "./repository-utils";

export function createSchoolDomainRepository(executor?: QueryExecutor): SchoolDomainRepository {
    return new PostgresSchoolDomainRepository(executor || { query: postgresQuery }, !executor || executor.query === postgresQuery);
}

export const createPostgresSchoolDomainRepository = createSchoolDomainRepository;

export class PostgresSchoolDomainRepository implements SchoolDomainRepository {
    constructor(
        private readonly db: QueryExecutor,
        private readonly startsTransactions = false,
    ) {}

    async listSchools(input: PageQuery & { keyword?: string; status?: SchoolStatus }) {
        const { page, pageSize, offset } = pagination(input);
        const values = [input.status || null, input.keyword?.trim() || null];
        const where = "WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR id ILIKE '%' || $2 || '%' OR name ILIKE '%' || $2 || '%')";
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT * FROM schools ${where} ORDER BY updated_at DESC, id DESC LIMIT $3 OFFSET $4`, [...values, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total FROM schools ${where}`, values),
        ]);
        return pageResult(rows.rows.map(mapSchool), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async getSchool(schoolId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM schools WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [schoolId]);
        return result.rows[0] ? mapSchool(result.rows[0]) : null;
    }

    async updateSchool(schoolId: string, patch: SchoolUpdate) {
        const values: unknown[] = [schoolId, patch.updatedAt];
        const assignments = ["updated_at = $2"];
        addUpdate(assignments, values, "name", patch.name);
        addUpdate(assignments, values, "profile", patch.profile === undefined ? undefined : jsonParam(patch.profile));
        addUpdate(assignments, values, "status", patch.status);
        const result = await this.db.query(`UPDATE schools SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`, values);
        return result.rows[0] ? mapSchool(result.rows[0]) : null;
    }

    async getSchoolContextByUserId(userId: string): Promise<SchoolContextRecord | null> {
        const result = await this.db.query(
            `SELECT s.*, m.id AS membership_id, m.user_id, m.role, m.permissions, m.status AS membership_status,
                    m.join_source, m.created_at AS membership_created_at, m.updated_at AS membership_updated_at
             FROM school_memberships m
             JOIN schools s ON s.id = m.school_id
             WHERE m.user_id = $1`,
            [userId],
        );
        if (!result.rows[0]) return null;
        const row = result.rows[0];
        const school = mapSchool(row);
        const membership = mapMembership({
            id: row.membership_id,
            school_id: row.id,
            user_id: row.user_id,
            role: row.role,
            permissions: row.permissions,
            status: row.membership_status,
            join_source: row.join_source,
            created_at: row.membership_created_at,
            updated_at: row.membership_updated_at,
        });
        return { school, membership, canManageSchool: membership.role === "teacher" && membership.permissions.includes("school.manage") };
    }

    async getMembership(schoolId: string, membershipId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_memberships WHERE school_id = $1 AND id = $2${forUpdate ? " FOR UPDATE" : ""}`, [schoolId, membershipId]);
        return result.rows[0] ? mapMembership(result.rows[0]) : null;
    }

    async getMembershipByUserId(userId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_memberships WHERE user_id = $1${forUpdate ? " FOR UPDATE" : ""}`, [userId]);
        return result.rows[0] ? mapMembership(result.rows[0]) : null;
    }

    async updateMembership(schoolId: string, membershipId: string, patch: SchoolMembershipUpdate) {
        const values: unknown[] = [schoolId, membershipId, patch.updatedAt];
        const assignments = ["updated_at = $3"];
        addUpdate(assignments, values, "role", patch.role);
        addUpdate(assignments, values, "permissions", patch.permissions === undefined ? undefined : jsonParam(patch.permissions));
        addUpdate(assignments, values, "status", patch.status);
        const result = await this.db.query(`UPDATE school_memberships SET ${assignments.join(", ")} WHERE school_id = $1 AND id = $2 RETURNING *`, values);
        return result.rows[0] ? mapMembership(result.rows[0]) : null;
    }

    async deleteMembership(schoolId: string, membershipId: string) {
        const result = await this.db.query("DELETE FROM school_memberships WHERE school_id = $1 AND id = $2", [schoolId, membershipId]);
        return (result.rowCount || 0) > 0;
    }

    async listMembers(schoolId: string, input: MemberPageQuery) {
        const { page, pageSize, offset } = pagination(input);
        const values = [schoolId, input.role || null, input.status || null, input.keyword?.trim() || null];
        const where = "WHERE school_id = $1 AND ($2::text IS NULL OR role = $2) AND ($3::text IS NULL OR status = $3) AND ($4::text IS NULL OR id ILIKE '%' || $4 || '%' OR user_id ILIKE '%' || $4 || '%')";
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT * FROM school_memberships ${where} ORDER BY updated_at DESC, id DESC LIMIT $5 OFFSET $6`, [...values, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total FROM school_memberships ${where}`, values),
        ]);
        return pageResult(rows.rows.map(mapMembership), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async getInviteCodeByRole(schoolId: string, role: SchoolInviteCodeRecord["role"], forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_invite_codes WHERE school_id = $1 AND role = $2${forUpdate ? " FOR UPDATE" : ""}`, [schoolId, role]);
        return result.rows[0] ? mapInviteCode(result.rows[0]) : null;
    }

    async getInviteCodeByDigest(codeDigest: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_invite_codes WHERE code_digest = $1${forUpdate ? " FOR UPDATE" : ""}`, [codeDigest]);
        return result.rows[0] ? mapInviteCode(result.rows[0]) : null;
    }

    async upsertInviteCode(record: SchoolInviteCodeRecord) {
        const result = await this.db.query(
            `INSERT INTO school_invite_codes (id, school_id, role, code_digest, status, expires_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (school_id, role) DO UPDATE SET code_digest = EXCLUDED.code_digest, status = EXCLUDED.status, expires_at = EXCLUDED.expires_at, updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [record.id, record.schoolId, record.role, record.codeDigest, record.status, record.expiresAt || null, record.createdAt, record.updatedAt],
        );
        return mapInviteCode(result.rows[0]);
    }

    async listClasses(schoolId: string, input: PageQuery) {
        return this.tenantPage("school_classes", schoolId, input, mapSchoolClass);
    }

    async getClass(schoolId: string, classId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_classes WHERE school_id = $1 AND id = $2${forUpdate ? " FOR UPDATE" : ""}`, [schoolId, classId]);
        return result.rows[0] ? mapSchoolClass(result.rows[0]) : null;
    }

    async updateClass(schoolId: string, classId: string, patch: SchoolClassUpdate) {
        const values: unknown[] = [schoolId, classId, patch.updatedAt];
        const assignments = ["updated_at = $3"];
        addUpdate(assignments, values, "name", patch.name);
        addUpdate(assignments, values, "description", patch.description);
        addUpdate(assignments, values, "status", patch.status);
        const result = await this.db.query(`UPDATE school_classes SET ${assignments.join(", ")} WHERE school_id = $1 AND id = $2 RETURNING *`, values);
        return result.rows[0] ? mapSchoolClass(result.rows[0]) : null;
    }

    async listClassMembers(schoolId: string, classId: string, input: PageQuery) {
        const { page, pageSize, offset } = pagination(input);
        const from = `FROM school_memberships m
                      JOIN school_class_members cm ON cm.school_id = m.school_id AND cm.membership_id = m.id
                      WHERE m.school_id = $1 AND cm.class_id = $2`;
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT m.* ${from} ORDER BY m.updated_at DESC, m.id DESC LIMIT $3 OFFSET $4`, [schoolId, classId, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total ${from}`, [schoolId, classId]),
        ]);
        return pageResult(rows.rows.map(mapMembership), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async listAssignedCourses(schoolId: string, input: PageQuery) {
        return this.tenantPage("school_course_assignments", schoolId, input, mapCourseAssignment);
    }

    async listOfferingsForTeacher(schoolId: string, membershipId: string, input: PageQuery) {
        const { page, pageSize, offset } = pagination(input);
        const [rows, count] = await Promise.all([
            this.db.query("SELECT * FROM school_course_offerings WHERE school_id = $1 AND teacher_membership_id = $2 ORDER BY updated_at DESC, id DESC LIMIT $3 OFFSET $4", [schoolId, membershipId, pageSize, offset]),
            this.db.query("SELECT COUNT(*)::int AS total FROM school_course_offerings WHERE school_id = $1 AND teacher_membership_id = $2", [schoolId, membershipId]),
        ]);
        return pageResult(rows.rows.map(mapCourseOffering), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async listAssignmentsForStudent(schoolId: string, membershipId: string, input: PageQuery) {
        const { page, pageSize, offset } = pagination(input);
        const from = `FROM teaching_assignments a
                      JOIN school_course_offerings o ON o.school_id = a.school_id AND o.id = a.offering_id
                      JOIN school_class_members cm ON cm.school_id = o.school_id AND cm.class_id = o.class_id
                      WHERE a.school_id = $1 AND cm.membership_id = $2`;
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT a.* ${from} ORDER BY a.updated_at DESC, a.id DESC LIMIT $3 OFFSET $4`, [schoolId, membershipId, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total ${from}`, [schoolId, membershipId]),
        ]);
        return pageResult(rows.rows.map(mapTeachingAssignment), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async getCommercialOrder(schoolId: string, orderId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM commercial_orders WHERE assigned_school_id = $1 AND id = $2${forUpdate ? " FOR UPDATE" : ""}`, [schoolId, orderId]);
        return result.rows[0] ? mapCommercialOrder(result.rows[0]) : null;
    }

    async listCommercialOrders(schoolId: string, input: OrderPageQuery) {
        const { page, pageSize, offset } = pagination(input);
        const values = [schoolId, input.status || null, input.keyword?.trim() || null];
        const where = "WHERE assigned_school_id = $1 AND ($2::text IS NULL OR status = $2) AND ($3::text IS NULL OR id ILIKE '%' || $3 || '%' OR title ILIKE '%' || $3 || '%')";
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT * FROM commercial_orders ${where} ORDER BY updated_at DESC, id DESC LIMIT $4 OFFSET $5`, [...values, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total FROM commercial_orders ${where}`, values),
        ]);
        return pageResult(rows.rows.map(mapCommercialOrder), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async insertSchool(record: SchoolRecord) {
        const result = await this.db.query("INSERT INTO schools (id, name, profile, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *", [
            record.id,
            record.name,
            jsonParam(record.profile),
            record.status,
            record.createdAt,
            record.updatedAt,
        ]);
        return mapSchool(result.rows[0]);
    }

    async insertMembership(record: SchoolMembershipRecord) {
        const result = await this.db.query("INSERT INTO school_memberships (id, school_id, user_id, role, permissions, status, join_source, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *", [
            record.id,
            record.schoolId,
            record.userId,
            record.role,
            jsonParam(record.permissions),
            record.status,
            record.joinSource,
            record.createdAt,
            record.updatedAt,
        ]);
        return mapMembership(result.rows[0]);
    }

    async insertClass(record: SchoolClassRecord) {
        const result = await this.db.query("INSERT INTO school_classes (id, school_id, name, description, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *", [
            record.id,
            record.schoolId,
            record.name,
            record.description,
            record.status,
            record.createdAt,
            record.updatedAt,
        ]);
        return mapSchoolClass(result.rows[0]);
    }

    replaceClassMembers(schoolId: string, classId: string, membershipIds: string[]) {
        return this.transact(async (repository) => (repository as PostgresSchoolDomainRepository).replaceClassMembersInTransaction(schoolId, classId, membershipIds));
    }

    async insertPlatformCourse(record: PlatformCourseRecord) {
        const result = await this.db.query("INSERT INTO platform_courses (id, title, summary, content, chapters, attachments, status, created_by_user_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *", [
            record.id,
            record.title,
            record.summary,
            jsonParam(record.content),
            jsonParam(record.chapters),
            jsonParam(record.attachments),
            record.status,
            record.createdByUserId || null,
            record.createdAt,
            record.updatedAt,
        ]);
        return mapPlatformCourse(result.rows[0]);
    }

    assignCourseToSchools(courseId: string, records: SchoolCourseAssignmentInput[]) {
        return this.transact(async (repository) => {
            const target = repository as PostgresSchoolDomainRepository;
            const assigned: SchoolCourseAssignmentRecord[] = [];
            for (const record of records) {
                const result = await target.db.query(
                    `INSERT INTO school_course_assignments (id, course_id, school_id, status, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (course_id, school_id) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
                     RETURNING *`,
                    [record.id, courseId, record.schoolId, record.status, record.createdAt, record.updatedAt],
                );
                assigned.push(mapCourseAssignment(result.rows[0]));
            }
            return assigned;
        });
    }

    async insertCourseOffering(record: SchoolCourseOfferingRecord) {
        const result = await this.db.query(
            "INSERT INTO school_course_offerings (id, school_id, assignment_id, class_id, teacher_membership_id, supplemental_resources, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
            [record.id, record.schoolId, record.assignmentId, record.classId, record.teacherMembershipId, jsonParam(record.supplementalResources), record.status, record.createdAt, record.updatedAt],
        );
        return mapCourseOffering(result.rows[0]);
    }

    async insertTeachingAssignment(record: TeachingAssignmentRecord) {
        const result = await this.db.query(
            "INSERT INTO teaching_assignments (id, school_id, offering_id, teacher_membership_id, kind, title, instructions, resources, due_at, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *",
            [record.id, record.schoolId, record.offeringId, record.teacherMembershipId, record.kind, record.title, record.instructions, jsonParam(record.resources), record.dueAt || null, record.status, record.createdAt, record.updatedAt],
        );
        return mapTeachingAssignment(result.rows[0]);
    }

    async insertTeachingSubmission(record: TeachingSubmissionRecord) {
        const result = await this.db.query(
            "INSERT INTO teaching_submissions (id, school_id, assignment_id, student_membership_id, note, content_references, status, feedback, submitted_at, reviewed_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *",
            [record.id, record.schoolId, record.assignmentId, record.studentMembershipId, record.note, jsonParam(record.contentReferences), record.status, record.feedback, record.submittedAt, record.reviewedAt || null, record.createdAt, record.updatedAt],
        );
        return mapTeachingSubmission(result.rows[0]);
    }

    async insertCommercialOrder(record: CommercialOrderRecord) {
        const result = await this.db.query(
            `INSERT INTO commercial_orders (id, title, requirements, reference_materials, acceptance_criteria, internal_amount_cents, deadline_at, assigned_school_id, teacher_membership_id, class_id, status, platform_feedback, created_by_user_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
            [
                record.id,
                record.title,
                record.requirements,
                jsonParam(record.referenceMaterials),
                record.acceptanceCriteria,
                record.internalAmountCents,
                record.deadlineAt || null,
                record.assignedSchoolId || null,
                record.teacherMembershipId || null,
                record.classId || null,
                record.status,
                record.platformFeedback,
                record.createdByUserId || null,
                record.createdAt,
                record.updatedAt,
            ],
        );
        return mapCommercialOrder(result.rows[0]);
    }

    async insertCommercialOrderParticipant(record: CommercialOrderParticipantRecord) {
        const result = await this.db.query(
            "INSERT INTO commercial_order_participants (id, school_id, order_id, membership_id, candidate_references, note, status, submitted_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
            [record.id, record.schoolId, record.orderId, record.membershipId, jsonParam(record.candidateReferences), record.note, record.status, record.submittedAt || null, record.createdAt, record.updatedAt],
        );
        return mapCommercialOrderParticipant(result.rows[0]);
    }

    async insertCommercialOrderDelivery(record: CommercialOrderDeliveryRecord) {
        const result = await this.db.query(
            "INSERT INTO commercial_order_deliveries (id, school_id, order_id, submitted_by_membership_id, content_references, note, status, platform_feedback, submitted_at, reviewed_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *",
            [
                record.id,
                record.schoolId,
                record.orderId,
                record.submittedByMembershipId,
                jsonParam(record.contentReferences),
                record.note,
                record.status,
                record.platformFeedback,
                record.submittedAt,
                record.reviewedAt || null,
                record.createdAt,
                record.updatedAt,
            ],
        );
        return mapCommercialOrderDelivery(result.rows[0]);
    }

    async compareAndSetCommercialOrderStatus(schoolId: string, orderId: string, expected: CommercialOrderStatus, next: CommercialOrderStatus, updatedAt: string) {
        const result = await this.db.query("UPDATE commercial_orders SET status = $4, updated_at = $5 WHERE assigned_school_id = $1 AND id = $2 AND status = $3", [schoolId, orderId, expected, next, updatedAt]);
        return (result.rowCount || 0) > 0;
    }

    transact<T>(operation: (repository: SchoolDomainRepository) => Promise<T>): Promise<T> {
        if (!this.startsTransactions) return operation(this);
        return withPostgresTransaction((executor) => operation(new PostgresSchoolDomainRepository(executor)));
    }

    private async tenantPage<T>(table: "school_classes" | "school_course_assignments", schoolId: string, input: PageQuery, mapper: (row: Record<string, unknown>) => T) {
        const { page, pageSize, offset } = pagination(input);
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT * FROM ${table} WHERE school_id = $1 ORDER BY updated_at DESC, id DESC LIMIT $2 OFFSET $3`, [schoolId, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total FROM ${table} WHERE school_id = $1`, [schoolId]),
        ]);
        return pageResult(rows.rows.map(mapper), numberValue(count.rows[0]?.total), page, pageSize);
    }

    private async replaceClassMembersInTransaction(schoolId: string, classId: string, membershipIds: string[]) {
        const classResult = await this.db.query("SELECT id FROM school_classes WHERE school_id = $1 AND id = $2 FOR UPDATE", [schoolId, classId]);
        if (!classResult.rows[0]) throw new Error("班级不存在");
        const selected = Array.from(new Set(membershipIds));
        if (selected.length) {
            const members = await this.db.query("SELECT COUNT(*)::int AS total FROM school_memberships WHERE school_id = $1 AND id = ANY($2::text[])", [schoolId, selected]);
            if (numberValue(members.rows[0]?.total) !== selected.length) throw new Error("班级只能添加本学校成员");
        }
        await this.db.query("DELETE FROM school_class_members WHERE school_id = $1 AND class_id = $2", [schoolId, classId]);
        if (selected.length) {
            await this.db.query(
                `INSERT INTO school_class_members (id, school_id, class_id, membership_id)
                 SELECT $2 || ':' || membership_id, $1, $2, membership_id FROM unnest($3::text[]) AS membership_id`,
                [schoolId, classId, selected],
            );
        }
    }
}

function pagination(input: PageQuery) {
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    return { page, pageSize, offset: (page - 1) * pageSize };
}

function mapSchool(row: Record<string, unknown>): SchoolRecord {
    return { id: stringValue(row.id), name: stringValue(row.name), profile: jsonValue(row.profile), status: schoolStatus(row.status), createdAt: isoValue(row.created_at), updatedAt: isoValue(row.updated_at) };
}

function mapMembership(row: Record<string, unknown>): SchoolMembershipRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        userId: stringValue(row.user_id),
        role: row.role === "student" ? "student" : "teacher",
        permissions: schoolPermissions(row.permissions),
        status: membershipStatus(row.status),
        joinSource: row.join_source === "import" || row.join_source === "invite" ? row.join_source : "admin",
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapInviteCode(row: Record<string, unknown>): SchoolInviteCodeRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        role: row.role === "student" ? "student" : "teacher",
        codeDigest: stringValue(row.code_digest),
        status: schoolStatus(row.status),
        expiresAt: optionalIso(row.expires_at),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapSchoolClass(row: Record<string, unknown>): SchoolClassRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        name: stringValue(row.name),
        description: stringValue(row.description),
        status: schoolStatus(row.status),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapPlatformCourse(row: Record<string, unknown>): PlatformCourseRecord {
    return {
        id: stringValue(row.id),
        title: stringValue(row.title),
        summary: stringValue(row.summary),
        content: jsonValue(row.content),
        chapters: jsonValue(row.chapters),
        attachments: jsonValue(row.attachments),
        status: courseStatus(row.status),
        createdByUserId: optionalString(row.created_by_user_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapCourseAssignment(row: Record<string, unknown>): SchoolCourseAssignmentRecord {
    return { id: stringValue(row.id), courseId: stringValue(row.course_id), schoolId: stringValue(row.school_id), status: schoolStatus(row.status), createdAt: isoValue(row.created_at), updatedAt: isoValue(row.updated_at) };
}

function mapCourseOffering(row: Record<string, unknown>): SchoolCourseOfferingRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        assignmentId: stringValue(row.assignment_id),
        classId: stringValue(row.class_id),
        teacherMembershipId: stringValue(row.teacher_membership_id),
        supplementalResources: jsonValue(row.supplemental_resources),
        status: schoolStatus(row.status),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapTeachingAssignment(row: Record<string, unknown>): TeachingAssignmentRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        offeringId: stringValue(row.offering_id),
        teacherMembershipId: stringValue(row.teacher_membership_id),
        kind: assignmentKind(row.kind),
        title: stringValue(row.title),
        instructions: stringValue(row.instructions),
        resources: jsonValue(row.resources),
        dueAt: optionalIso(row.due_at),
        status: assignmentStatus(row.status),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapTeachingSubmission(row: Record<string, unknown>): TeachingSubmissionRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        assignmentId: stringValue(row.assignment_id),
        studentMembershipId: stringValue(row.student_membership_id),
        note: stringValue(row.note),
        contentReferences: jsonValue(row.content_references) as TeachingSubmissionRecord["contentReferences"],
        status: submissionStatus(row.status),
        feedback: stringValue(row.feedback),
        submittedAt: isoValue(row.submitted_at),
        reviewedAt: optionalIso(row.reviewed_at),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapCommercialOrder(row: Record<string, unknown>): CommercialOrderRecord {
    return {
        id: stringValue(row.id),
        title: stringValue(row.title),
        requirements: stringValue(row.requirements),
        referenceMaterials: jsonValue(row.reference_materials),
        acceptanceCriteria: stringValue(row.acceptance_criteria),
        internalAmountCents: numberValue(row.internal_amount_cents),
        deadlineAt: optionalIso(row.deadline_at),
        assignedSchoolId: optionalString(row.assigned_school_id),
        teacherMembershipId: optionalString(row.teacher_membership_id),
        classId: optionalString(row.class_id),
        status: commercialOrderStatus(row.status),
        platformFeedback: stringValue(row.platform_feedback),
        createdByUserId: optionalString(row.created_by_user_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapCommercialOrderParticipant(row: Record<string, unknown>): CommercialOrderParticipantRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        orderId: stringValue(row.order_id),
        membershipId: stringValue(row.membership_id),
        candidateReferences: jsonValue(row.candidate_references),
        note: stringValue(row.note),
        status: row.status === "submitted" ? "submitted" : "active",
        submittedAt: optionalIso(row.submitted_at),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function mapCommercialOrderDelivery(row: Record<string, unknown>): CommercialOrderDeliveryRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        orderId: stringValue(row.order_id),
        submittedByMembershipId: stringValue(row.submitted_by_membership_id),
        contentReferences: jsonValue(row.content_references) as CommercialOrderDeliveryRecord["contentReferences"],
        note: stringValue(row.note),
        status: row.status === "accepted" || row.status === "revision_required" ? row.status : "submitted",
        platformFeedback: stringValue(row.platform_feedback),
        submittedAt: isoValue(row.submitted_at),
        reviewedAt: optionalIso(row.reviewed_at),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

function schoolPermissions(value: unknown): SchoolPermission[] {
    return Array.isArray(value) && value.includes("school.manage") ? ["school.manage"] : [];
}

function addUpdate(assignments: string[], values: unknown[], column: string, value: unknown) {
    if (value === undefined) return;
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
}

function schoolStatus(value: unknown): SchoolStatus {
    return value === "disabled" ? "disabled" : "active";
}

function membershipStatus(value: unknown): SchoolMembershipStatus {
    return value === "disabled" ? "disabled" : "active";
}

function courseStatus(value: unknown): PlatformCourseStatus {
    return value === "published" || value === "disabled" ? value : "draft";
}

function assignmentKind(value: unknown): TeachingAssignmentKind {
    return value === "lesson" || value === "commercial_practice" ? value : "homework";
}

function assignmentStatus(value: unknown): TeachingAssignmentStatus {
    return value === "published" || value === "closed" ? value : "draft";
}

function submissionStatus(value: unknown): TeachingSubmissionStatus {
    return value === "revision_required" || value === "reviewed" ? value : "submitted";
}

function commercialOrderStatus(value: unknown): CommercialOrderStatus {
    return value === "assigned" || value === "in_progress" || value === "submitted" || value === "revision_required" || value === "accepted" || value === "cancelled" ? value : "draft";
}
