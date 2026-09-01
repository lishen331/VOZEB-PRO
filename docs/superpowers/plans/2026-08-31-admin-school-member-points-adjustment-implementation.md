# Admin School Member Points Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow every active platform administrator to find members inside any school and add or deduct that member's personal permanent points with a mandatory reason, complete ledger history, audit history, cross-school isolation, and idempotent writes.

**Architecture:** Reuse the existing school membership repository for school-scoped paging/search and the existing personal points wallet for permanent-point mutations. Add an admin-only orchestration service that validates the school/member relationship and coordinates wallet mutation. PostgreSQL performs membership validation and point mutation in one transaction; the file provider performs one serialized auth-wallet mutation after a school-scoped membership read. Expose two admin Route Handlers and a responsive member Drawer/adjustment Modal in the existing school management section. No new tables are required.

**Tech Stack:** Next.js App Router and Route Handlers, React, TypeScript, Ant Design 6, Tailwind CSS, PostgreSQL/file providers, Vitest, Playwright.

## Global Constraints

- Treat `docs/superpowers/specs/2026-08-31-admin-school-member-points-adjustment-design.md` as the approved product contract.
- Preserve all existing user changes and untracked files; do not reformat or include unrelated files in task commits.
- Use public account ID in every administrator-facing member row, search result, adjustment dialog, and audit target metadata.
- All active global `admin` accounts can read the school list, open the school member Drawer, and adjust member points. Only administrators with `education.manage` can create schools, view/edit full school details, or use other existing education-management mutations.
- School managers, teachers, students, ordinary users, inactive administrators, and unauthenticated callers cannot use the new admin member APIs.
- Adjust only personal permanent points. Do not modify daily points, school compute pools, production-group balances, personal advances, project billing context, or infinite-practice charging.
- Allow adjustment while the school, membership, or target user account is disabled; do not reactivate any of them.
- Amounts are positive request values with at most two decimal places. `credit` maps to a positive ledger delta and `debit` maps to a negative ledger delta. Reject a debit that would make permanent points negative; never clamp or partially apply it.
- Bind idempotency to actor, school, membership, target user, operation, amount, and reason. An exact replay returns the original ledger result; reusing the same key with different inputs returns 409.
- Keep Route Handlers limited to request parsing, Session/role checks, service calls, envelope mapping, and audit calls. Keep business validation and transactions in `web/src/lib/server/`.
- Do not add a new database table. Update `docs/backend-database.md` only if implementation discovers that a schema change is truly required; otherwise leave it untouched.
- Use TDD for every task: add the failing assertion, run it and observe the expected failure, implement the minimum code, then rerun until green.
- PostgreSQL tests that share a schema and perform writes or locks must run with `--no-file-parallelism`.
- Save all Chinese source, tests, and documentation as UTF-8 and perform strict decoding plus mojibake checks before completion.

---

### Task 1: Define the admin contract and open the school list to every active platform administrator

**Files:**
- Modify: `web/src/lib/admin-permissions.ts`
- Modify: `web/src/lib/school-domain.ts`
- Modify: `web/src/lib/server/school-access-service.ts`
- Modify: `web/src/lib/server/school-tenant-service.ts`
- Modify: `web/src/components/admin/admin-sections.ts`
- Modify: `web/src/components/admin/admin-sections.test.ts`
- Modify: `web/src/app/api/admin/schools/route.ts`
- Modify: `web/src/app/api/admin/schools/route.test.ts`

- [ ] Add failing permission tests proving that an active `admin` with `users.manage`, an active `admin` with an empty permission list, and an education administrator can access `schools`, while an inactive administrator and ordinary user cannot. Keep `courses`, `commercialOrders`, and `schoolCompute` restricted by their current duties.

