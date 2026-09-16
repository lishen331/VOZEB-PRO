import { getAuthSettings } from "@/lib/auth/store";
import type { PracticeModuleKind } from "@/lib/practice-domain";
import { requireActiveSchoolContext } from "@/lib/server/school-access-service";

export type PracticeActor = { id: string; role?: string };
export type PracticeAccess = { schoolId: string; membershipId: string; role: "teacher" | "student" };

export async function requirePracticeAccess(actor: PracticeActor, module?: PracticeModuleKind): Promise<PracticeAccess> {
    const context = await requireActiveSchoolContext(actor.id);
    if (context.membership.role !== "teacher" && context.membership.role !== "student") throw new PracticeAccessError("当前账号不是老师或学生", 403);
    if (module) {
        const settings = await getAuthSettings();
        if (module === "script" && settings.practiceScriptSettings.enabled === false) throw new PracticeAccessError("剧本练习已停用", 404);
        if (module !== "script" && module !== "music" && settings.practiceModuleVisibility?.[module] === false) throw new PracticeAccessError("练习模块已停用", 404);
    }
    return { schoolId: context.school.id, membershipId: context.membership.id, role: context.membership.role };
}

export class PracticeAccessError extends Error {
    constructor(
        readonly message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
