import type { SchoolComputeBillingContext } from "@/lib/school-compute-domain";
import { parseDramaLabEpisodeCanvasHandoffId } from "@/lib/drama-lab-canvas-contract";
import type { GenerationTaskContext } from "./generation-task-types";
import { getCanvasProject } from "./canvas-project-store";
import { requireActiveSchoolContext, SchoolServiceError } from "./school-access-service";
import { validateSchoolContentReferences } from "./school-content-reference-service";
import { createSchoolComputeRepository } from "./school-compute-repository";
import { createSchoolDomainRepository } from "./school-domain-repository";

const ACTIVE_ORDER_STATUSES = new Set(["in_progress", "revision_required"]);

export type SchoolProjectBillingSummary = {
    schoolName: string;
    groupName: string;
    orderTitle: string;
    availablePoints: number;
    chargeSource: "group_school_points" | "group_personal_advance";
};

export async function resolveSchoolComputeBillingContext(userId: string, context?: GenerationTaskContext): Promise<SchoolComputeBillingContext | undefined> {
    if (!context || context.executionProfile === "open-source-practice" || (context.surface !== "canvas" && context.surface !== "drama") || !context.projectId) return undefined;

    let projectType = context.surface;
    let projectId = context.projectId.trim();
    if (!projectId) return undefined;
    const compute = createSchoolComputeRepository();
    let link;
    if (projectType === "canvas") {
        const canvasProject = await getCanvasProject(projectId, userId);
        const dramaBinding = parseDramaLabEpisodeCanvasHandoffId(canvasProject?.sourceHandoffId);
        if (dramaBinding) {
            projectType = "drama";
            projectId = dramaBinding.projectId;
            link = await compute.getGroupProjectByProject(projectType, projectId);
        } else {
            link = await compute.getGroupProjectByProject(projectType, projectId);
        }
    } else {
        link = await compute.getGroupProjectByProject(projectType, projectId);
    }
    if (!link) return undefined;

    try {
        const schoolContext = await requireActiveSchoolContext(userId);
        if (link.schoolId !== schoolContext.school.id || link.projectType !== projectType || link.projectId !== projectId) throw invalidLink();
        const [group, member, order] = await Promise.all([
            compute.getGroup(link.schoolId, link.groupId),
            compute.getGroupMember(link.schoolId, link.groupId, schoolContext.membership.id),
            createSchoolDomainRepository().getCommercialOrder(link.schoolId, link.orderId),
            validateSchoolContentReferences({ userId, schoolId: link.schoolId, references: [{ type: projectType, id: projectId }] }),
        ]);
        if (group?.status !== "active") throw invalidLink();
        if (!member) throw invalidLink();
        if (!order || order.productionGroupId !== link.groupId || !ACTIVE_ORDER_STATUSES.has(order.status)) throw invalidLink();
        return { schoolId: link.schoolId, groupId: link.groupId, orderId: link.orderId, projectType, projectId };
    } catch (error) {
        if (error instanceof SchoolServiceError && error.status === 409) throw error;
        throw invalidLink();
    }
}

export async function getSchoolProjectBillingSummary(userId: string, context: GenerationTaskContext): Promise<SchoolProjectBillingSummary | undefined> {
    const billing = await resolveSchoolComputeBillingContext(userId, context);
    if (!billing) return undefined;
    const compute = createSchoolComputeRepository();
    const school = createSchoolDomainRepository();
    const [schoolRecord, group, order, pool] = await Promise.all([
        school.getSchool(billing.schoolId),
        compute.getGroup(billing.schoolId, billing.groupId),
        school.getCommercialOrder(billing.schoolId, billing.orderId),
        compute.getPoolMetrics(billing.schoolId),
    ]);
    if (!schoolRecord || !group || !order || !pool) throw invalidLink();
    return {
        schoolName: schoolRecord.name,
        groupName: group.name,
        orderTitle: order.title,
        availablePoints: group.schoolPointsBalance,
        chargeSource: group.schoolPointsBalance > 0 ? "group_school_points" : "group_personal_advance",
    };
}

function invalidLink() {
    return new SchoolServiceError(409, "项目的制作小组计费关联已失效，请先更新项目关联");
}
