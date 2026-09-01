import type { SchoolContext } from "@/lib/school-domain";
import { getPublicUsersByIds } from "@/lib/auth/store";
import { isActivePlatformAdmin } from "@/lib/admin-permissions";
import { createSchoolDomainRepository } from "@/lib/server/school-domain-repository";

export class SchoolServiceError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

export async function getSchoolContextForUser(userId: string): Promise<SchoolContext | null> {
    const context = await createSchoolDomainRepository().getSchoolContextByUserId(userId);
    if (!context) return null;
    return {
        school: { id: context.school.id, name: context.school.name, status: context.school.status },
        membership: {
            id: context.membership.id,
            role: context.membership.role,
            permissions: context.membership.permissions,
            status: context.membership.status,
        },
        canManageSchool: context.canManageSchool,
    };
}

export async function requireActiveSchoolContext(userId: string): Promise<SchoolContext> {
    const context = await getSchoolContextForUser(userId);
    if (!context || context.school.status !== "active" || context.membership.status !== "active") throw new SchoolServiceError(403, "当前账号没有可用的学校身份");
    return context;
}

export async function requireSchoolManager(userId: string) {
    const context = await requireActiveSchoolContext(userId);
    if (context.membership.role !== "teacher" || !context.canManageSchool) throw new SchoolServiceError(403, "当前账号没有学校管理权限");
    return context;
}

export async function requirePlatformAdmin(userId: string) {
    const user = (await getPublicUsersByIds([userId]))[0];
    if (!isActivePlatformAdmin(user)) throw new SchoolServiceError(403, "当前账号没有平台管理员权限");
    return user;
}

export async function requireTeacher(userId: string) {
    const context = await requireActiveSchoolContext(userId);
    if (context.membership.role !== "teacher") throw new SchoolServiceError(403, "当前账号不是学校老师");
    return context;
}

export async function requireStudent(userId: string) {
    const context = await requireActiveSchoolContext(userId);
    if (context.membership.role !== "student") throw new SchoolServiceError(403, "当前账号不是学校学生");
    return context;
}
