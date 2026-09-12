import type { PracticeActor } from "./practice-access-service";
import { requireActiveSchoolContext } from "@/lib/server/school-access-service";

export type PracticeTenantScope = {
    schoolId: string;
    ownerUserId: string;
};

export async function requirePracticeTenant(actor: PracticeActor): Promise<PracticeTenantScope> {
    const context = await requireActiveSchoolContext(actor.id);
    if (context.membership.role !== "teacher" && context.membership.role !== "student") throw new PracticeTenantScopeError("当前账号不是老师或学生", 403);
    return { schoolId: context.school.id, ownerUserId: actor.id };
}

export function assertPracticeTenant(scope: PracticeTenantScope, value: Record<string, unknown>) {
    const requestedSchoolId = typeof value.schoolId === "string" ? value.schoolId.trim() : "";
    const requestedOwnerUserId = typeof value.ownerUserId === "string" ? value.ownerUserId.trim() : "";
    if ((requestedSchoolId && requestedSchoolId !== scope.schoolId) || (requestedOwnerUserId && requestedOwnerUserId !== scope.ownerUserId)) {
        throw new PracticeTenantScopeError("练习租户范围不匹配", 403);
    }
}

export class PracticeTenantScopeError extends Error {
    constructor(
        readonly message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