```ts
expect(canAccessAdminSection({ role: "admin", status: "active", adminPermissions: [] }, "schools")).toBe(true);
expect(canAccessAdminSection({ role: "admin", status: "active", adminPermissions: ["users.manage"] }, "schools")).toBe(true);
expect(canAccessAdminSection({ role: "admin", status: "disabled", adminPermissions: ["education.manage"] }, "schools")).toBe(false);
expect(canAccessAdminSection({ role: "user", status: "active", adminPermissions: [] }, "schools")).toBe(false);
expect(canAccessAdminSection({ role: "admin", status: "active", adminPermissions: ["users.manage"] }, "courses")).toBe(false);
```

- [ ] Run the focused tests and confirm the non-education administrator assertions fail before implementation.

```powershell
Set-Location web
pnpm exec vitest run src/components/admin/admin-sections.test.ts src/app/api/admin/schools/route.test.ts --no-file-parallelism
```

- [ ] Add a single reusable `isActivePlatformAdmin(user)` helper in `admin-permissions.ts`. Special-case only the `schools` section in `canAccessAdminSection`; do not broaden the permissions of any other section.

```ts
export function isActivePlatformAdmin(user: { role?: unknown; status?: unknown } | null | undefined) {
    return user?.role === "admin" && user.status === "active";
}

export function canAccessAdminSection(user: { role?: unknown; status?: unknown; adminPermissions?: unknown }, section: AdminSectionKey) {
    if (section === "schools") return isActivePlatformAdmin(user);
    const permissions = ADMIN_SECTION_PERMISSIONS[section];
    return hasAnyAdminPermission(user, permissions.length ? permissions : undefined);
}
```

- [ ] Add `requirePlatformAdmin(userId)` to `school-access-service.ts` using `getPublicUsersByIds([userId])` and `isActivePlatformAdmin`. Change only `listSchoolsByAdmin` to use it. Keep `getSchoolByAdmin`, `createSchoolByAdmin`, and `updateSchoolByAdmin` on `requireEducationAdmin`.
- [ ] Change only `GET /api/admin/schools` to accept every active platform administrator. Keep `POST /api/admin/schools` on `education.manage`. Extend the Route test to prove this read/write split.
- [ ] Add the approved admin-only domain types without changing the ordinary school-member response:

```ts
export type AdminSchoolMemberQuery = {
    page?: number;
    pageSize?: number;
    keyword?: string;
    role?: SchoolMemberRole;
    status?: SchoolMembershipStatus;
};

export type AdminSchoolMemberPoints = SchoolMember & {
    userId: string;
    accountStatus: UserStatus;
    permanentPoints: number;
    dailyPoints: number;
    totalPoints: number;
    dailyPointsExpiresAt: string;
};

export type AdminSchoolMemberPointsAdjustmentInput = {
    operation: "credit" | "debit";
    amount: number;
    reason: string;
    idempotencyKey: string;
};

export type AdminSchoolMemberPointsAdjustmentResult = {
    member: AdminSchoolMemberPoints;
    adjustment: {
        recordId: string;
        operation: "credit" | "debit";
        amount: number;
        balanceBefore: number;
        balanceAfter: number;
        reason: string;
        createdAt: string;
    };
};
```

- [ ] Rerun the focused tests and `pnpm run typecheck` before committing this task.

---

### Task 2: Strengthen the permanent-points adjustment primitive for inactive accounts, non-negative debits, decimals, and request fingerprints

**Files:**
- Modify: `web/src/lib/server/points-wallet-service.ts`
- Modify: `web/src/lib/server/points-wallet-service.test.ts`
- Modify: `web/src/lib/server/points-wallet-idempotency.postgres.test.ts`

- [ ] Add failing file-provider tests that adjust `12.5` points on a disabled user with `requireActive: false`, preserve daily points, reject a debit below zero without writing a record, replay the same fingerprint once, and reject the same idempotency key with a different fingerprint.

