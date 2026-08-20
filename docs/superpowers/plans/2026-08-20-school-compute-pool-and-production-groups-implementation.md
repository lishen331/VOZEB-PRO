# 学校算力池与制作小组实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有学校、商单、Canvas、短剧和个人积分体系上增加学校算力池、轻量制作小组、个人永久积分垫付、正式生成扣费与商单验收结算闭环。

**Architecture:** 新建独立的学校算力领域契约、Schema、Repository 和 Service，不把算力规则继续堆入现有学校租户 Service。正式 Canvas/短剧项目通过唯一有效的“小组项目关联”自动解析学校、小组和商单 billing context；统一生成计费服务根据该上下文扣除小组学校额度或个人垫付，没有上下文时继续扣个人积分。商单验收、个人未使用垫付退回、学校确认已消耗垫付返还均通过幂等事务完成。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Ant Design 6、Tailwind CSS 4、Zustand、PostgreSQL、项目现有 JSON 文件 Provider、Vitest、Playwright。

## Global Constraints

- 制作小组属于一所学校、独立于班级；一个商单最多关联一个制作小组，一个制作小组可以关联多个商单。
- Canvas、短剧和作品继续归个人用户所有；小组项目关联只提供预算上下文和业务引用，不授予其他成员编辑权限。
- 第一期开通学校算力的正式消费范围只包含已关联制作小组和商单的 Canvas/短剧项目；普通个人创作继续扣个人积分。
- 个人临时垫付只能扣个人永久积分，不得扣每日赠送积分；垫付必须绑定学校、小组和具体商单。
- 个人垫付未消耗部分在商单通过平台验收后自动退回；已消耗部分只有学校管理员确认后才返还个人永久积分。
- 返还只处理平台算力点，不发起现金退款、提现或在线学校结算。
- `open-source-practice` 无限练习不扣学校算力池，也不扣个人积分。
- 平台读取算力池要求 `education.manage` 或 `billing.manage`；充值、调账、冻结和恢复同时要求 `education.manage` 与 `billing.manage`；学校操作要求 `teacher + school.manage`。
- 学校、成员、小组、商单、项目和账本查询必须携带 `school_id` 及实体、状态、时间窗或有界分页条件；跨校实体统一按 404 处理。
- 所有余额和流水金额使用 `numeric(18, 2)`，同一参数用于更新和比较时显式使用 `$n::numeric`；测试至少使用一次 `12.5`。
- 所有余额变更、额度分配、垫付、消费、退款和结算均使用幂等键、行锁或文件锁；任何余额不得为负数。
- Route Handler 只处理 HTTP 入参、Session、职责权限、Service 调用和 `{ code, data, msg }` 映射。
- API 客户端统一放在 `web/src/services/api/`；业务数据只保存到服务端，不使用 localStorage、IndexedDB 或 localforage。
- 管理后台继续使用列表/卡片、创建按钮和 Modal/Drawer；手机 Drawer 宽度不得超过 `100vw`。
- 本项目尚未上线，不写旧数据迁移兼容分支；Schema 直接按新设计建立。

---

## File Map

新增或扩展文件按以下职责拆分：

- `web/src/lib/school-compute-domain.ts`：用户端与后台共用 DTO、状态和 billing context。
- `web/src/lib/server/database/schema-school-compute.ts`：学校算力 PostgreSQL DDL、约束和索引。
- `web/src/lib/server/school-compute-repository.ts`：算力领域 Record、Repository 接口和 Provider 选择。
- `web/src/lib/server/database/school-compute-repository.ts`：PostgreSQL 定向查询、行锁和原子余额更新。
- `web/src/lib/server/school-compute-file-repository.ts`：`school-compute.json` 文件 Provider 与锁内写入。
- `web/src/lib/server/school-compute-service.ts`：平台充值、学校池读取、额度分配和流水。
- `web/src/lib/server/school-production-group-service.ts`：小组、成员、商单、项目关联和追加申请。
- `web/src/lib/server/school-compute-advance-service.ts`：个人永久积分垫付与跨钱包事务。
- `web/src/lib/server/school-compute-settlement-service.ts`：商单验收、未使用垫付退回和学校确认返还。
- `web/src/lib/server/school-compute-billing-context.ts`：从用户、项目、小组和商单解析可信 billing context。
- `web/src/lib/server/generation-charge-service.ts`：统一个人积分/学校算力扣费与原来源退款。
- `web/src/services/api/admin-school-compute.ts`：平台后台算力池请求。
- `web/src/services/api/school-compute.ts`：学校管理员和小组成员请求。
- `web/src/app/admin/school-compute/components/admin-school-compute-section.tsx`：平台学校算力池页面。
- `web/src/app/(user)/school/components/production-groups-panel.tsx`：学校后台小组、额度、审批和结算页面。
- `web/src/components/school/production-group-member-panel.tsx`：老师/学生小组、垫付和追加申请页面。
- `web/src/components/school/school-project-billing-badge.tsx`：Canvas/短剧项目的真实扣费来源提示。

---

### Task 1: 建立算力领域契约、状态机和 PostgreSQL Schema

**Files:**

- Create: `web/src/lib/school-compute-domain.ts`
- Create: `web/src/lib/school-compute-domain.test.ts`
- Create: `web/src/lib/server/database/schema-school-compute.ts`
- Create: `web/src/lib/server/database/school-compute-schema.postgres.test.ts`
- Modify: `web/src/lib/server/database/schema.ts`
- Modify: `web/src/lib/server/database/schema-school-domain.ts`
- Modify: `web/src/lib/server/database/postgres.ts`
- Modify: `web/src/lib/server/database/postgres.test.ts`

**Interfaces:**

- Consumes: `SchoolContentReference`、`CommercialOrderStatus` 和现有学校/用户主键。
- Produces: `SchoolComputeBillingContext`、池/小组/垫付/结算 DTO，以及九张算力表和 `commercial_orders.production_group_id`。

- [ ] **Step 1: 写领域契约和 Schema 失败测试**

  在 `school-compute-domain.test.ts` 断言状态解析拒绝未知值；在 PostgreSQL 测试中断言九张表、金额 CHECK、同校复合外键、个人垫付商单必填和 `production_group_id` 存在。

  ```ts
  import { describe, expect, it } from "vitest";
  import { isProductionGroupStatus, isSchoolComputePoolStatus } from "./school-compute-domain";

  describe("school compute domain", () => {
      it("accepts only declared pool and group states", () => {
          expect(isSchoolComputePoolStatus("active")).toBe(true);
          expect(isSchoolComputePoolStatus("pending")).toBe(false);
          expect(isProductionGroupStatus("settling")).toBe(true);
          expect(isProductionGroupStatus("deleted")).toBe(false);
      });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd web; pnpm exec vitest run src/lib/school-compute-domain.test.ts src/lib/server/database/school-compute-schema.postgres.test.ts src/lib/server/database/postgres.test.ts --no-file-parallelism`

  Expected: FAIL，`school-compute-domain` 和 `schema-school-compute` 尚不存在。

- [ ] **Step 3: 定义稳定领域类型**

  `school-compute-domain.ts` 至少导出以下类型和守卫，后续任务不得自行重命名：

  ```ts
  export type SchoolComputePoolStatus = "active" | "frozen" | "closed";
  export type ProductionGroupStatus = "draft" | "active" | "frozen" | "settling" | "settled" | "archived";
  export type ComputeAllocationRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
  export type PersonalAdvanceStatus = "active" | "partially_consumed" | "pending_school_confirmation" | "returned" | "disputed";
  export type ComputeSettlementStatus = "open" | "pending_school_confirmation" | "completed" | "disputed";
  export type ComputeChargeSource = "personal_points" | "group_school_points" | "group_personal_advance";

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
  export type ProductionGroup = { id: string; schoolId: string; name: string; description: string; leaderMembershipId: string; status: ProductionGroupStatus; schoolPointsBalance: number; createdAt: string; updatedAt: string };
  export type ProductionGroupMember = { id: string; membershipId: string; role: "leader" | "member"; displayName: string; accountId: string };
  export type ProductionGroupDetails = ProductionGroup & { members: ProductionGroupMember[]; orders: Array<{ id: string; title: string; status: string }> };
  export type ComputeAllocationRequest = { id: string; groupId: string; orderId: string; amount: number; reason: string; status: ComputeAllocationRequestStatus; reviewNote: string; createdAt: string; updatedAt: string };
  export type ProductionGroupProject = { id: string; groupId: string; orderId: string; projectType: "canvas" | "drama"; projectId: string; createdAt: string };
  export type PersonalComputeAdvance = { id: string; groupId: string; orderId: string; membershipId: string; originalPoints: number; consumedPoints: number; remainingPoints: number; returnedPoints: number; status: PersonalAdvanceStatus; createdAt: string; updatedAt: string };
  export type ComputeSettlement = { id: string; groupId: string; orderId: string; status: ComputeSettlementStatus; unusedPersonalPointsReturned: number; consumedPersonalPointsPending: number; confirmedPersonalPointsReturned: number; createdAt: string; updatedAt: string };
  export type SchoolComputeLedgerEntry = { id: string; schoolId: string; groupId?: string; orderId?: string; type: string; amount: number; balanceAfter: number; idempotencyKey: string; createdAt: string };

  export function isSchoolComputePoolStatus(value: unknown): value is SchoolComputePoolStatus;
  export function isProductionGroupStatus(value: unknown): value is ProductionGroupStatus;
  ```

- [ ] **Step 4: 建立数据库结构**

  `schema-school-compute.ts` 完整创建以下表：

  ```text
  school_compute_pools
  school_compute_ledger_entries
  school_production_groups
  school_production_group_members
  school_compute_allocation_requests
  school_compute_group_projects
  school_compute_personal_advances
  school_compute_settlements
  school_compute_consumptions
  ```

  关键字段和约束：

  ```sql
  CREATE TABLE IF NOT EXISTS school_compute_pools (
      school_id text PRIMARY KEY REFERENCES schools(id) ON DELETE RESTRICT,
      available_points numeric(18, 2) NOT NULL DEFAULT 0 CHECK (available_points >= 0),
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
  );

  -- `commercial_orders` declares `production_group_id text` in schema-school-domain.ts.
  ALTER TABLE commercial_orders ADD CONSTRAINT commercial_orders_school_group_fk
      FOREIGN KEY (assigned_school_id, production_group_id)
      REFERENCES school_production_groups(school_id, id);
  ```

  `school_production_groups` 保存 `school_points_balance numeric(18,2)`；`school_compute_personal_advances` 保存 `original_points`、`remaining_points`、`consumed_points`、`returned_points` 并使用 CHECK 保证四者关系有效。`school_compute_ledger_entries.idempotency_key` 全局唯一。`school_compute_group_projects` 对未结算项目建立部分唯一索引，保证同一个 `project_type + project_id` 同时只有一个有效小组/商单关联。

