import { randomUUID } from "node:crypto";

import { consumeUserPoints, getAuthSettings, refundUserPoints, type PointUsageKind } from "@/lib/auth/store";
import { resolveModelPointCost } from "@/lib/auth/store-normalizers";
import { QuotaExceededError } from "@/lib/auth/store-foundation";
import type { GenerationChargeReceipt, SchoolComputeBillingContext } from "@/lib/school-compute-domain";
import { getDatabaseProvider, withPostgresTransaction } from "./database/postgres";
import { createSchoolComputeRepository, type ComputeConsumptionRecord, type PersonalAdvanceRecord, type SchoolComputeRepository } from "./school-compute-repository";
import { createSchoolDomainRepository, type SchoolDomainRepository } from "./school-domain-repository";

type ChargeInput = {
    userId: string;
    amount: number;
    units: number;
    usageKind: PointUsageKind;
    model: string;
    idempotencyKey: string;
    requestFingerprint: string;
    billingContext?: SchoolComputeBillingContext;
};

type RefundInput = {
    userId: string;
    receiptId: string;
    model: string;
    usageKind: PointUsageKind;
    units: number;
    idempotencyKey: string;
};

export async function chargeGeneration(input: ChargeInput): Promise<GenerationChargeReceipt> {
    const amount = positiveAmount(input.amount);
    const units = positiveAmount(input.units);
    const idempotencyKey = required(input.idempotencyKey, "缺少生成扣费幂等编号");
    if (!input.billingContext) {
        const personal = await consumeUserPoints(input.userId, input.model, amount, input.usageKind, idempotencyKey, input.requestFingerprint);
        return { receiptId: `points:${personal.recordId}`, sources: ["personal_points"], cost: personal.cost, personalPointsRemaining: personal.permanentRemaining + personal.dailyRemaining };
    }
    const settings = await getAuthSettings();
    const context = input.billingContext;
    const schoolInput = { ...input, amount: Math.round(amount * resolveModelPointCost(settings.modelPointCosts, input.model, settings.logicalModels) * 100) / 100 };
    const result =
        getDatabaseProvider() === "postgres"
            ? await withPostgresTransaction((executor) => chargeSchoolInsideTransaction(schoolInput, context, createSchoolDomainRepository(executor), createSchoolComputeRepository(executor)))
            : await createSchoolComputeRepository().transact((compute) => chargeSchoolInsideTransaction(schoolInput, context, createSchoolDomainRepository(), compute));
    return result;
}

export async function refundGenerationCharge(input: RefundInput): Promise<{ refunded: boolean; personalPointsRemaining?: number }> {
    const receiptId = required(input.receiptId, "缺少生成扣费凭证");
    if (receiptId.startsWith("points:")) {
        const sourceId = receiptId.slice("points:".length);
        const user = await refundUserPoints(input.userId, input.model, 0, input.usageKind, input.units, `generation-refund:${input.idempotencyKey}`, sourceId);
        return { refunded: true, ...(typeof user?.pointsBalance === "number" ? { personalPointsRemaining: user.pointsBalance } : {}) };
    }
    if (!receiptId.startsWith("school:")) throw new Error("生成扣费凭证无效");
    const generationTaskId = receiptId.slice("school:".length);
    const repository = createSchoolComputeRepository();
    const result = await repository.transact(async (compute) => {
        const consumptions = await compute.listConsumptionsForGeneration(generationTaskId, true);
        if (!consumptions.length) return false;
        if (consumptions.some((item) => item.userId !== input.userId)) throw new Error("生成扣费凭证不存在");
        const now = new Date().toISOString();
        for (const consumption of consumptions) {
            if (consumption.status === "refunded") continue;
            if (consumption.sourceType === "group_school_points") {
                await compute.refundGroupSchoolPoints(consumption.schoolId, consumption.groupId, consumption.amount, {
                    id: randomUUID(),
                    schoolId: consumption.schoolId,
                    groupId: consumption.groupId,
                    orderId: consumption.orderId,
                    type: "generation_refund",
                    amount: consumption.amount,
                    balanceAfter: 0,
                    idempotencyKey: `generation-refund:${input.idempotencyKey}:${consumption.id}`,
                    createdAt: now,
                });
            } else {
                const advance = await compute.getPersonalAdvance(consumption.schoolId, consumption.sourceId, true);
                if (!advance) throw new Error("个人垫付来源不存在");
                const consumedPoints = money(advance.consumedPoints - consumption.amount);
                await compute.updatePersonalAdvance(advance.id, { consumedPoints, remainingPoints: money(advance.remainingPoints + consumption.amount), status: consumedPoints > 0 ? "partially_consumed" : "active", updatedAt: now });
            }
            await compute.updateConsumption(consumption.id, "refunded", now);
        }
        return true;
    });
    return { refunded: result };
}