```ts
const first = adjustPermanentPointsInAuthDb(db, {
    userId: "user-one",
    amount: -12.5,
    description: "合同额度修正",
    idempotencyKey: "school-member-adjust:file:one",
    requestFingerprint: "a".repeat(64),
    minimumBalance: 0,
    requireActive: false,
});
expect(first).toMatchObject({
    applied: true,
    snapshot: { permanentPoints: 7.5, dailyPoints: 100 },
    record: { type: "admin-adjust", amount: -12.5, permanentAmount: -12.5, dailyAmount: 0, requestFingerprint: "a".repeat(64) },
});
```

- [ ] Add a PostgreSQL integration case using a real decimal amount and disabled user. Assert exact replay is not applied twice, mismatched fingerprint returns 409, and an excessive debit leaves both `users.points_balance` and `point_records` unchanged.
- [ ] Run the file and PostgreSQL tests and confirm the new assertions fail for the expected missing semantics.

```powershell
Set-Location web
pnpm exec vitest run src/lib/server/points-wallet-service.test.ts src/lib/server/points-wallet-idempotency.postgres.test.ts --no-file-parallelism
```

- [ ] Extend the shared adjustment input with `requestFingerprint`, `minimumBalance`, and `requireActive`. Apply identical rules in `adjustPermanentPointsInAuthDb` and `adjustPermanentPointsInPostgresTransaction`.
- [ ] Replace minimum-balance clamping with rejection for this adjustment primitive. Throw a 409 wallet conflict carrying `个人永久积分不足` before changing the user or adding a point record.
- [ ] Persist `requestFingerprint` on the `admin-adjust` point record. On idempotent replay, compare `userId`, record type, signed amount, description, and fingerprint before returning `applied: false`; any mismatch throws 409.
- [ ] Keep existing callers source-compatible by making the new fields optional. Do not change consumption, refund, CDK, referral, billing, or absolute user-editor behavior.
- [ ] Rerun the focused tests and typecheck. Review every existing call to `adjustPermanentPointsInPostgresTransaction` to ensure the stricter replay check does not change requests that do not provide a fingerprint.

---

### Task 3: Add the platform-admin school-member points service

**Files:**
- Create: `web/src/lib/server/admin-school-member-points-service.ts`
- Create: `web/src/lib/server/admin-school-member-points-service.test.ts`
- Modify: `web/src/lib/server/database/auth-entity-concurrency.postgres.test.ts`

- [ ] Write failing service tests for all of these cases: any active platform admin can list members; ordinary and inactive users receive 403; missing school receives 404; a membership from another school receives 404; search/filter/pagination are passed to `repository.listMembers`; returned rows expose public account ID and current permanent/daily/total balances; disabled school/member/account can still be adjusted; daily points are unchanged; decimal credit/debit return correct before/after balances; amount/reason/idempotency validation returns 400; over-debit and fingerprint conflict return 409.
- [ ] Use dependency mocks only at the service boundary and assert the repository is called with the selected `schoolId`, never with an unscoped all-member query.
- [ ] Run the new test and confirm it fails because the service does not yet exist.

```powershell
Set-Location web
pnpm exec vitest run src/lib/server/admin-school-member-points-service.test.ts --no-file-parallelism
```

- [ ] Implement `listSchoolMembersByAdmin(actorId, schoolId, query)`. It must call `requirePlatformAdmin`, verify the school exists, call `listMembers(schoolId, query)`, batch-load only the current page users through `getPublicUsersByIds`, and map them to `AdminSchoolMemberPoints`.
- [ ] Implement strict input normalization before any write:

```ts
const amountText = String(input.amount).trim();
const amount = Number(amountText);
if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0) {
    throw new SchoolServiceError(400, "积分数量必须为最多两位小数的正数");
}
const reason = input.reason.trim();
if (!reason) throw new SchoolServiceError(400, "请填写调账原因");
const idempotencyKey = input.idempotencyKey.trim();
if (!idempotencyKey) throw new SchoolServiceError(400, "缺少调账幂等编号");
const signedAmount = input.operation === "credit" ? amount : -amount;
```

