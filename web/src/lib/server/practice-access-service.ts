import { requireActiveSchoolContext } from "@/lib/server/school-access-service";

export type PracticeActor = { id: string; role?: string };
export type PracticeAccess = { schoolId: string; membershipId: string; role: "teacher" | "student" };

export async function requirePracticeAccess(actor: PracticeActor): Promise<PracticeAccess> {
    if (actor.role === "admin") throw new PracticeAccessError("平台管理员不能借用学校练习身份", 403);
    const context = await requireActiveSchoolContext(actor.id);
    if (context.membership.role !== "teacher" && context.membership.role !== "student") throw new PracticeAccessError("当前账号不是老师或学生", 403);
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