async function chargeSchoolInsideTransaction(input: ChargeInput, context: SchoolComputeBillingContext, school: SchoolDomainRepository, compute: SchoolComputeRepository): Promise<GenerationChargeReceipt> {
    await compute.lockOperation(`generation-charge:${input.idempotencyKey}`);
    const existing = await compute.listConsumptionsForGeneration(input.idempotencyKey, true);
    if (existing.length) {
        assertMatchingSchoolCharge(existing, input, context);
        return receiptFromConsumptions(input.idempotencyKey, existing, input.amount);
    }
    const order = await school.getCommercialOrder(context.schoolId, context.orderId, true);
    const group = await compute.getGroup(context.schoolId, context.groupId, true);
    const projectLink = await compute.getGroupProjectByProject(context.projectType, context.projectId, true);
    const schoolContext = await school.getSchoolContextByUserId(input.userId);
    const member = await compute.getGroupMember(context.schoolId, context.groupId, schoolContext?.membership.id || "", true);
    if (!order || order.assignedSchoolId !== context.schoolId || order.productionGroupId !== context.groupId || !["in_progress", "revision_required"].includes(order.status)) throw new Error("商单计费关联已失效");
    if (!projectLink || projectLink.schoolId !== context.schoolId || projectLink.groupId !== context.groupId || projectLink.orderId !== context.orderId) throw new Error("项目计费关联已失效");
    if (!schoolContext || schoolContext.school.id !== context.schoolId || schoolContext.school.status !== "active" || schoolContext.membership.status !== "active" || !group || group.status !== "active" || !member)
        throw new Error("制作小组计费关联已失效");
    const advances = await compute.listSpendableAdvances(context.schoolId, context.groupId, context.orderId, true);
    const schoolAmount = money(Math.min(group.schoolPointsBalance, input.amount));
    const personalAmount = money(input.amount - schoolAmount);
    const availablePersonal = money(advances.reduce((sum, advance) => sum + advance.remainingPoints, 0));
    if (availablePersonal < personalAmount) throw new QuotaExceededError("学校算力额度和个人垫付余额不足");
    const now = new Date().toISOString();
    const consumptions: ComputeConsumptionRecord[] = [];
    if (schoolAmount > 0) {
        await compute.consumeGroupSchoolPoints(context.schoolId, context.groupId, schoolAmount, {
            id: randomUUID(),
            schoolId: context.schoolId,
            groupId: context.groupId,
            orderId: context.orderId,
            type: "generation_consume",
            amount: -schoolAmount,
            balanceAfter: 0,
            idempotencyKey: `generation:${input.idempotencyKey}:school`,
            createdAt: now,
            actorUserId: input.userId,
        });
        consumptions.push(consumption(context, input, "group_school_points", context.groupId, schoolAmount, now));
    }
    let left = personalAmount;
    for (const advance of advances) {
        if (left <= 0) break;
        const amount = money(Math.min(left, advance.remainingPoints));
        await compute.updatePersonalAdvance(advance.id, { consumedPoints: money(advance.consumedPoints + amount), remainingPoints: money(advance.remainingPoints - amount), status: "partially_consumed", updatedAt: now });
        consumptions.push(consumption(context, input, "group_personal_advance", advance.id, amount, now));
        left = money(left - amount);
    }
    for (const item of consumptions) await compute.insertConsumption(item);
    return receiptFromConsumptions(input.idempotencyKey, consumptions, input.amount);
}

function consumption(context: SchoolComputeBillingContext, input: ChargeInput, sourceType: ComputeConsumptionRecord["sourceType"], sourceId: string, amount: number, now: string): ComputeConsumptionRecord {
    return {
        id: randomUUID(),
        schoolId: context.schoolId,
        groupId: context.groupId,
        orderId: context.orderId,
        generationTaskId: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        userId: input.userId,
        sourceType,
        sourceId,
        amount,
        status: "charged",
        createdAt: now,
        updatedAt: now,
    };
}

function assertMatchingSchoolCharge(consumptions: ComputeConsumptionRecord[], input: ChargeInput, context: SchoolComputeBillingContext) {
    const total = money(consumptions.reduce((sum, item) => sum + item.amount, 0));
    if (
        total !== input.amount ||
        consumptions.some((item) => item.userId !== input.userId || item.schoolId !== context.schoolId || item.groupId !== context.groupId || item.orderId !== context.orderId || item.requestFingerprint !== input.requestFingerprint)
    )
        throw new Error("生成扣费幂等编号对应的参数不一致");
}

function receiptFromConsumptions(generationTaskId: string, consumptions: ComputeConsumptionRecord[], cost: number): GenerationChargeReceipt {
    return { receiptId: `school:${generationTaskId}`, sources: [...new Set(consumptions.map((item) => item.sourceType))], cost };
}

function positiveAmount(value: unknown) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("生成扣费金额必须大于零");
    return Math.round(amount * 100) / 100;
}

function required(value: unknown, message: string) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new Error(message);
    return text;
}

function money(value: number) {
    return Math.round(value * 100) / 100;
}