- [ ] Build a stable SHA-256 request fingerprint from a canonical object containing `actorId`, `schoolId`, `membershipId`, `userId`, `operation`, normalized amount, and reason. Do not place secrets or target passwords in the fingerprint.
- [ ] In PostgreSQL, call `ensurePostgresSchema()` and use `withPostgresTransaction`. Inside that transaction, create the school repository with the transaction executor, lock/read the school and `schoolId + membershipId`, then call `adjustPermanentPointsInPostgresTransaction` with `type: "admin-adjust"`, `minimumBalance: 0`, and `requireActive: false`.
- [ ] In file mode, verify the school and membership using the file school repository, then call `mutateAuthDb` once and run `adjustPermanentPointsInAuthDb` inside that serialized auth write. The balance and point record must be written together.
- [ ] Derive the returned adjustment from the persisted record, not from client input:

```ts
const balanceAfter = wallet.record.permanentBalanceAfter;
const balanceBefore = balanceAfter - wallet.record.permanentAmount;
return {
    member: await loadAdminMember(membership),
    adjustment: {
        recordId: wallet.record.id,
        operation: wallet.record.amount >= 0 ? "credit" : "debit",
        amount: Math.abs(wallet.record.amount),
        balanceBefore,
        balanceAfter,
        reason: wallet.record.description,
        createdAt: wallet.record.createdAt,
    },
};
```

- [ ] Add or extend a real PostgreSQL concurrency test so two simultaneous calls with the same idempotency key produce one ledger row and one balance change. Run it with `--no-file-parallelism`.
- [ ] Rerun the service, wallet, and concurrency tests plus typecheck.

---

### Task 4: Expose the admin member list and points-adjustment APIs with audit coverage

**Files:**
- Create: `web/src/app/api/admin/schools/[id]/members/route.ts`
- Create: `web/src/app/api/admin/schools/[id]/members/route.test.ts`
- Create: `web/src/app/api/admin/schools/[id]/members/[membershipId]/points-adjustments/route.ts`
- Create: `web/src/app/api/admin/schools/[id]/members/[membershipId]/points-adjustments/route.test.ts`
- Modify: `web/src/services/api/admin-education.ts`
- Create: `web/src/services/api/admin-education.test.ts`

- [ ] Add failing Route tests for 401 unauthenticated, 403 non-admin/inactive admin, valid query parsing, invalid role/status, service 404/409 mapping, `{ code, data, msg }`, successful adjustment audit, and redacted failure audit.
- [ ] Assert the adjustment Route passes the Session user ID and both path IDs to the service. Assert it never accepts a target `userId` from the request body.
- [ ] Assert successful audit metadata contains school ID, membership ID, target user/public account ID, operation, amount, before/after balance, reason, point-record ID, and idempotency key. Failure metadata may contain request identity and HTTP status but must not serialize an exception message or credentials.
- [ ] Run the Route tests and confirm they fail before the files are implemented.

```powershell
Set-Location web
pnpm exec vitest run src/app/api/admin/schools/[id]/members/route.test.ts src/app/api/admin/schools/[id]/members/[membershipId]/points-adjustments/route.test.ts --no-file-parallelism
```

- [ ] Implement `GET /api/admin/schools/{id}/members` with `page`, `pageSize`, `keyword`, `role`, and `status`. Use `positiveInteger`, reject invalid enum values with 400, check `isActivePlatformAdmin`, call `listSchoolMembersByAdmin`, and return `schoolApiOk`.
- [ ] Implement `POST /api/admin/schools/{id}/members/{membershipId}/points-adjustments`. Parse the JSON body using `readJsonBodyResult`, validate object shape, call `adjustSchoolMemberPointsByAdmin`, and write `admin.school-member.points-adjust` audit records.
- [ ] Extend `adminEducationApi` with typed methods:

