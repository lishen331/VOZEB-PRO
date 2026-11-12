# 练习池候选按逻辑模型启用状态过滤

## 现象

- 逻辑模型 `agnes-video-v2.0` 已停用，但 无限练习 → 练习池 → 视频 里仍显示它（3/3）。
- 逻辑模型 `agnes-image-*` 显示「启用」，但列表里标「当前无可用渠道」，画布出图 403。

## 原因

练习池有两套判断，规则不一致：

| 环节 | 位置 | 判断依据 |
| --- | --- | --- |
| 池子展示 | `web/src/app/api/admin/practice-model-pool/candidates/route.ts` | 渠道 `models` 列表 + 渠道练习开关 |
| 练习路由选模型 | `collectPracticePoolCandidates`（`web/src/lib/server/runninghub-workflow-runtime.ts:97`） | 同上 |
| 真正发请求 | `resolveBoundLogicalModel`（`web/src/lib/server/system-ai-proxy-policy.ts:94`） | 逻辑模型 `enabled` **且** 该渠道绑定 `enabled` |

前两处完全不看逻辑模型，所以：

1. 停用的逻辑模型照样出现在池里；
2. 练习画布从池里随机选中它后，到系统代理被 403 拒掉（「未绑定可用逻辑模型」），用户看到「网络异常」。

`agnes-image-*` 的情况是逻辑模型启用、但「同名渠道绑定」右侧开关关着，同样过不了代理。

## 改动

1. 新增 `channelModelBoundForPractice(logicalModels, channelId, upstreamModel)`：与代理同规则——存在启用的逻辑模型，且它对该渠道该上游模型的绑定启用。
2. 池子候选接口：不满足的模型不进池，计入 `excluded`，新增原因码 `logical`，文案「逻辑模型已停用或渠道绑定未开启」，按渠道汇总条数。
3. `collectPracticePoolCandidates`：同样过滤，保证展示与实际路由一致。

## 不改

- 系统代理规则、生产路由（`resolveLogicalModelCandidates` 已按逻辑模型过滤）。
- 逻辑模型和绑定的数据，不自动替管理员打开任何开关。

## 验证

- 单测：停用逻辑模型 / 绑定关闭 / 两者都开 三种情况的池子候选与路由候选。
- 测试服：停用 `agnes-video-v2.0` 后视频池变 2/2，诊断框出现该原因；打开 `agnes-image-*` 绑定后图片池出现并能出图。
