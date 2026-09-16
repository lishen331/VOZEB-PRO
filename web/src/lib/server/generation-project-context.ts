import { getCanvasProjectForUser } from "./canvas-project-service";
import { getDramaProjectForUser } from "./drama-project-service";

export type ProjectExecutionProfile = "production" | "open-source-practice";

export async function resolveProjectExecutionProfile(userId: string, context: { surface?: string; projectId?: string }): Promise<ProjectExecutionProfile | undefined> {
    const projectId = typeof context.projectId === "string" ? context.projectId.trim() : "";
    if (!projectId) return undefined;
    if (context.surface === "canvas") return readProfile(await loadProject(() => getCanvasProjectForUser(userId, projectId)));
    if (context.surface === "drama") return readProfile(await loadProject(() => getDramaProjectForUser(userId, projectId)));
    return undefined;
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
