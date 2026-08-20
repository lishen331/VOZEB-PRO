import type { PageResult } from "./school-domain";

export type SchoolComputePoolStatus = "active" | "frozen" | "closed";
export type ProductionGroupStatus = "draft" | "active" | "frozen" | "settling" | "settled" | "archived";
export type ComputeAllocationRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type PersonalAdvanceStatus = "active" | "partially_consumed" | "pending_school_confirmation" | "returned" | "disputed";
export type ComputeSettlementStatus = "open" | "pending_school_confirmation" | "completed" | "disputed";
export type ComputeChargeSource = "personal_points" | "group_school_points" | "group_personal_advance";

export const SCHOOL_COMPUTE_POOL_STATUSES = ["active", "frozen", "closed"] as const satisfies readonly SchoolComputePoolStatus[];
export const PRODUCTION_GROUP_STATUSES = ["draft", "active", "frozen", "settling", "settled", "archived"] as const satisfies readonly ProductionGroupStatus[];
export const COMPUTE_ALLOCATION_REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const satisfies readonly ComputeAllocationRequestStatus[];
export const PERSONAL_ADVANCE_STATUSES = ["active", "partially_consumed", "pending_school_confirmation", "returned", "disputed"] as const satisfies readonly PersonalAdvanceStatus[];
export const COMPUTE_SETTLEMENT_STATUSES = ["open", "pending_school_confirmation", "completed", "disputed"] as const satisfies readonly ComputeSettlementStatus[];
export const COMPUTE_CHARGE_SOURCES = ["personal_points", "group_school_points", "group_personal_advance"] as const satisfies readonly ComputeChargeSource[];

const SCHOOL_COMPUTE_POOL_STATUS_SET = new Set<string>(SCHOOL_COMPUTE_POOL_STATUSES);
const PRODUCTION_GROUP_STATUS_SET = new Set<string>(PRODUCTION_GROUP_STATUSES);

export type SchoolComputeBillingContext = {
    schoolId: string;
    groupId: string;
    orderId: string;
    projectType: "canvas" | "drama";
    projectId: string;
};

export type GenerationChargeReceipt = {
    receiptId: string;
    sources: ComputeChargeSource[];
    cost: number;
    personalPointsRemaining?: number;
};

export type SchoolComputePoolSummary = {
    schoolId: string;
    totalPoints: number;
    availablePoints: number;
    allocatedPoints: number;
    consumedPoints: number;
    status: SchoolComputePoolStatus;
};
export type AdminSchoolComputePool = SchoolComputePoolSummary & { schoolName: string; updatedAt: string };
export type AdminSchoolComputePoolDetails = AdminSchoolComputePool & { ledger: PageResult<SchoolComputeLedgerEntry> };
export type ProductionGroup = {
    id: string;
    schoolId: string;
    name: string;
    description: string;
    leaderMembershipId: string;
    status: ProductionGroupStatus;
    schoolPointsBalance: number;
    createdAt: string;
    updatedAt: string;
};
export type ProductionGroupMember = { id: string; membershipId: string; role: "leader" | "member"; displayName: string; accountId: string };
export type ProductionGroupDetails = ProductionGroup & { members: ProductionGroupMember[]; orders: Array<{ id: string; title: string; status: string }> };
export type ComputeAllocationRequest = {
    id: string;
    groupId: string;
    orderId: string;
    amount: number;
    reason: string;
    status: ComputeAllocationRequestStatus;
    reviewNote: string;
    createdAt: string;
    updatedAt: string;
};
export type ProductionGroupProject = { id: string; groupId: string; orderId: string; projectType: "canvas" | "drama"; projectId: string; createdAt: string };
export type PersonalComputeAdvance = {
    id: string;
    groupId: string;
    orderId: string;
    membershipId: string;
    originalPoints: number;
    consumedPoints: number;
    remainingPoints: number;
    returnedPoints: number;
    status: PersonalAdvanceStatus;
    createdAt: string;
    updatedAt: string;
};
export type ComputeSettlement = {
    id: string;
    groupId: string;
    orderId: string;
    status: ComputeSettlementStatus;
    unusedPersonalPointsReturned: number;
    consumedPersonalPointsPending: number;
    confirmedPersonalPointsReturned: number;
    advances: ComputeSettlementAdvance[];
    createdAt: string;
    updatedAt: string;
};
export type ComputeSettlementAdvance = {
    id: string;
    accountId: string;
    displayName: string;
    originalPoints: number;
    consumedPoints: number;
    unusedPoints: number;
    returnedPoints: number;
    status: PersonalAdvanceStatus;
};
export type SchoolComputeLedgerEntry = {
    id: string;
    schoolId: string;
    groupId?: string;
    orderId?: string;
    type: string;
    amount: number;
    balanceAfter: number;
    idempotencyKey: string;
    createdAt: string;
};

export function isSchoolComputePoolStatus(value: unknown): value is SchoolComputePoolStatus {
    return typeof value === "string" && SCHOOL_COMPUTE_POOL_STATUS_SET.has(value);
}

export function isProductionGroupStatus(value: unknown): value is ProductionGroupStatus {
    return typeof value === "string" && PRODUCTION_GROUP_STATUS_SET.has(value);
}
