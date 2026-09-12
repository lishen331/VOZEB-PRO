import { requirePracticeAccess, type PracticeActor } from "./practice-access-service";
import { getSchoolContextForUser } from "@/lib/server/school-access-service";
import type { PracticeModuleKind } from "@/lib/practice-domain";

export type PracticeTenantScope = {
    schoolId: string;
    ownerUserId: string;
};

export async function requirePracticeTenant(actor: PracticeActor, _module?: PracticeModuleKind): Promise<PracticeTenantScope> {
    const access = await requirePracticeAccess(actor);
    return { schoolId: access.schoolId, ownerUserId: actor.id };
}

export async function getPracticeTenantIfActive(userId: string): Promise<PracticeTenantScope | null> {
    const context = await getSchoolContextForUser(userId);
    if (!context || context.school.status !== "active" || context.membership.status !== "active") return null;
    if (context.membership.role !== "teacher" && context.membership.role !== "student") return null;
    return { schoolId: context.school.id, ownerUserId: userId };
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
