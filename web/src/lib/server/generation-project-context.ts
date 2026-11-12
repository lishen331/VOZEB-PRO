import { getCanvasProjectForUser } from "./canvas-project-service";
import { getDramaProjectForUser } from "./drama-project-service";

export type ProjectExecutionProfile = "production" | "open-source-practice";

export type ProjectExecutionContext = { executionProfile: ProjectExecutionProfile; schoolId?: string };

/**
 * 练习任务的学校范围只能取自项目本身，不采信客户端。
 * 项目归属哪个学校，任务就记到哪个学校；项目没有学校归属时不补，保持原有行为。
 */
export async function resolveProjectExecutionContext(userId: string, context: { surface?: string; projectId?: string }): Promise<ProjectExecutionContext | undefined> {
    const projectId = typeof context.projectId === "string" ? context.projectId.trim() : "";
    if (!projectId) return undefined;
    const project = context.surface === "canvas" ? await loadProject(() => getCanvasProjectForUser(userId, projectId)) : context.surface === "drama" ? await loadProject(() => getDramaProjectForUser(userId, projectId)) : null;
    const executionProfile = readProfile(project);
    if (!executionProfile) return undefined;
    const schoolId = project && typeof project === "object" && typeof (project as { schoolId?: unknown }).schoolId === "string" ? (project as { schoolId: string }).schoolId.trim() : "";
    return { executionProfile, ...(schoolId ? { schoolId } : {}) };
}

export async function resolveProjectExecutionProfile(userId: string, context: { surface?: string; projectId?: string }): Promise<ProjectExecutionProfile | undefined> {
    return (await resolveProjectExecutionContext(userId, context))?.executionProfile;
}

async function loadProject<T>(load: () => Promise<T>) {
    try {
        return await load();
    } catch (error) {
        if (error && typeof error === "object" && "status" in error && (error as { status?: unknown }).status === 404) return null;
        if (error instanceof Error && /DATABASE_URL is required/i.test(error.message)) return null;
        throw error;
    }
}

function readProfile(project: unknown): ProjectExecutionProfile | undefined {
    if (!project || typeof project !== "object") return undefined;
    return (project as { executionProfile?: unknown }).executionProfile === "open-source-practice" ? "open-source-practice" : "production";
}

export function projectExecutionProfileError(error: unknown) {
    if (!error || typeof error !== "object" || !("status" in error) || typeof (error as { status?: unknown }).status !== "number") return null;
    const status = (error as { status: number }).status;
    if (status < 400 || status > 499) return null;
    return { status, message: error instanceof Error ? error.message : "项目访问权限已失效" };
}