- [ ] **Step 5: 注册 Schema 对象**

  在 `schema.ts` 导入并追加 `${POSTGRESQL_SCHOOL_COMPUTE_SCHEMA_SQL}`，位置在学校域 DDL 之后、触发器 DDL 之前。在 `postgres.ts` 的 `POSTGRES_TABLES` 和 `POSTGRES_SCHEMA_OBJECTS` 中登记九张表、金额/状态索引和部分唯一索引。

- [ ] **Step 6: 运行定向测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/school-compute-domain.test.ts src/lib/server/database/school-compute-schema.postgres.test.ts src/lib/server/database/postgres.test.ts --no-file-parallelism; pnpm typecheck`

  Expected: PASS，Schema SQL 包含九张表、复合外键和 `numeric(18, 2)` 非负约束。

- [ ] **Step 7: 提交**

  ```bash
  git add web/src/lib/school-compute-domain.ts web/src/lib/school-compute-domain.test.ts web/src/lib/server/database/schema-school-compute.ts web/src/lib/server/database/school-compute-schema.postgres.test.ts web/src/lib/server/database/schema.ts web/src/lib/server/database/schema-school-domain.ts web/src/lib/server/database/postgres.ts web/src/lib/server/database/postgres.test.ts
  git commit -m "feat: add school compute domain schema"
  ```

---

### Task 2: 实现 PostgreSQL 与文件 Provider Repository

**Files:**

- Create: `web/src/lib/server/school-compute-repository.ts`
- Create: `web/src/lib/server/database/school-compute-repository.ts`
- Create: `web/src/lib/server/database/school-compute-repository.test.ts`
- Create: `web/src/lib/server/school-compute-file-repository.ts`
- Create: `web/src/lib/server/school-compute-file-repository.test.ts`
- Modify: `web/src/lib/server/database/index.ts`
- Modify: `web/src/lib/server/database/repositories.ts`

**Interfaces:**

- Consumes: Task 1 的状态、DTO 和表结构。
- Produces: `SchoolComputeRepository`、`createSchoolComputeRepository(executor?)`、PostgreSQL 行锁实现、文件 Provider 锁内实现。

- [ ] **Step 1: 写 Repository 行为失败测试**

  两个 Provider 运行相同核心用例：创建零余额学校池、充值 `12.5`、分配后池与小组余额正确、个人垫付先进先出、跨校小组/商单关系失败、重复幂等键只产生一条流水、分页只返回当前学校。

  ```ts
  it("updates decimal balances without integer inference", async () => {
      await repository.creditPool("school-a", 12.5, entry("credit-a"));
      await expect(repository.getPool("school-a")).resolves.toMatchObject({ availablePoints: 12.5 });
      await repository.allocateToGroup("school-a", "group-a", 2.25, entry("allocate-a"));
      await expect(repository.getGroup("school-a", "group-a")).resolves.toMatchObject({ schoolPointsBalance: 2.25 });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd web; pnpm exec vitest run src/lib/server/database/school-compute-repository.test.ts src/lib/server/school-compute-file-repository.test.ts --no-file-parallelism`

  Expected: FAIL，Repository 尚不存在。

- [ ] **Step 3: 定义 Repository 接口**

  `SchoolComputeRepository` 明确提供以下能力：

  ```ts
  export interface SchoolComputeRepository {
      getPool(schoolId: string, forUpdate?: boolean): Promise<SchoolComputePoolRecord | null>;
      upsertPool(record: SchoolComputePoolRecord): Promise<SchoolComputePoolRecord>;
      listPools(input: ComputePoolPageQuery): Promise<Page<SchoolComputePoolRecord>>;
      listPoolsBySchoolIds(schoolIds: string[]): Promise<SchoolComputePoolRecord[]>;
      creditPool(schoolId: string, amount: number, entry: SchoolComputeLedgerRecord): Promise<SchoolComputePoolRecord>;
      adjustPool(schoolId: string, amount: number, entry: SchoolComputeLedgerRecord): Promise<SchoolComputePoolRecord>;
      allocateToGroup(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord): Promise<{ pool: SchoolComputePoolRecord; group: ProductionGroupRecord }>;
      releaseGroupPoints(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord): Promise<{ pool: SchoolComputePoolRecord; group: ProductionGroupRecord }>;
      consumeGroupSchoolPoints(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord): Promise<ProductionGroupRecord>;
      refundGroupSchoolPoints(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord): Promise<ProductionGroupRecord>;
      listLedger(schoolId: string, input: ComputeLedgerPageQuery): Promise<Page<SchoolComputeLedgerRecord>>;
      getGroup(schoolId: string, groupId: string, forUpdate?: boolean): Promise<ProductionGroupRecord | null>;
      listGroups(schoolId: string, input: ProductionGroupPageQuery): Promise<Page<ProductionGroupRecord>>;
      insertGroup(record: ProductionGroupRecord): Promise<ProductionGroupRecord>;
      updateGroup(schoolId: string, groupId: string, patch: ProductionGroupUpdate): Promise<ProductionGroupRecord | null>;
      replaceGroupMembers(schoolId: string, groupId: string, records: ProductionGroupMemberRecord[]): Promise<void>;
      listGroupMembers(schoolId: string, groupId: string, input: PageQuery): Promise<Page<ProductionGroupMemberRecord>>;
      getGroupProjectByProject(projectType: "canvas" | "drama", projectId: string, forUpdate?: boolean): Promise<ProductionGroupProjectRecord | null>;
      insertGroupProject(record: ProductionGroupProjectRecord): Promise<ProductionGroupProjectRecord>;
      insertAllocationRequest(record: ComputeAllocationRequestRecord): Promise<ComputeAllocationRequestRecord>;
      getAllocationRequest(schoolId: string, requestId: string, forUpdate?: boolean): Promise<ComputeAllocationRequestRecord | null>;
      listAllocationRequests(schoolId: string, groupId: string, input: PageQuery): Promise<Page<ComputeAllocationRequestRecord>>;
      updateAllocationRequest(schoolId: string, requestId: string, patch: ComputeAllocationRequestUpdate): Promise<ComputeAllocationRequestRecord | null>;
      insertPersonalAdvance(record: PersonalAdvanceRecord): Promise<PersonalAdvanceRecord>;
      getPersonalAdvance(schoolId: string, advanceId: string, forUpdate?: boolean): Promise<PersonalAdvanceRecord | null>;
      listPersonalAdvances(schoolId: string, groupId: string, input: PageQuery & { orderId?: string; membershipId?: string }): Promise<Page<PersonalAdvanceRecord>>;
      listSpendableAdvances(schoolId: string, groupId: string, orderId: string, forUpdate?: boolean): Promise<PersonalAdvanceRecord[]>;
      updatePersonalAdvance(id: string, patch: PersonalAdvanceUpdate): Promise<PersonalAdvanceRecord | null>;
      insertConsumption(record: ComputeConsumptionRecord): Promise<ComputeConsumptionRecord>;
      listConsumptionsForGeneration(generationTaskId: string, forUpdate?: boolean): Promise<ComputeConsumptionRecord[]>;
      listConsumptionsForOrder(schoolId: string, orderId: string, input: PageQuery): Promise<Page<ComputeConsumptionRecord>>;
      updateConsumption(id: string, status: ComputeConsumptionRecord["status"], updatedAt: string): Promise<ComputeConsumptionRecord | null>;
      getSettlement(schoolId: string, orderId: string, forUpdate?: boolean): Promise<ComputeSettlementRecord | null>;
      insertSettlement(record: ComputeSettlementRecord): Promise<ComputeSettlementRecord>;
      listSettlements(schoolId: string, groupId: string, input: PageQuery): Promise<Page<ComputeSettlementRecord>>;
      updateSettlement(schoolId: string, orderId: string, patch: ComputeSettlementUpdate): Promise<ComputeSettlementRecord | null>;
      insertLedgerEntry(record: SchoolComputeLedgerRecord): Promise<SchoolComputeLedgerRecord>;
      getLedgerEntryByIdempotencyKey(key: string): Promise<SchoolComputeLedgerRecord | null>;
      transact<T>(operation: (repository: SchoolComputeRepository) => Promise<T>): Promise<T>;
  }
  ```

  Persistence Record 和分页输入在同一文件中定义，后续 Service 直接使用这些字段：

  ```ts
  export type SchoolComputePoolRecord = { schoolId: string; availablePoints: number; status: SchoolComputePoolStatus; createdAt: string; updatedAt: string };
  export type ProductionGroupRecord = { id: string; schoolId: string; name: string; description: string; leaderMembershipId: string; status: ProductionGroupStatus; schoolPointsBalance: number; createdAt: string; updatedAt: string };
  export type ProductionGroupUpdate = Partial<Pick<ProductionGroupRecord, "name" | "description" | "leaderMembershipId" | "status" | "schoolPointsBalance">> & { updatedAt: string };
  export type ProductionGroupMemberRecord = { id: string; schoolId: string; groupId: string; membershipId: string; role: "leader" | "member"; createdAt: string; updatedAt: string };
  export type ProductionGroupProjectRecord = { id: string; schoolId: string; groupId: string; orderId: string; projectType: "canvas" | "drama"; projectId: string; createdByMembershipId: string; createdAt: string; updatedAt: string };
  export type ComputeAllocationRequestRecord = { id: string; schoolId: string; groupId: string; orderId: string; requestedByMembershipId: string; amount: number; reason: string; status: ComputeAllocationRequestStatus; reviewNote: string; reviewedByMembershipId?: string; createdAt: string; updatedAt: string };
  export type ComputeAllocationRequestUpdate = Partial<Pick<ComputeAllocationRequestRecord, "status" | "reviewNote" | "reviewedByMembershipId">> & { updatedAt: string };
  export type PersonalAdvanceRecord = { id: string; schoolId: string; groupId: string; orderId: string; membershipId: string; userId: string; originalPoints: number; consumedPoints: number; remainingPoints: number; returnedPoints: number; status: PersonalAdvanceStatus; pointRecordId: string; createdAt: string; updatedAt: string };
  export type PersonalAdvanceUpdate = Partial<Pick<PersonalAdvanceRecord, "consumedPoints" | "remainingPoints" | "returnedPoints" | "status">> & { updatedAt: string };
  export type ComputeSettlementRecord = { id: string; schoolId: string; groupId: string; orderId: string; status: ComputeSettlementStatus; unusedPersonalPointsReturned: number; consumedPersonalPointsPending: number; confirmedPersonalPointsReturned: number; createdAt: string; updatedAt: string };
  export type ComputeSettlementUpdate = Partial<Pick<ComputeSettlementRecord, "status" | "unusedPersonalPointsReturned" | "consumedPersonalPointsPending" | "confirmedPersonalPointsReturned">> & { updatedAt: string };
  export type ComputeConsumptionRecord = { id: string; schoolId: string; groupId: string; orderId: string; generationTaskId: string; userId: string; sourceType: "group_school_points" | "group_personal_advance"; sourceId: string; amount: number; status: "charged" | "refunded" | "settled"; createdAt: string; updatedAt: string };
  export type SchoolComputeLedgerRecord = SchoolComputeLedgerEntry & { actorUserId?: string; sourceEntryId?: string };
  export type ComputePoolPageQuery = PageQuery & { keyword?: string; status?: SchoolComputePoolStatus };
  export type ProductionGroupPageQuery = PageQuery & { keyword?: string; status?: ProductionGroupStatus };
  export type ComputeLedgerPageQuery = PageQuery & { groupId?: string; orderId?: string; type?: string };
  ```

- [ ] **Step 4: 实现 PostgreSQL Repository**

  所有余额更新使用带条件的原子 SQL，例如：

  ```sql
  UPDATE school_compute_pools
  SET available_points = available_points - $2::numeric
  WHERE school_id = $1
    AND status = 'active'
    AND available_points >= $2::numeric
  RETURNING *;
  ```

  列表使用 `school_id + status + updated_at + LIMIT/OFFSET`，不读取完整表后在 Node.js 过滤。`transact()` 使用现有 `withPostgresTransaction`，传入 executor 时复用外层事务。

- [ ] **Step 5: 实现文件 Provider**

  `school-compute.json` 保存与九张表等价的数组。写入使用单文件 mutation queue 和 `withJsonDataFileLock`；导出 `SCHOOL_COMPUTE_DATA_FILE` 与 `mutateFileSchoolComputeInsideLock()`，供后续个人钱包跨文件事务复用。任何失败不写回工作快照。

- [ ] **Step 6: 运行 Provider 测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/server/database/school-compute-repository.test.ts src/lib/server/school-compute-file-repository.test.ts --no-file-parallelism; pnpm typecheck`

  Expected: PASS，两个 Provider 的核心行为一致，PostgreSQL 测试实际传入 `12.5`。

- [ ] **Step 7: 提交**

  ```bash
  git add web/src/lib/server/school-compute-repository.ts web/src/lib/server/database/school-compute-repository.ts web/src/lib/server/database/school-compute-repository.test.ts web/src/lib/server/school-compute-file-repository.ts web/src/lib/server/school-compute-file-repository.test.ts web/src/lib/server/database/index.ts web/src/lib/server/database/repositories.ts
  git commit -m "feat: add school compute repositories"
  ```

---

### Task 3: 实现平台学校算力池 Service、API 和审计

**Files:**

- Create: `web/src/lib/server/school-compute-service.ts`
- Create: `web/src/lib/server/school-compute-service.test.ts`
- Create: `web/src/app/api/admin/schools/[id]/compute/route.ts`
- Create: `web/src/app/api/admin/schools/[id]/compute/route.test.ts`
- Create: `web/src/app/api/admin/schools/[id]/compute/credit/route.ts`
- Create: `web/src/app/api/admin/schools/[id]/compute/ledger/route.ts`
- Create: `web/src/app/api/admin/school-compute/route.ts`
- Create: `web/src/app/api/admin/school-compute/route.test.ts`
- Create: `web/src/app/api/school/compute/route.ts`
- Create: `web/src/app/api/school/compute/route.test.ts`
- Create: `web/src/app/api/school/compute/ledger/route.ts`
- Create: `web/src/services/api/admin-school-compute.ts`
- Create: `web/src/services/api/admin-school-compute.test.ts`

**Interfaces:**

- Consumes: Task 2 Repository、现有 `hasAdminPermission`、`requireSchoolManager` 和审计日志。
- Produces: 学校池创建/读取/充值/调账/冻结/恢复/流水 API；`adminSchoolComputeApi`。

- [ ] **Step 1: 写权限、幂等和余额失败测试**

  覆盖：读取允许 `education.manage` 或 `billing.manage`；充值/调账/冻结要求两项权限；学校管理员只能读取本校；重复业务编号不重复充值；停用学校、冻结池、负数或零金额失败；跨校按 404。

  ```ts
  it("credits once for a repeated contract reference", async () => {
      const first = await creditSchoolComputePool("admin-a", "school-a", { amount: 12.5, reason: "合同首充", idempotencyKey: "contract-2026-a" });
      const second = await creditSchoolComputePool("admin-a", "school-a", { amount: 12.5, reason: "合同首充", idempotencyKey: "contract-2026-a" });
      expect(second.availablePoints).toBe(first.availablePoints);
      expect(mocks.insertLedgerEntry).toHaveBeenCalledOnce();
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd web; pnpm exec vitest run src/lib/server/school-compute-service.test.ts src/app/api/admin/school-compute/route.test.ts src/app/api/admin/schools/'[id]'/compute/route.test.ts src/app/api/school/compute/route.test.ts src/services/api/admin-school-compute.test.ts`

  Expected: FAIL，Service 和 Route 尚不存在。

- [ ] **Step 3: 实现 Service**

  固定导出以下函数：

  ```ts
  export async function listAdminSchoolComputePools(actorId: string, input: ComputePoolPageQuery): Promise<PageResult<AdminSchoolComputePool>>;
  export async function getAdminSchoolComputePool(actorId: string, schoolId: string): Promise<AdminSchoolComputePoolDetails>;
  export async function creditSchoolComputePool(actorId: string, schoolId: string, input: { amount: number; reason: string; idempotencyKey: string }): Promise<AdminSchoolComputePoolDetails>;
  export async function adjustSchoolComputePool(actorId: string, schoolId: string, input: { amount: number; reason: string; idempotencyKey: string }): Promise<AdminSchoolComputePoolDetails>;
  export async function setSchoolComputePoolStatus(actorId: string, schoolId: string, status: "active" | "frozen"): Promise<AdminSchoolComputePoolDetails>;
  export async function getCurrentSchoolComputePool(userId: string): Promise<SchoolComputePoolSummary>;
  ```

  池记录在首次充值、调账或状态变更时创建，不修改学校创建事务。管理员列表先按学校 Repository 分页，再通过 `listPoolsBySchoolIds()` 批量读取算力池；缺失池映射为零余额，不为列表读取写数据库。调减使用条件更新并拒绝负余额。Service 不返回平台合同备注给老师和学生。

- [ ] **Step 4: 实现 Route 和审计**

  充值、调账、冻结和恢复分别记录 `admin.school-compute.credit`、`admin.school-compute.adjust`、`admin.school-compute.freeze`、`admin.school-compute.activate`。审计 metadata 只保存学校 ID、金额、原因摘要和流水 ID，不保存成员私有项目内容。

- [ ] **Step 5: 实现 API 客户端**

  `adminSchoolComputeApi` 提供列表、详情、充值、调账、状态和流水方法，复用 `serializeApiParams`，统一解析 `{ code, data, msg }`。

- [ ] **Step 6: 运行测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/server/school-compute-service.test.ts src/app/api/admin/school-compute/route.test.ts src/app/api/admin/schools/'[id]'/compute/route.test.ts src/app/api/school/compute/route.test.ts src/services/api/admin-school-compute.test.ts; pnpm typecheck`

  Expected: PASS，权限、幂等、冻结和负余额用例通过。

- [ ] **Step 7: 提交**

  ```bash
  git add web/src/lib/server/school-compute-service.ts web/src/lib/server/school-compute-service.test.ts web/src/app/api/admin/school-compute web/src/app/api/admin/schools/'[id]'/compute web/src/app/api/school/compute web/src/services/api/admin-school-compute.ts web/src/services/api/admin-school-compute.test.ts
  git commit -m "feat: add school compute pool APIs"
  ```

---

### Task 4: 实现制作小组、成员、商单关联和追加申请

**Files:**

- Create: `web/src/lib/server/school-production-group-service.ts`
- Create: `web/src/lib/server/school-production-group-service.test.ts`
- Modify: `web/src/lib/server/commercial-order-service.ts`
- Modify: `web/src/lib/server/commercial-order-service.test.ts`
- Modify: `web/src/lib/school-domain.ts`
- Modify: `web/src/lib/server/school-domain-repository.ts`
- Modify: `web/src/lib/server/database/school-domain-repository.ts`
- Modify: `web/src/lib/server/school-domain-file-repository.ts`
- Create: `web/src/app/api/school/production-groups/route.ts`
- Create: `web/src/app/api/school/production-groups/route.test.ts`
- Create: `web/src/app/api/school/production-groups/[id]/route.ts`
- Create: `web/src/app/api/school/production-groups/[id]/members/route.ts`
- Create: `web/src/app/api/school/production-groups/[id]/allocate/route.ts`
- Create: `web/src/app/api/school/production-groups/[id]/allocation-requests/route.ts`
- Create: `web/src/app/api/teaching/production-groups/route.ts`
- Create: `web/src/app/api/teaching/production-groups/route.test.ts`
- Create: `web/src/app/api/teaching/production-groups/[id]/allocation-requests/route.ts`
- Create: `web/src/services/api/school-compute.ts`
- Create: `web/src/services/api/school-compute.test.ts`

**Interfaces:**

- Consumes: Task 2 Repository、Task 3 学校池、现有学校成员和商单 Repository。
- Produces: 小组 CRUD、成员替换、商单绑定、学校额度分配、组长追加申请和审批 API；`schoolComputeApi`。

- [ ] **Step 1: 写小组边界失败测试**

  覆盖：小组独立于班级；组长必须是本校 active membership 且必须在成员列表；同一商单只能绑定一个小组；小组可绑定多个商单；外校成员和已验收/取消商单失败；只有组长能申请追加；学校管理员审批时原子减少学校池并增加小组余额；重复审批不重复分配。

  ```ts
  it("allocates the approved request exactly once", async () => {
      const request = await requestGroupAllocation("leader-user", "group-a", { orderId: "order-a", amount: 8, reason: "视频生成" });
      await reviewGroupAllocation("manager-user", request.id, { decision: "approved", note: "同意" });
      await reviewGroupAllocation("manager-user", request.id, { decision: "approved", note: "重复提交" });
      expect(mocks.allocateToGroup).toHaveBeenCalledOnce();
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd web; pnpm exec vitest run src/lib/server/school-production-group-service.test.ts src/lib/server/commercial-order-service.test.ts src/app/api/school/production-groups/route.test.ts src/app/api/teaching/production-groups/route.test.ts src/services/api/school-compute.test.ts`

  Expected: FAIL，小组 Service 和 API 尚不存在。

- [ ] **Step 3: 实现小组 Service**

  固定导出：

  ```ts
  export async function createProductionGroup(managerId: string, input: { name: string; description?: string; leaderMembershipId: string; memberMembershipIds: string[] }): Promise<ProductionGroupDetails>;
  export async function updateProductionGroup(managerId: string, groupId: string, input: { name?: string; description?: string; status?: ProductionGroupStatus }): Promise<ProductionGroupDetails>;
  export async function replaceProductionGroupMembers(managerId: string, groupId: string, input: { leaderMembershipId: string; memberMembershipIds: string[] }): Promise<ProductionGroupDetails>;
  export async function linkCommercialOrderToGroup(managerId: string, groupId: string, orderId: string): Promise<ProductionGroupDetails>;
  export async function allocateSchoolPointsToGroup(managerId: string, groupId: string, input: { amount: number; reason: string; orderId?: string; idempotencyKey: string }): Promise<ProductionGroupDetails>;
  export async function requestGroupAllocation(userId: string, groupId: string, input: { orderId: string; amount: number; reason: string }): Promise<ComputeAllocationRequest>;
  export async function reviewGroupAllocation(managerId: string, requestId: string, input: { decision: "approved" | "rejected"; note: string }): Promise<ComputeAllocationRequest>;
  ```

  同步给 `SchoolDomainRepository` 增加：

  ```ts
  setCommercialOrderProductionGroup(schoolId: string, orderId: string, groupId: string, updatedAt: string): Promise<CommercialOrderRecord | null>;
  listCommercialOrdersForProductionGroup(schoolId: string, groupId: string, input: OrderPageQuery): Promise<Page<CommercialOrderRecord>>;
  ```

  `CommercialOrderRecord`、`AdminCommercialOrder` 和 `SchoolCommercialOrder` 增加可选 `productionGroupId`。该字段只由制作小组 Service 更新，不能由通用商单 PATCH 接收。小组归档前要求没有 active 商单、pending 申请或未结算个人垫付，并将未使用学校额度退回学校池。

  商单绑定和解绑同时修改学校域与算力域：PostgreSQL 复用同一个 `withPostgresTransaction` executor；文件 Provider 使用 `withJsonDataFileLocks([SCHOOL_DOMAIN_DATA_FILE, SCHOOL_COMPUTE_DATA_FILE])`，失败时恢复两个原始快照。额度分配、申请审批和归档释放在单个算力 Repository 事务内完成。

- [ ] **Step 4: 实现学校与教学 API**

  `/api/school/production-groups/*` 只允许学校管理员；`/api/teaching/production-groups` 返回本人加入的小组；组长申请 Route 校验 `leaderMembershipId`。所有列表接受 `page`、`pageSize`、`status`、`keyword`，最大 `pageSize=100`。

- [ ] **Step 5: 扩展商单 DTO**

  `SchoolCommercialOrder` 与 `AdminCommercialOrder` 增加可选 `productionGroupId` 和小组名称摘要；学校 DTO 仍不包含 `internalAmountCents`。负责老师、参与学生和小组成员是不同约束，不能用现有 `commercial_order_participants` 替代小组成员表。

- [ ] **Step 6: 运行测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/server/school-production-group-service.test.ts src/lib/server/commercial-order-service.test.ts src/app/api/school/production-groups/route.test.ts src/app/api/teaching/production-groups/route.test.ts src/services/api/school-compute.test.ts; pnpm typecheck`

  Expected: PASS，同校约束、单商单单小组、重复审批和归档释放余额用例通过。

- [ ] **Step 7: 提交**

  ```bash
  git add web/src/lib/server/school-production-group-service.ts web/src/lib/server/school-production-group-service.test.ts web/src/lib/server/commercial-order-service.ts web/src/lib/server/commercial-order-service.test.ts web/src/lib/school-domain.ts web/src/lib/server/school-domain-repository.ts web/src/lib/server/database/school-domain-repository.ts web/src/lib/server/school-domain-file-repository.ts web/src/app/api/school/production-groups web/src/app/api/teaching/production-groups web/src/services/api/school-compute.ts web/src/services/api/school-compute.test.ts
  git commit -m "feat: add school production groups"
  ```

---

### Task 5: 实现个人永久积分垫付和跨钱包原子事务

**Files:**

- Modify: `web/src/lib/server/points-wallet-service.ts`
- Modify: `web/src/lib/server/points-wallet-service.test.ts`
- Create: `web/src/lib/server/school-compute-advance-service.ts`
- Create: `web/src/lib/server/school-compute-advance-service.test.ts`
- Create: `web/src/lib/server/school-compute-advance-file.test.ts`
- Create: `web/src/app/api/teaching/production-groups/[id]/personal-advances/route.ts`
- Create: `web/src/app/api/teaching/production-groups/[id]/personal-advances/route.test.ts`
- Modify: `web/src/services/api/school-compute.ts`
- Modify: `web/src/services/api/school-compute.test.ts`

**Interfaces:**

- Consumes: Task 2 Repository、Task 4 小组/商单成员关系、现有 `AuthDatabase` 与永久积分余额。
- Produces: 只调整永久积分的事务 helper、个人垫付创建/列表 API。

- [ ] **Step 1: 写永久积分与回滚失败测试**

  覆盖：永久积分 20、每日赠送积分 100 时垫付 12.5 后永久积分为 7.5、每日积分仍为 100；永久积分不足即使总积分足够仍失败；外校/非小组成员/错误商单失败；重复幂等键只扣一次；写入算力记录失败时个人余额回滚；PostgreSQL 与文件 Provider 结果一致。

  ```ts
  it("uses permanent points without touching the daily wallet", async () => {
      const result = await createPersonalAdvance("student-user", "group-a", { orderId: "order-a", amount: 12.5, idempotencyKey: "advance-a" });
      expect(result.originalPoints).toBe(12.5);
      expect(mocks.user.pointsBalance).toBe(7.5);
      expect(mocks.dailyWallet.remainingPoints).toBe(100);
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd web; pnpm exec vitest run src/lib/server/points-wallet-service.test.ts src/lib/server/school-compute-advance-service.test.ts src/lib/server/school-compute-advance-file.test.ts src/app/api/teaching/production-groups/'[id]'/personal-advances/route.test.ts src/services/api/school-compute.test.ts --no-file-parallelism`

  Expected: FAIL，永久积分专用 helper 和垫付 Service 尚不存在。

- [ ] **Step 3: 增加永久积分专用 mutation helper**

  在 `points-wallet-service.ts` 导出：

  ```ts
  export type PermanentPointBusinessMutationInput = {
      userId: string;
      amount: number;
      description: string;
      idempotencyKey: string;
      recordType: "consume" | "credit";
      model: "school-compute";
      now?: Date;
  };

  export function mutatePermanentPointsInAuthDb(db: AuthDatabase, input: PermanentPointBusinessMutationInput): PointsWalletMutationResult;
  export async function mutatePermanentPointsInPostgresTransaction(client: QueryExecutor, input: PermanentPointBusinessMutationInput): Promise<PointsWalletMutationResult>;
  ```

  `amount < 0` 只允许 `consume`，`amount > 0` 只允许 `credit`。helper 锁定用户、只更新 `users.points_balance`、写 `point_records.permanent_amount`，不调用 `settlePostgresWallet`、不创建或修改每日钱包、不更新 `quota_usage`。

- [ ] **Step 4: 实现垫付跨存储事务**

  PostgreSQL 使用一次 `withPostgresTransaction`，同一 executor 依次锁定用户、学校成员、小组、商单和 advance 幂等键。文件 Provider 使用：

  ```ts
  await withJsonDataFileLocks([AUTH_DATA_FILE, SCHOOL_DOMAIN_DATA_FILE, SCHOOL_COMPUTE_DATA_FILE], async () => {
      // 读取三个快照，执行个人永久积分扣除和算力垫付写入；任一步失败就恢复三个原快照。
  });
  ```

  垫付记录保存个人扣分 `pointRecordId`，算力流水保存相同稳定业务引用。不得调用普通 `consumePoints()`，避免每日积分和生成配额参与。

- [ ] **Step 5: 实现 API 与客户端**

  ```ts
  export async function createPersonalAdvance(userId: string, groupId: string, input: { orderId: string; amount: number; idempotencyKey: string }): Promise<PersonalComputeAdvance>;
  export async function listOwnPersonalAdvances(userId: string, groupId: string, input: PageQuery): Promise<PageResult<PersonalComputeAdvance>>;
  ```

  Route 返回垫付原始、已消耗、未消耗、待返还和已返还数量，不返回其他成员个人积分余额。

- [ ] **Step 6: 运行测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/server/points-wallet-service.test.ts src/lib/server/school-compute-advance-service.test.ts src/lib/server/school-compute-advance-file.test.ts src/app/api/teaching/production-groups/'[id]'/personal-advances/route.test.ts src/services/api/school-compute.test.ts --no-file-parallelism; pnpm typecheck`

  Expected: PASS，`12.5` 垫付只减少永久积分，文件写入失败完整回滚。

- [ ] **Step 7: 提交**

  ```bash
  git add web/src/lib/server/points-wallet-service.ts web/src/lib/server/points-wallet-service.test.ts web/src/lib/server/school-compute-advance-service.ts web/src/lib/server/school-compute-advance-service.test.ts web/src/lib/server/school-compute-advance-file.test.ts web/src/app/api/teaching/production-groups/'[id]'/personal-advances web/src/services/api/school-compute.ts web/src/services/api/school-compute.test.ts
  git commit -m "feat: add personal compute advances"
  ```

---

### Task 6: 实现小组项目关联和可信 billing context

**Files:**

- Create: `web/src/lib/server/school-compute-billing-context.ts`
- Create: `web/src/lib/server/school-compute-billing-context.test.ts`
- Modify: `web/src/lib/server/school-production-group-service.ts`
- Modify: `web/src/lib/server/school-production-group-service.test.ts`
- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-task-store.test.ts`
- Modify: `web/src/lib/server/agent-run-store.ts`
- Modify: `web/src/app/api/agent/runs/route.ts`
- Modify: `web/src/app/api/agent/runs/route.test.ts`
- Modify: `web/src/app/api/text-tasks/route.ts`
- Modify: `web/src/app/api/text-tasks/route.test.ts`
- Modify: `web/src/app/api/image-tasks/route.ts`
- Modify: `web/src/app/api/image-tasks/route.test.ts`
- Modify: `web/src/app/api/audio-tasks/route.ts`
- Modify: `web/src/app/api/audio-tasks/route.test.ts`
- Modify: `web/src/app/api/video-generation-tasks/video-generation-route.ts`
- Modify: `web/src/app/api/video-generation-tasks/route.test.ts`
- Create: `web/src/app/api/teaching/production-groups/[id]/projects/route.ts`
- Create: `web/src/app/api/teaching/production-groups/[id]/projects/route.test.ts`
- Create: `web/src/app/api/teaching/project-billing/route.ts`
- Create: `web/src/app/api/teaching/project-billing/route.test.ts`

**Interfaces:**

- Consumes: Task 4 小组/商单、现有内容引用所有权校验、Task 1 `SchoolComputeBillingContext`。
- Produces: 项目关联 API、`resolveSchoolComputeBillingContext()`、可信 context 持久化到生成任务和 Agent Run。

- [ ] **Step 1: 写项目所有权和上下文失败测试**

  覆盖：成员只能关联自己的 Canvas/短剧；项目必须绑定当前小组的具体 active 商单；同一项目不能同时关联两个未结算商单；非小组成员失败；普通 `/create` chat、未关联项目和无限练习解析为空；关联项目的 text/image/video/audio/agent task 保存相同可信 billing context；客户端伪造 `schoolId/groupId/orderId` 被忽略并由服务端重算。

  ```ts
  it("derives billing context from the owned project link", async () => {
      await expect(resolveSchoolComputeBillingContext("student-user", { surface: "canvas", projectId: "canvas-a", executionProfile: "production" })).resolves.toEqual({
          schoolId: "school-a",
          groupId: "group-a",
          orderId: "order-a",
          projectType: "canvas",
          projectId: "canvas-a",
      });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd web; pnpm exec vitest run src/lib/server/school-compute-billing-context.test.ts src/lib/server/school-production-group-service.test.ts src/app/api/agent/runs/route.test.ts src/app/api/text-tasks/route.test.ts src/app/api/image-tasks/route.test.ts src/app/api/audio-tasks/route.test.ts src/app/api/video-generation-tasks/route.test.ts src/app/api/teaching/production-groups/'[id]'/projects/route.test.ts src/app/api/teaching/project-billing/route.test.ts`

  Expected: FAIL，项目关联和 context resolver 尚不存在。

- [ ] **Step 3: 实现项目关联**

  ```ts
  export async function linkProjectToProductionGroup(userId: string, groupId: string, input: { orderId: string; projectType: "canvas" | "drama"; projectId: string }): Promise<ProductionGroupProject>;
  export async function unlinkProjectFromProductionGroup(userId: string, groupId: string, linkId: string): Promise<{ removed: true }>;
  ```

  使用现有 `validateSchoolContentReferences()` 验证项目存在、归当前用户且学校一致。只有项目所有者可以创建关联；组长和学校管理员可以解除关联，但不能因此读取项目内容。

- [ ] **Step 4: 实现可信上下文解析**

  ```ts
  export async function resolveSchoolComputeBillingContext(userId: string, context?: GenerationTaskContext): Promise<SchoolComputeBillingContext | undefined>;
  ```

  仅当 `executionProfile !== "open-source-practice"`、`surface` 为 Canvas/Drama、项目有唯一 active 关联、用户是 active 小组成员、商单状态为 `in_progress` 或 `revision_required` 时返回。否则未关联项目返回 `undefined`；存在失效或跨校关联返回 409，不静默改扣个人积分。

- [ ] **Step 5: 在任务创建入口持久化可信上下文**

  `GenerationTaskContext` 增加 `billingContext?: SchoolComputeBillingContext`。五个创建入口在写任务前调用 resolver，并使用 `{ ...body.context, billingContext: resolved }` 覆盖客户端字段。`AgentRun` 增加同一字段并传给子任务；公开 Agent DTO 不展示学校、商单或内部账本信息。

- [ ] **Step 6: 运行测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/server/school-compute-billing-context.test.ts src/lib/server/school-production-group-service.test.ts src/lib/server/generation-task-store.test.ts src/app/api/agent/runs/route.test.ts src/app/api/text-tasks/route.test.ts src/app/api/image-tasks/route.test.ts src/app/api/audio-tasks/route.test.ts src/app/api/video-generation-tasks/route.test.ts src/app/api/teaching/production-groups/'[id]'/projects/route.test.ts src/app/api/teaching/project-billing/route.test.ts; pnpm typecheck`

  Expected: PASS，伪造 context 无效，练习任务无学校计费上下文。

- [ ] **Step 7: 提交**

  ```bash
  git add web/src/lib/server/school-compute-billing-context.ts web/src/lib/server/school-compute-billing-context.test.ts web/src/lib/server/school-production-group-service.ts web/src/lib/server/school-production-group-service.test.ts web/src/lib/server/generation-task-types.ts web/src/lib/server/generation-task-store.test.ts web/src/lib/server/agent-run-store.ts web/src/app/api/agent/runs web/src/app/api/text-tasks/route.ts web/src/app/api/text-tasks/route.test.ts web/src/app/api/image-tasks/route.ts web/src/app/api/image-tasks/route.test.ts web/src/app/api/audio-tasks/route.ts web/src/app/api/audio-tasks/route.test.ts web/src/app/api/video-generation-tasks web/src/app/api/teaching/production-groups/'[id]'/projects web/src/app/api/teaching/project-billing
  git commit -m "feat: resolve school project billing context"
  ```

---

### Task 7: 实现统一生成扣费凭证和 System AI 网关计费

**Files:**

- Create: `web/src/lib/server/generation-charge-service.ts`
- Create: `web/src/lib/server/generation-charge-service.test.ts`
- Modify: `web/src/lib/server/system-ai-billing.ts`
- Modify: `web/src/lib/server/system-ai-billing.test.ts`
- Modify: `web/src/app/api/ai/system/[channelId]/[...path]/route.ts`
- Modify: `web/src/app/api/ai/system/[channelId]/[...path]/route.test.ts`

**Interfaces:**

- Consumes: Task 2 算力账本、Task 5 永久积分 helper、Task 6 可信 billing context、现有 `consumeUserPoints/refundUserPoints`。
- Produces: `chargeGeneration()`、`refundGenerationCharge()`、`billingReceiptId` 响应头和通用生成扣费凭证。

- [ ] **Step 1: 写扣费优先级、拆分和退款失败测试**

  覆盖：无 billing context 继续扣个人积分；小组学校额度充足只扣学校额度；学校额度 3、任务成本 5 时再从个人垫付 FIFO 扣 2；总额不足时两边都不扣；相同 idempotencyKey 只扣一次；失败退款逐条回原来源；练习任务不调用任何扣费；错误/失效 context 不回退个人积分。

  ```ts
  it("splits a charge between school points and personal advances", async () => {
      const receipt = await chargeGeneration({
          userId: "student-user",
          amount: 5,
          units: 1,
          usageKind: "image",
          model: "image-model",
          idempotencyKey: "generation-a",
          requestFingerprint: "fingerprint-a",
          billingContext,
      });
      expect(receipt.sources).toEqual(["group_school_points", "group_personal_advance"]);
      expect(mocks.consumptions.map((item) => [item.sourceType, item.amount])).toEqual([
          ["group_school_points", 3],
          ["group_personal_advance", 2],
      ]);
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd web; pnpm exec vitest run src/lib/server/generation-charge-service.test.ts src/lib/server/system-ai-billing.test.ts src/app/api/ai/system/'[channelId]'/'[...path]'/route.test.ts`

  Expected: FAIL，统一生成计费服务尚不存在。

- [ ] **Step 3: 实现统一计费服务**

  ```ts
  export async function chargeGeneration(input: {
      userId: string;
      amount: number;
      units: number;
      usageKind: PointUsageKind;
      model: string;
      idempotencyKey: string;
      requestFingerprint: string;
      billingContext?: SchoolComputeBillingContext;
  }): Promise<GenerationChargeReceipt>;

  export async function refundGenerationCharge(input: {
      userId: string;
      receiptId: string;
      model: string;
      usageKind: PointUsageKind;
      units: number;
      idempotencyKey: string;
  }): Promise<{ refunded: boolean; personalPointsRemaining?: number }>;
  ```

  个人积分凭证格式为 `points:<pointRecordId>`，学校算力凭证格式为 `school:<consumptionBatchId>`。服务端解析前缀，不接受客户端直接创建 receipt。学校扣费在一次事务中先锁小组，再锁 personal advances，按学校额度、垫付时间顺序写一到多条 consumption 和 ledger；不足时整笔回滚。

- [ ] **Step 4: 扩展签名头和响应头**

  `systemAiBillingHeaders()` 增加第五个可选参数 `billingContext`；签名内容包含规范化后的 context JSON，防止请求中途替换学校、小组或商单。`readVerifiedSystemAiBusinessRequest()` 返回 `{ businessRequestId, billingContext }`。`SystemAiBilling` 改为：

  ```ts
  export type SystemAiBilling = {
      pointsCost?: number;
      billingReceiptId?: string;
  };
  ```

  网关响应写 `x-vozeb-pro-billing-receipt-id`，不再把学校 consumption ID伪装成 `pointsRecordId`。

- [ ] **Step 5: 网关改用统一扣费和退款**

  `route.ts` 用 `chargeGeneration()` 替换直接 `consumeUserPoints()`，网络失败、上游非 2xx 和请求 abort 用 `refundGenerationCharge()`。`open-source-practice` 继续跳过计费。HTTP 错误保持中文并映射现有 `QuotaExceededError/AuthInputError/SchoolServiceError` 状态。

- [ ] **Step 6: 运行测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/server/generation-charge-service.test.ts src/lib/server/system-ai-billing.test.ts src/app/api/ai/system/'[channelId]'/'[...path]'/route.test.ts; pnpm typecheck`

  Expected: PASS，个人、学校、混合、退款、练习和上下文防伪用例通过。

- [ ] **Step 7: 提交**

  ```bash
  git add web/src/lib/server/generation-charge-service.ts web/src/lib/server/generation-charge-service.test.ts web/src/lib/server/system-ai-billing.ts web/src/lib/server/system-ai-billing.test.ts web/src/app/api/ai/system/'[channelId]'/'[...path]'/route.ts web/src/app/api/ai/system/'[channelId]'/'[...path]'/route.test.ts
  git commit -m "feat: add unified generation charge receipts"
  ```

---

### Task 8: 迁移所有生成任务运行时到通用计费凭证

**Files:**

- Modify: `web/src/lib/server/generation-task-types.ts`
- Modify: `web/src/lib/server/generation-attempt.ts`
- Modify: `web/src/lib/server/image-task-store.ts`
- Modify: `web/src/lib/server/image-task-runtime.ts`
- Modify: `web/src/lib/server/image-task-runtime.test.ts`
- Modify: `web/src/lib/server/image-task-refund.ts`
- Modify: `web/src/app/api/image-tasks/image-task-support.ts`
- Modify: `web/src/app/api/image-tasks/image-task-types.ts`
- Modify: `web/src/lib/server/video-task-store.ts`
- Modify: `web/src/lib/server/video-task-runtime.ts`
- Modify: `web/src/lib/server/video-task-runtime.test.ts`
- Modify: `web/src/lib/server/video-task-refund.ts`
- Modify: `web/src/app/api/video-generation-tasks/video-generation-route.ts`
- Modify: `web/src/lib/server/audio-task-store.ts`
- Modify: `web/src/lib/server/audio-task-runtime.ts`
- Modify: `web/src/lib/server/audio-task-refund.ts`
- Modify: `web/src/lib/server/audio-task-refund.test.ts`
- Modify: `web/src/lib/server/text-task-store.ts`
- Modify: `web/src/lib/server/text-task-runtime.ts`
- Modify: `web/src/lib/server/text-task-runtime.test.ts`
- Modify: `web/src/lib/server/text-task-refund.ts`
- Modify: `web/src/lib/server/agent-run-execution.ts`
- Modify: `web/src/lib/server/agent-run-execution-direct.test.ts`
- Modify: `web/src/lib/server/agent-run-executor.ts`
- Modify: `web/src/lib/server/agent-run-executor.test.ts`
- Modify: `web/src/lib/server/agent-function-call.ts`
- Modify: `web/src/lib/server/agent-run-audit.ts`
- Modify: `web/src/lib/server/agent-run-audit.test.ts`
- Modify: `web/src/lib/server/agent-skill-import-refiner.ts`
- Modify: `web/src/lib/server/channel-protocol-assistant.ts`
- Modify: `web/src/lib/server/creative-review-service.ts`
- Modify: `web/src/lib/server/prompt-optimization-service.ts`
- Modify: `web/src/app/api/drama/analyze/route.ts`
- Modify: `web/src/app/api/image-tasks/[id]/route.ts`
- Modify: `web/src/app/api/audio-tasks/[id]/route.ts`
- Modify: `web/src/app/api/audio-tasks/[id]/route.test.ts`
- Modify: `web/src/app/api/text-tasks/[id]/route.ts`
- Modify: `web/src/app/api/video-tasks/[id]/route.ts`
- Modify: `web/src/app/api/video-tasks/[id]/route.test.ts`
- Modify: `web/src/lib/server/generation-task-cancellation-service.ts`

**Interfaces:**

- Consumes: Task 7 `billingReceiptId`、`refundGenerationCharge()` 和 context-aware `systemAiBillingHeaders()`。
- Produces: 图片、视频、音频、文本、Agent 和短剧分析统一保存/退款原始计费凭证。

- [ ] **Step 1: 将现有退款测试改为通用凭证并确认失败**

  各运行时夹具把：

  ```ts
  billing: { pointsCost: 2, pointsRecordId: "points-record", refunded: false }
  ```

  改成：

  ```ts
  billing: { pointsCost: 2, billingReceiptId: "school:batch-a", refunded: false }
  ```

  断言失败/取消调用 `refundGenerationCharge({ receiptId: "school:batch-a", ... })`，并增加 Agent 子任务继承 `run.billingContext` 的测试。

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd web; pnpm exec vitest run src/lib/server/image-task-runtime.test.ts src/lib/server/video-task-runtime.test.ts src/lib/server/audio-task-refund.test.ts src/lib/server/text-task-runtime.test.ts src/lib/server/agent-run-execution-direct.test.ts src/lib/server/agent-run-executor.test.ts`

  Expected: FAIL，运行时仍读取 `pointsRecordId` 并直接调用 `refundUserPoints`。

- [ ] **Step 3: 迁移任务存储类型**

  在 `generation-task-types.ts` 导出并让图片、视频、音频、文本和 `GenerationAttempt` 复用：

  ```ts
  type StoredTaskBilling = {
      pointsCost: number;
      billingReceiptId: string;
      refunded: boolean;
  };
  ```

  项目未上线，不保留 `pointsRecordId` 兼容读取。公开结果可以继续显示 `pointsCost` 和个人余额，但不得显示 receipt ID、来源拆分或内部 billing context。

- [ ] **Step 4: 迁移退款和签名调用**

  所有读取 `readSystemAiBilling()` 的路径保存 `billingReceiptId`；所有失败、取消、重试前清理路径调用 `refundGenerationCharge()`。任务发起 `systemAiBillingHeaders()` 时传入已由 Task 6 解析并持久化的 `task.billingContext` 或 `run.billingContext`。管理员协议助手、Skill 导入等无项目上下文的调用继续传 `undefined`，保持个人积分行为。

- [ ] **Step 5: 搜索禁止残留**

  Run: `rg -n "pointsRecordId|refundUserPoints\(" web/src/lib/server web/src/app/api`

  Expected: `pointsRecordId` 只允许出现在个人积分底层和历史测试命名中；生成任务运行时不得直接调用 `refundUserPoints()`，统一通过 `generation-charge-service.ts`。

- [ ] **Step 6: 运行生成任务回归和类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/server/image-task-runtime.test.ts src/lib/server/video-task-runtime.test.ts src/lib/server/audio-task-refund.test.ts src/lib/server/text-task-runtime.test.ts src/lib/server/agent-run-execution-direct.test.ts src/lib/server/agent-run-executor.test.ts src/app/api/image-tasks src/app/api/video-generation-tasks src/app/api/audio-tasks src/app/api/text-tasks --no-file-parallelism; pnpm typecheck`

  Expected: PASS，所有任务失败/取消均按原 receipt 退款，个人生成行为无回归。

- [ ] **Step 7: 提交**

  ```bash
  git add web/src/lib/server/generation-task-types.ts web/src/lib/server/generation-attempt.ts web/src/lib/server/image-task-store.ts web/src/lib/server/image-task-runtime.ts web/src/lib/server/image-task-runtime.test.ts web/src/lib/server/image-task-refund.ts web/src/app/api/image-tasks web/src/lib/server/video-task-store.ts web/src/lib/server/video-task-runtime.ts web/src/lib/server/video-task-runtime.test.ts web/src/lib/server/video-task-refund.ts web/src/app/api/video-generation-tasks web/src/app/api/video-tasks web/src/lib/server/audio-task-store.ts web/src/lib/server/audio-task-runtime.ts web/src/lib/server/audio-task-refund.ts web/src/lib/server/audio-task-refund.test.ts web/src/app/api/audio-tasks/'[id]' web/src/lib/server/text-task-store.ts web/src/lib/server/text-task-runtime.ts web/src/lib/server/text-task-runtime.test.ts web/src/lib/server/text-task-refund.ts web/src/app/api/text-tasks/'[id]' web/src/lib/server/agent-run-execution.ts web/src/lib/server/agent-run-execution-direct.test.ts web/src/lib/server/agent-run-executor.ts web/src/lib/server/agent-run-executor.test.ts web/src/lib/server/agent-function-call.ts web/src/lib/server/agent-run-audit.ts web/src/lib/server/agent-run-audit.test.ts web/src/lib/server/agent-skill-import-refiner.ts web/src/lib/server/channel-protocol-assistant.ts web/src/lib/server/creative-review-service.ts web/src/lib/server/prompt-optimization-service.ts web/src/app/api/drama/analyze/route.ts web/src/lib/server/generation-task-cancellation-service.ts
  git commit -m "refactor: use generation billing receipts"
  ```

---

### Task 9: 实现商单验收结算和学校确认返还

**Files:**

- Create: `web/src/lib/server/school-compute-settlement-service.ts`
- Create: `web/src/lib/server/school-compute-settlement-service.test.ts`
- Create: `web/src/lib/server/school-compute-settlement-file.test.ts`
- Modify: `web/src/lib/server/commercial-order-service.ts`
- Modify: `web/src/lib/server/commercial-order-service.test.ts`
- Modify: `web/src/app/api/admin/commercial-orders/[id]/review/route.ts`
- Create: `web/src/app/api/admin/commercial-orders/[id]/review/route.test.ts`
- Create: `web/src/app/api/school/production-groups/[id]/settlements/route.ts`
- Create: `web/src/app/api/school/production-groups/[id]/settlements/route.test.ts`
- Create: `web/src/app/api/school/production-groups/[id]/settlements/[settlementId]/confirm/route.ts`
- Modify: `web/src/services/api/school-compute.ts`
- Modify: `web/src/services/api/school-compute.test.ts`

**Interfaces:**

- Consumes: Task 5 永久积分 credit、Task 7 consumption 明细、现有商单验收事务。
- Produces: 商单验收原子开启结算、个人未使用垫付自动返还、已使用垫付待确认和学校确认返还 API。

- [ ] **Step 1: 写结算失败测试**

  覆盖：只有 `accepted` 开启结算；验收与结算创建原子成功；未使用个人垫付立即 credit 到永久积分；已使用部分保持 pending；学校管理员批量/逐笔确认后 credit；两次确认只返还一次；未确认不自动返还；学校额度留在仍有其他 active 商单的小组；小组归档时释放剩余学校额度；文件 Provider 任一步失败回滚商单、个人钱包和算力文件。

  ```ts
  it("returns unused points now and consumed points after school confirmation", async () => {
      const settlement = await openCommercialOrderSettlement("order-a");
      expect(settlement.unusedPersonalPointsReturned).toBe(4);
      expect(settlement.consumedPersonalPointsPending).toBe(6);
      await confirmConsumedAdvanceReturns("manager-user", settlement.id, { advanceIds: ["advance-a"] });
      expect(mocks.creditPermanentPoints).toHaveBeenCalledWith(expect.objectContaining({ amount: 6 }));
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd web; pnpm exec vitest run src/lib/server/school-compute-settlement-service.test.ts src/lib/server/school-compute-settlement-file.test.ts src/lib/server/commercial-order-service.test.ts src/app/api/admin/commercial-orders/'[id]'/review/route.test.ts src/app/api/school/production-groups/'[id]'/settlements/route.test.ts --no-file-parallelism`

  Expected: FAIL，结算 Service 尚不存在。

- [ ] **Step 3: 实现结算 Service**

  ```ts
  export async function openCommercialOrderSettlement(orderId: string, executor?: QueryExecutor): Promise<ComputeSettlement>;
  export async function listGroupSettlements(managerId: string, groupId: string, input: PageQuery): Promise<PageResult<ComputeSettlement>>;
  export async function confirmConsumedAdvanceReturns(managerId: string, settlementId: string, input: { advanceIds?: string[] }): Promise<ComputeSettlement>;
  ```

  `openCommercialOrderSettlement()` 锁定商单、小组、advance 和 consumption，计算每笔 advance 的 original/remaining/consumed/returned。未使用部分使用 `mutatePermanentPointsInPostgresTransaction(... recordType: "credit")` 或文件等价 helper，idempotencyKey 为 `school-compute:settlement:<settlementId>:unused:<advanceId>`。确认已使用部分的 key 为 `school-compute:settlement:<settlementId>:consumed:<advanceId>`。

- [ ] **Step 4: 将平台验收与结算放入同一事务**

  `reviewCommercialOrder(... decision: "accepted")` 在 PostgreSQL 下复用同一个 `withPostgresTransaction` executor 更新 delivery/order 并调用 `openCommercialOrderSettlement()`；文件 Provider 同时锁定并回滚 `AUTH_DATA_FILE`、`SCHOOL_DOMAIN_DATA_FILE`、`SCHOOL_COMPUTE_DATA_FILE`。`revision_required` 不创建结算。

- [ ] **Step 5: 实现学校确认 API**

  学校管理员可按 settlement 全量确认或提交明确 `advanceIds`。响应返回每位成员公开账号 ID、垫付原始/已使用/未使用/已返还数量和状态，不返回内部 UUID 作为用户标识回退。

- [ ] **Step 6: 运行测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/lib/server/school-compute-settlement-service.test.ts src/lib/server/school-compute-settlement-file.test.ts src/lib/server/commercial-order-service.test.ts src/app/api/admin/commercial-orders/'[id]'/review/route.test.ts src/app/api/school/production-groups/'[id]'/settlements/route.test.ts src/services/api/school-compute.test.ts --no-file-parallelism; pnpm typecheck`

  Expected: PASS，未使用自动返还、已使用人工确认、幂等和三文件回滚全部通过。

- [ ] **Step 7: 提交**

  ```bash
  git add web/src/lib/server/school-compute-settlement-service.ts web/src/lib/server/school-compute-settlement-service.test.ts web/src/lib/server/school-compute-settlement-file.test.ts web/src/lib/server/commercial-order-service.ts web/src/lib/server/commercial-order-service.test.ts web/src/app/api/admin/commercial-orders/'[id]'/review web/src/app/api/school/production-groups/'[id]'/settlements web/src/services/api/school-compute.ts web/src/services/api/school-compute.test.ts
  git commit -m "feat: settle school compute advances"
  ```

---

### Task 10: 实现平台、学校、老师和学生页面

**Files:**

- Create: `web/src/app/admin/school-compute/components/admin-school-compute-section.tsx`
- Create: `web/src/app/admin/school-compute/components/admin-school-compute-section.test.tsx`
- Modify: `web/src/components/admin/admin-sections.ts`
- Modify: `web/src/components/admin/admin-sections.test.ts`
- Modify: `web/src/components/admin/admin-section-nav.tsx`
- Modify: `web/src/components/admin/admin-section-nav.test.tsx`
- Modify: `web/src/components/admin/admin-dashboard.tsx`
- Modify: `web/src/components/admin/admin-section-preload.test.ts`
- Modify: `web/src/app/admin/role-overview/components/admin-role-overview-section.tsx`
- Modify: `web/src/app/admin/role-overview/components/admin-role-overview-section.test.tsx`
- Create: `web/src/app/(user)/school/components/production-groups-panel.tsx`
- Create: `web/src/app/(user)/school/components/production-groups-panel.test.tsx`
- Modify: `web/src/app/(user)/school/school-administration.tsx`
- Create: `web/src/components/school/production-group-member-panel.tsx`
- Create: `web/src/components/school/production-group-member-panel.test.tsx`
- Modify: `web/src/app/(user)/teaching/page.tsx`
- Modify: `web/src/app/(user)/learning/page.tsx`
- Create: `web/src/components/school/school-project-billing-badge.tsx`
- Create: `web/src/components/school/school-project-billing-badge.test.tsx`
- Modify: `web/src/app/(user)/canvas/[id]/canvas-client-page.tsx`
- Modify: `web/src/app/(user)/drama/[id]/page.tsx`

**Interfaces:**

- Consumes: Task 3 `adminSchoolComputeApi`、Task 4/5/9 `schoolComputeApi`、Task 6 项目 billing 摘要。
- Produces: 平台“学校算力池”分区、学校“制作小组与算力”Tab、师生小组页、Canvas/短剧扣费来源提示。

- [ ] **Step 1: 写角色、操作和响应式失败测试**

  断言：平台分区展示学校、总额度、可用、已分配、已消耗和状态；仅同时具备两项权限显示充值/调账/冻结按钮；学校管理员可管理小组、分配、审批和确认返还；组长可申请追加；成员可显式垫付且页面写明“仅使用个人永久积分”；Canvas/短剧关联项目显示“小组算力 · 商单名称”，无限练习不显示；accepted/settled 后不显示新增垫付和生成扣费操作。

- [ ] **Step 2: 运行测试确认失败**

  Run: `cd web; pnpm exec vitest run src/app/admin/school-compute/components/admin-school-compute-section.test.tsx src/app/admin/role-overview/components/admin-role-overview-section.test.tsx src/components/admin/admin-sections.test.ts src/components/admin/admin-section-nav.test.tsx src/components/admin/admin-section-preload.test.ts src/app/'(user)'/school/components/production-groups-panel.test.tsx src/components/school/production-group-member-panel.test.tsx src/components/school/school-project-billing-badge.test.tsx`

  Expected: FAIL，新页面和 Admin section 尚不存在。

- [ ] **Step 3: 实现平台后台分区**

  增加 `schoolCompute` section key，放在“产教运营”的“学校管理”之后。页面使用学校池分页列表、详情 Drawer、充值/调账 Modal 和流水分页；`hasAllAdminPermissions(currentUser, ["education.manage", "billing.manage"])` 控制 mutation 按钮。动态 import 只在指针、触控或键盘意图时预加载。角色功能总览同步增加学校管理员的“制作小组、学校算力分配、返还确认”、老师的“组长追加申请”和学生的“个人永久积分垫付”只读说明，超级管理员无需创建虚拟学校成员即可看见新功能。

- [ ] **Step 4: 实现学校后台 Tab**

  `SchoolAdministration` 增加 `{ key: "production-groups", label: "制作小组与算力" }`，业务 UI 放入同目录 `components/production-groups-panel.tsx`，不继续扩大主文件。包含池摘要、小组卡片/列表、创建 Drawer、成员选择、商单关联、额度分配、追加申请审批、settlement Drawer 和确认返还。

- [ ] **Step 5: 实现老师和学生视图**

  `ProductionGroupMemberPanel` 根据 `useSchoolContextStore().context.membership.role` 展示本人小组。老师为组长时显示追加申请；所有 active 成员显示自己的垫付记录和“临时补充小组算力”Modal。个人永久积分余额使用现有 points API 获取，不把其他成员余额暴露到浏览器。

- [ ] **Step 6: 实现项目扣费来源提示**

  `SchoolProjectBillingBadge` 调用 `/api/teaching/project-billing`，只显示学校/小组/商单名称、当前可用额度和预计扣费来源摘要；不显示内部流水 ID。Canvas 在 `canvas-client-page.tsx` 顶部工具区渲染，短剧在 `[id]/page.tsx` 项目工具栏渲染。未关联项目不渲染 DOM；`open-source-practice` 项目不请求该 API。

- [ ] **Step 7: 运行 UI 测试与类型检查**

  Run: `cd web; pnpm exec vitest run src/app/admin/school-compute/components/admin-school-compute-section.test.tsx src/app/admin/role-overview/components/admin-role-overview-section.test.tsx src/components/admin/admin-sections.test.ts src/components/admin/admin-section-nav.test.tsx src/components/admin/admin-section-preload.test.ts src/app/'(user)'/school/components/production-groups-panel.test.tsx src/components/school/production-group-member-panel.test.tsx src/components/school/school-project-billing-badge.test.tsx; pnpm typecheck`

  Expected: PASS，角色操作、隐藏状态和 section preload 用例通过。

- [ ] **Step 8: 提交**

  ```bash
  git add web/src/app/admin/school-compute web/src/components/admin/admin-sections.ts web/src/components/admin/admin-sections.test.ts web/src/components/admin/admin-section-nav.tsx web/src/components/admin/admin-section-nav.test.tsx web/src/components/admin/admin-dashboard.tsx web/src/components/admin/admin-section-preload.test.ts web/src/app/admin/role-overview/components/admin-role-overview-section.tsx web/src/app/admin/role-overview/components/admin-role-overview-section.test.tsx web/src/app/'(user)'/school/components/production-groups-panel.tsx web/src/app/'(user)'/school/components/production-groups-panel.test.tsx web/src/app/'(user)'/school/school-administration.tsx web/src/components/school/production-group-member-panel.tsx web/src/components/school/production-group-member-panel.test.tsx web/src/app/'(user)'/teaching/page.tsx web/src/app/'(user)'/learning/page.tsx web/src/components/school/school-project-billing-badge.tsx web/src/components/school/school-project-billing-badge.test.tsx web/src/app/'(user)'/canvas/'[id]'/canvas-client-page.tsx web/src/app/'(user)'/drama/'[id]'/page.tsx
  git commit -m "feat: add school compute user interfaces"
  ```

---

### Task 11: 完成真实 PostgreSQL、浏览器闭环、文档和发布门禁

**Files:**

- Create: `web/e2e/school-compute.spec.ts`
- Modify: `web/e2e/school-education.spec.ts`
- Modify: `web/e2e/all-pages.spec.ts`
- Modify: `web/e2e/support.ts`
- Modify: `web/playwright.config.ts`
- Modify: `docs/content/docs/backend/backend-database.mdx`
- Modify: `docs/progress/page-api-evidence.md`
- Modify: `VOZEB-PRO-接口索引.md`

**Interfaces:**

- Consumes: Task 1-10 的最终表、API、页面、状态、生成扣费和结算链路。
- Produces: 双学校真实闭环、桌面/390px/430px UI 证据、数据库与接口文档、全量发布验证。

- [ ] **Step 1: 编写 PostgreSQL 集成回归**

  在已有 `school-compute-schema.postgres.test.ts` 和 `school-compute-repository.test.ts` 增加真实事务用例：并发分配不能透支；并发个人垫付不能把永久积分扣成负数；同一生成幂等请求只产生一批 consumption；同一 settlement 并发确认只 credit 一次。共享测试库使用 `--no-file-parallelism`。

- [ ] **Step 2: 编写浏览器完整闭环**

  `school-compute.spec.ts` 使用随机后缀执行：

  1. 平台管理员创建学校 A/B，并给学校 A 充值 100 算力点。
  2. 学校 A 创建老师、学生、制作小组，分配 30 点并关联商单。
  3. 学生把自己的 Canvas 项目关联到小组/商单，页面显示小组算力来源。
  4. 生成夹具成功消耗学校额度；失败夹具退回原额度。
  5. 小组余额不足后学生用永久积分垫付，确认每日赠送积分不变。
  6. 组长申请追加，学校管理员审批一次，重复请求不重复增加。
  7. 平台验收商单，未使用垫付自动退回，已使用垫付进入待确认。
  8. 学校管理员确认返还，学生永久积分增加；再次确认余额不变。
  9. 学校 B 对学校 A 的 pool/group/order/project/settlement API 请求全部返回 404。
  10. 无限练习生成不改变学校池、小组额度或个人积分。

- [ ] **Step 3: 完成桌面和移动浏览器检查**

  在 `chromium`、`mobile-390`、`mobile-430` 执行学校池列表、小组详情、垫付 Modal、结算 Drawer、Canvas 和短剧 badge。使用正常语义点击，不使用 `force`、固定 sleep 或固定重试。调用现有 `expectNoHorizontalOverflow` 和 `expectVisibleControlsWithinViewport`，读取 Drawer、表格/卡片和底部操作区实际边界。

- [ ] **Step 4: 更新数据库和接口文档**

  `backend-database.mdx` 记录九张表、`commercial_orders.production_group_id`、所有关键复合外键/部分唯一索引、三文件 Provider 事务和原来源退款。`page-api-evidence.md` 增加平台、学校管理员、组长、普通成员和生成网关证据链。`VOZEB-PRO-接口索引.md` 增加 admin/school/teaching 算力路由、方法、权限、状态和返回范围。

- [ ] **Step 5: 运行学校算力定向 Vitest**

  Run: `cd web; pnpm exec vitest run src/lib/school-compute-domain.test.ts src/lib/server/database/school-compute-repository.test.ts src/lib/server/school-compute-file-repository.test.ts src/lib/server/school-compute-service.test.ts src/lib/server/school-production-group-service.test.ts src/lib/server/school-compute-advance-service.test.ts src/lib/server/school-compute-billing-context.test.ts src/lib/server/generation-charge-service.test.ts src/lib/server/school-compute-settlement-service.test.ts src/lib/server/commercial-order-service.test.ts src/app/api/admin/school-compute src/app/api/school/compute src/app/api/school/production-groups src/app/api/teaching/production-groups src/app/api/teaching/project-billing src/services/api/admin-school-compute.test.ts src/services/api/school-compute.test.ts --no-file-parallelism; pnpm typecheck`

  Expected: PASS，文件 Provider、服务、API、权限、生成计费和结算全部通过。

- [ ] **Step 6: 运行真实 PostgreSQL 回归**

  在 `DATABASE_URL` 明确指向专用测试库后运行：

  Run: `cd web; $env:VOZEB_PRO_RUN_POSTGRES_INTEGRATION="1"; pnpm exec vitest run src/lib/server/database/school-compute-schema.postgres.test.ts src/lib/server/database/school-compute-repository.test.ts --no-file-parallelism`

  Expected: PASS 且不是 skip；`12.5` 小数、并发分配、并发垫付和幂等结算均由真实 PostgreSQL 执行。

- [ ] **Step 7: 严格检查 UTF-8 和补丁质量**

  Run from repository root:

  ```powershell
  $utf8Strict = [System.Text.UTF8Encoding]::new($false, $true)
  $changedTextFiles = git diff --name-only --diff-filter=ACMR | Where-Object { $_ -match '\.(ts|tsx|md|mdx|json|yaml|yml)$' }
  foreach ($file in $changedTextFiles) { [void]$utf8Strict.GetString([System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $file))) }
  rg -n -P "\x{FFFD}|\x{951F}\x{65A4}\x{62F7}" $changedTextFiles
  git diff --check
  ```

  Expected: 严格解码成功，乱码扫描无匹配，`git diff --check` 无输出。

- [ ] **Step 8: 运行全量发布门禁**

  Run: `cd web; pnpm check:release`

  Expected: 依赖审计、lint、format check、全量 Vitest、typecheck 和 production build 全部通过。

- [ ] **Step 9: 使用动态空闲端口运行完整 Playwright**

  Run from `web`:

  ```powershell
  function Get-SchoolComputeFreePort {
      $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
      $listener.Start()
      try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
  }
  $env:VOZEB_PRO_E2E_PORT = [string](Get-SchoolComputeFreePort)
  $env:VOZEB_PRO_PROTOCOL_FIXTURE_PORT = [string](Get-SchoolComputeFreePort)
  $env:VOZEB_PRO_PAYMENT_FIXTURE_PORT = [string](Get-SchoolComputeFreePort)
  pnpm e2e
  ```

  Expected: 桌面、390px、430px 全部通过；不调用管理员后台配置的真实上游，不复用未知本机服务，无横向溢出和未预期控制台错误。

- [ ] **Step 10: 对照最终验收清单**

  - 平台管理员可按合同给学校充值、调账、冻结并查看流水。
  - 学校管理员可建立独立于班级的制作小组，设置组长/成员并分配额度。
  - 一个商单最多关联一个小组，一个小组可以关联多个商单。
  - 组长可申请追加，学校审批使用幂等原子分配。
  - 成员只能用个人永久积分垫付，每日赠送积分不变。
  - Canvas/短剧所有权不变，项目关联只提供商单和预算上下文。
  - 正式生成按学校额度再个人垫付扣费，失败退回原来源。
  - 商单验收后未使用垫付自动退回，已使用垫付待学校确认返还。
  - 重复验收、审批、退款和返还不会重复增加余额。
  - 学校之间无法读取或修改对方池、小组、项目关联、垫付和结算。
  - 无限练习不扣学校算力池或个人积分。
  - 普通个人创作、充值、Canvas、短剧和既有商单流程无回归。

- [ ] **Step 11: 提交**

  ```bash
  git add web/e2e/school-compute.spec.ts web/e2e/school-education.spec.ts web/e2e/all-pages.spec.ts web/e2e/support.ts web/playwright.config.ts docs/content/docs/backend/backend-database.mdx docs/progress/page-api-evidence.md VOZEB-PRO-接口索引.md
  git commit -m "test: cover school compute workflows"
  ```

---

## 完成定义

只有以下条件全部满足，才能声明学校算力池首期完成：

1. 11 个任务均按 TDD 顺序完成并独立提交。
2. PostgreSQL 与文件 Provider 通过相同核心领域行为测试。
3. 正式生成的个人积分、学校额度、个人垫付和失败退款均有自动化证据。
4. 商单验收、未使用垫付自动退回、已使用垫付学校确认和防重复返还均有自动化证据。
5. 平台管理员、学校管理员、组长、普通成员和双学校隔离均有 API 与浏览器证据。
6. `pnpm check:release`、真实 PostgreSQL 集成测试和完整 Playwright 矩阵全部通过。
7. 数据库文档、页面/API 证据和接口索引与实际代码一致。
8. 未修改或提交实施开始前已有的无关工作区改动。
