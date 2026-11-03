# 渠道启用拆分：正式生产 / 无限练习 各一个开关

- 日期：2026-11-03
- 状态：已实现（本地），未发布
- 关联：练习模型池、渠道管理、逻辑模型路由

## 1. 问题（核实过的现状）

1. 渠道只有一个布尔 `enabled`（`schema.ts:134`），同时管正式生产和无限练习 → 拨一边必然连带另一边。
2. `purpose` 是单选（`production` / `open-source-practice` / `shared`），生产侧过滤 `purpose !== "open-source-practice"`（`use-config-store.ts:269`）→ 选"无限练习"就把渠道从生产剔除。
3. 练习池候选写死 `enabled && purpose === "open-source-practice"`（`candidates/route.ts:45`），`shared` 渠道即使能跑练习也永远进不了池 → 池子显示 0 个模型。

## 2. 判定模型（最终）

两个独立开关：

| 字段 | 含义 | 未设置时回落 |
| --- | --- | --- |
| `enabled` | 正式生产启用 | 默认 true |
| `practiceEnabled` | 无限练习启用 | `enabled`（存量渠道行为不变） |

```
生产可用 = purpose ∈ {production, shared} && enabled
练习可用 = purpose ∈ {open-source-practice, shared} && practiceEnabled
练习池候选 = 练习可用 && channelConnectionReady
```

`purpose` 只保留"可见性"含义（纯练习渠道不进生产列表），不再决定开关能否生效。
RunningHub 渠道生产开关禁用（`advancedConfig.protocol === "runninghub"`）。

统一入口（`web/src/lib/model-routing-config.ts`）：

```ts
channelEnabledForSurface(channel, "production" | "open-source-practice")
channelUsableForSurface(channel, surface)  // 再加 channelConnectionReady
```

## 3. 改动清单

**数据层**
- `schema.ts`：新增列 `practice_enabled boolean`（可空）
- `store-types.ts`：`SystemModelChannel.practiceEnabled?: boolean`
- `repository-types.ts`、`repositories.ts`（读写 + `mapSystemModelChannel`）
- `store-repository.ts`（读写）、`postgres-auth-settings-service.ts`（写入）
- `store-normalizers.ts`：`normalizeSystemChannel` 保留布尔值

**判定替换（统一走 helper）**
- `model-routing-config.ts`：132/143/160 三处渠道查找
- `logical-model-router.ts`：绑定解析、无逻辑模型直连、图片溢出三处
- `runninghub-workflow-runtime.ts`：练习画布池候选、RunningHub 练习渠道
- `practice-module-service.ts`、`practice-session-service.ts`：工作流渠道筛选
- `candidates/route.ts`：练习池候选
- `session.ts`：用户端渠道列表（生产侧）
- `use-config-store.ts`：生产侧过滤（保持原语义）
- `admin-practice-section.tsx`、`admin-practice-script-agent.tsx`：练习渠道判定

**界面**
- `runninghub-channel-fields.tsx`：`ChannelPurposeControl` → `ChannelEnableControls`（两个开关 + 说明）
- `admin-channel-detail-drawer.tsx`：配置页换成两个开关；概览页显示"正式生产 / 无限练习"两行
- `admin-channel-onboarding-drawer.tsx`：同步更换
- `admin-channel-workspace.tsx`：列表"启用"列改为上下两个小开关（`ChannelEnableCell`），移动端卡片同步
- `admin-channel-workspace-model.ts`：`channelWorkspaceStatus` 任一开关打开即视为"已启用"

**校验**
- `admin-channel-config.ts`：RunningHub 由"用途必须为无限练习"改为"必须启用无限练习（`practiceEnabled !== false`）"

## 4. 验证结果

- `npx tsc --noEmit`：通过
- `npx vitest run src/lib src/stores src/components/admin src/app/api`：800 个文件、4775 条用例全部通过
- 新增/改写用例：`runninghub-channel-fields.test.tsx`（两开关渲染 + RunningHub 生产开关禁用）、`admin-channel-config.test.ts`（练习开关校验）

## 5. 尚未做

- **未落库迁移到线上**：`practice_enabled` 列需要跑一次 schema 初始化（`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 已在 `schema.ts`，随部署执行）
- **未在 staging/生产验证**：需要用一个渠道实测"只开练习 / 只开生产 / 两个都开"三种组合
- 存量渠道 `practice_enabled` 为空 → 回落 `enabled`，升级后行为与今天一致