```ts
listSchoolMembers(schoolId: string, input: AdminSchoolMemberQuery = {})
adjustSchoolMemberPoints(schoolId: string, membershipId: string, input: AdminSchoolMemberPointsAdjustmentInput)
```

- [ ] Add API-client tests that mock `fetch`, verify encoded school/membership IDs, serialized search/filter/page parameters, `cache: "no-store"`, the POST JSON body, and Chinese envelope errors.
- [ ] Rerun the focused Route/client tests and typecheck.

---

### Task 5: Add the responsive member Drawer and adjustment Modal to school management

**Files:**
- Create: `web/src/app/admin/schools/components/admin-school-members-drawer.tsx`
- Create: `web/src/app/admin/schools/components/admin-school-members-drawer.test.tsx`
- Modify: `web/src/app/admin/schools/components/admin-schools-section.tsx`
- Modify: `web/src/app/admin/schools/components/admin-schools-section.test.tsx`
- Modify: `web/src/components/admin/admin-dashboard.tsx`

- [ ] Add failing component/source-contract tests that require `AdminSchoolsSection` to receive `currentUser`, show “成员” for every platform admin, hide “新建学校/详情/编辑” without `education.manage`, call the typed API rather than `fetch`, use public account ID, and use responsive Drawer width without `size="large"`.
- [ ] Add behavioral assertions for form validation: amount is required, positive, and at most two decimals; reason is required; debit preview below zero blocks submission; successful response updates the current row; failed response preserves the open Modal and entered values.
- [ ] Run the focused frontend tests and confirm the new assertions fail.

```powershell
Set-Location web
pnpm exec vitest run src/app/admin/schools/components/admin-schools-section.test.tsx src/app/admin/schools/components/admin-school-members-drawer.test.tsx --no-file-parallelism
```

- [ ] Pass `currentUser` from `AdminDashboard` into `AdminSchoolsSection`. Compute `canManageEducation = hasAdminPermission(currentUser, "education.manage")` once inside the school section.
- [ ] Add a “成员” button with a `Users` icon to both the desktop operation column and mobile school card. Keep it visible for every active platform admin. Render create/detail/edit only when `canManageEducation` is true.
- [ ] Implement `AdminSchoolMembersDrawer` with server-side keyword/role/status/page state, request-sequence protection, explicit loading/error/empty states, and a refresh button. Use a desktop table and compact mobile rows; do not fetch the whole school or all users.
- [ ] Display member name, public account ID, username, school role, membership status, account status, permanent points, daily points, total points, and “调整积分”. When the account is disabled, show “停用账号当前不能生成”.
- [ ] Implement the adjustment Modal with Ant Design `Segmented`, `InputNumber`, and required reason `Input.TextArea`. Generate one stable `crypto.randomUUID()` idempotency key when the Modal opens; reuse it across retries and replace it only after success or when opening a different adjustment.
- [ ] Preview only permanent balance. On success replace the matching member row with `result.member`, close/reset the Modal, and show a success message. On error leave the values and idempotency key intact.
- [ ] Use a Drawer width equivalent to `Math.min(760, window.innerWidth)` and a Modal width bounded by the viewport. Keep Ant Design controls inside normal `div` layout wrappers so their root display styles cannot break the grid.
- [ ] Rerun the focused tests, typecheck, and lint for the changed files.

---

### Task 6: Add end-to-end permission, search, ledger, and responsive browser coverage

**Files:**
- Create: `web/e2e/admin-school-member-points.spec.ts`
- Modify only if shared setup is genuinely needed: `web/e2e/support.ts`

