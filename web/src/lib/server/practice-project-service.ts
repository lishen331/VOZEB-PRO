import type { PracticeProjectKind, PracticeSource } from "@/lib/practice-domain";
import type { IpReference } from "@/lib/ip-library-domain";
import { createCanvasProjectForUser, getCanvasProjectForUser, listCanvasProjectsForUser } from "@/lib/server/canvas-project-service";
import type { CanvasProjectIdentityInput } from "@/lib/server/canvas-project-store";
import { createDramaProjectForUser, getDramaProjectForUser, listDramaProjectSummariesForUser } from "@/lib/server/drama-project-service";
import type { DramaProjectIdentityInput } from "@/lib/server/drama-project-store";
import { requirePracticeAccess, type PracticeActor } from "./practice-access-service";

export type PracticeProjectInput = { kind: PracticeProjectKind; title: string; source?: PracticeSource; references?: IpReference[] };
export type PracticeProjectIdentity = { executionProfile: "open-source-practice"; practiceSource: PracticeSource; schoolId: string };

export async function createPracticeProject(actor: PracticeActor, input: PracticeProjectInput) {
    const access = await requirePracticeAccess(actor);
    const title = cleanTitle(input.title);
    const identity: PracticeProjectIdentity = { schoolId: access.schoolId, executionProfile: "open-source-practice", practiceSource: input.source || { type: "blank" } };
    const projectInput = { title, ...(input.references?.length ? { ipReferences: input.references } : {}) };
    if (input.kind === "drama") {
        const project = await createDramaProjectForUser(actor.id, projectInput, identity as DramaProjectIdentityInput);
        return { kind: "drama" as const, project };
    }
    const project = await createCanvasProjectForUser(actor.id, projectInput, identity as CanvasProjectIdentityInput);
    return { kind: "canvas" as const, project };
}

export async function listPracticeProjects(actor: PracticeActor, input: { kind: PracticeProjectKind; page?: unknown; pageSize?: unknown }) {
    const access = await requirePracticeAccess(actor);
    const page = positive(input.page, 1);
    const pageSize = Math.min(100, positive(input.pageSize, 12));
    if (input.kind === "drama") return { kind: "drama" as const, ...(await listDramaProjectSummariesForUser(actor.id, { page, pageSize, schoolId: access.schoolId, executionProfile: "open-source-practice" })) };
    return { kind: "canvas" as const, ...(await listCanvasProjectsForUser(actor.id, { page, pageSize, schoolId: access.schoolId, executionProfile: "open-source-practice" })) };
}

export async function getPracticeProject(actor: PracticeActor, kind: PracticeProjectKind, id: string) {
    await requirePracticeAccess(actor);
    const project = kind === "drama" ? await getDramaProjectForUser(actor.id, id) : await getCanvasProjectForUser(actor.id, id);
    if ((project as { executionProfile?: string }).executionProfile !== "open-source-practice") throw new PracticeProjectError("练习项目不存在", 404);
    return { kind, project };
}

export class PracticeProjectError extends Error {
    constructor(
        readonly message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

function cleanTitle(value: unknown) {
    const title = typeof value === "string" ? value.trim().slice(0, 120) : "";
    if (!title) throw new Error("练习项目标题不能为空");
    return title;
}

function positive(value: unknown, fallback: number) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