- [ ] Add an E2E scenario that creates two schools and members through real APIs, gives the target member known permanent/daily balances, opens `/admin?section=schools`, searches for the school, opens “成员”, searches by public account ID, and confirms username/name/email searches return the same member.
- [ ] Through normal semantic clicks, credit `12.5`, verify current/projected/saved permanent balance and unchanged daily balance, then debit `2.25` and verify the resulting balance.
- [ ] Replay the same adjustment request through the API and assert only one `admin-adjust` record/balance change; send a different amount with the same idempotency key and assert 409.
- [ ] Use school A's URL with school B's membership ID and assert 404. Verify a school-manager Session and ordinary-user Session receive 403 from both new admin endpoints.
- [ ] Disable the target account and verify the platform administrator can still adjust it, the UI displays “停用账号当前不能生成”, and the account remains disabled.
- [ ] Add a limited-duty active administrator check: the school section/member action is accessible, while “新建学校”, “详情”, and “编辑” are absent and POST/PATCH school operations remain 403.
- [ ] Run the spec on the configured desktop project and 390px/430px mobile projects. For each viewport and both light/dark themes, call the existing responsive helpers to verify Drawer/Modal controls remain inside the viewport and the page has no horizontal overflow.

```powershell
Set-Location web
pnpm exec playwright test e2e/admin-school-member-points.spec.ts
```

- [ ] Capture the browser evidence needed for handoff: school row/member entry, populated member Drawer, credit Modal, debit Modal, disabled-account warning, and post-adjustment balance.

---

### Task 7: Refresh development documentation and run the complete quality gate

**Files:**
- Generated/modify as required: `VOZEB-PRO-接口索引.md`
- Generated/modify as required: `VOZEB-PRO-开发地图.md`
- Verify only: `docs/backend-database.md`
- Verify: all files changed by Tasks 1-6

- [ ] From the repository root, refresh and validate the development maps because this feature adds Route Handlers, a server service, and a page-private component.

```powershell
Set-Location C:\CODE\blue-oem
pwsh -NoProfile -File .\过程文件\更新开发地图.ps1
pwsh -NoProfile -File .\过程文件\验证开发文档.ps1
```

- [ ] Inspect `git diff` and `git status`. Ensure only this feature's files plus generated interface/development-map changes are staged; exclude `output/`, `.env*`, credentials, test-debug files, and unrelated user changes.
- [ ] Run all focused tests together, with file parallelism disabled for shared database safety.

```powershell
Set-Location web
pnpm exec vitest run src/lib/server/points-wallet-service.test.ts src/lib/server/points-wallet-idempotency.postgres.test.ts src/lib/server/database/auth-entity-concurrency.postgres.test.ts src/lib/server/admin-school-member-points-service.test.ts src/app/api/admin/schools/route.test.ts src/app/api/admin/schools/[id]/members/route.test.ts src/app/api/admin/schools/[id]/members/[membershipId]/points-adjustments/route.test.ts src/services/api/admin-education.test.ts src/components/admin/admin-sections.test.ts src/app/admin/schools/components/admin-schools-section.test.tsx src/app/admin/schools/components/admin-school-members-drawer.test.tsx --no-file-parallelism
pnpm run typecheck
pnpm run lint
```

- [ ] Run the repository Mandatory Testing gate and the targeted browser regression. Do not claim completion if a required matrix is skipped; report the exact unavailable dependency or environment instead.

```powershell
Set-Location web
pnpm run check:release
pnpm exec playwright test e2e/admin-school-member-points.spec.ts
```

- [ ] Strictly decode each changed text file as UTF-8 and fail on `U+FFFD`, `U+951F/U+65A4/U+62F7`, or other known mojibake sequences. Treat console rendering differences separately from file-byte corruption.
- [ ] Review the final diff against every acceptance item in the approved design: all active admins, school-scoped search, public IDs, credit/debit decimals, mandatory reason, no negative balance, exact idempotency, disabled-state behavior, daily-points isolation, audit history, and no impact on school compute/project billing.
- [ ] Commit only the implementation-plan-approved files. The delivery report must include focused-test results, typecheck/lint, `check:release`, Playwright viewports/themes, PostgreSQL coverage, strict UTF-8 result, and both development-document validation results.
