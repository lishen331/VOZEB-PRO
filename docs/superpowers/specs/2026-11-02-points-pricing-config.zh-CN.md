# 生产积分定价配置（100 积分 = 1 元）

日期：2026-11-02
状态：待批准后执行
范围：只写生产库 `vozeb_pro_app_settings` 的两列 JSON 配置，不改代码、不改表结构、不动用户余额。

## 背景

积分比例已从 10 积分 = 1 元改为 100 积分 = 1 元（余额 ×10 迁移见 `2026-11-02-points-ratio-x10-design.md`，已完成）。但扣费配置仍是空对象：`model_point_costs = {}`、`generation_point_multipliers = {}`。空配置下 `resolveConfiguredModelPointCost` 对所有模型返回默认 1，`multiplierValue` 对缺失的倍率键也返回 1，所以现在每次生成只扣 1 积分。

价目表已定稿在 `docs/reports/video-points-pricing.zh-CN.md`，由 `D:\tmp\vz-mon\pricing\gen_pricing.py` 生成。本规格把价目表里的整数填进生产配置。

## 扣费公式（代码现状，不改）

`web/src/app/api/ai/system/[channelId]/[...path]/route.ts`：

- 视频：`amount = videoQuality 倍率 × videoSeconds 倍率`（`videoParameterMultiplier`）
- 图片：`amount = 张数 × imageQuality 倍率 × imageResolution 倍率`（`imageQualityMultiplier`）

`web/src/lib/auth/store-actions.ts` `consumeUserPoints`：

- 实扣积分 = `amount × 模型积分`（`resolveModelPointCost`）

所以一条视频扣 `模型积分 × 分辨率倍率 × 时长倍率`，一张图扣 `模型积分 × 清晰度倍率 × 画质倍率`。三个因子全是整数时结果也是整数。

倍率键的归一化（同文件）：

- 视频分辨率：`480p/720p/1080p` 去 `p` 得 `480/720/1080`；`low→480`，`auto/medium/high→720`；缺省 720。
- 视频时长：`floor(秒数)` 的字符串，非数字回落 `5`，`-1`（智能时长）原样保留。
- 图片清晰度：从 `size` 像素、`resolution`、`imageSize` 解析出 `1k/2k/4k`，都没有记 `auto`。
- 图片画质：`auto/low/medium/high`，`hd→high`、`standard→medium`。

## 要写入的值

全部是整数，与价目表一致。利润率 10.6%～24.9%，每条线路不低于 10%。

### model_point_costs（14 个键）

| 逻辑模型 | 渠道 | 模型积分 |
|---|---|---|
| doubao-seedance-2-0 | 模汇 | 34 |
| doubao-seedance-2-0-260128 | 兔子 | 55 |
| cdance2.0-0807 | 天翼云 | 44 |
| official/seedance-2 | ModelBay | 91 |
| doubao-seedance-2-5-260628 | 兔子 | 84 |
| official/seedance-2-5 | ModelBay | 137 |
| cdance2.0-fast-0807 | 天翼云 | 36 |
| cdance2.0-mini-0807 | 天翼云 | 22 |
| gpt-image-2-all | 模汇 | 17 |
| gpt-image-2-c | 模汇 | 27 |
| gpt-image-2 | 兔子 | 24 |
| gpt-image-2.5-sunburst | 兔子 | 24 |
| gpt-image-2-text-to-image | ModelBay | 81 |
| gpt-image-2-image-to-image | ModelBay | 81 |

视频模型积分 = 480p 每秒积分：各分辨率取 `每秒成本 × 100 × 1.1 ÷ 分辨率倍率` 的最大值后向上取整。图片模型积分 = `最贵一档每张成本 × 100 × 1.1` 向上取整。

### generation_point_multipliers

- videoQuality：`{"480": 1, "720": 2, "1080": 5}`
- videoSeconds：`{"-1": 15, "4": 4, "5": 5, ... "15": 15}`（智能时长 -1 按 15 秒收）
- imageResolution：`{"auto": 1, "1k": 1, "2k": 1, "4k": 1}`
- imageQuality：`{"auto": 1, "low": 1, "medium": 1, "high": 1}`

## 明确不改的

- `__default__` 不填。没在上表里的模型（kling、veo、sora、nano-banana、dall-e 等）继续走默认 1 积分/次。这些模型目前没有启用的渠道绑定，填了也扣不到；等有价格再单独定。
- `gpt-image-2-5-flare`、`gpt-image-2-5-sunburst`（ModelBay，注意是连字符不是点号）没有取到上游价格，不填，保持默认 1。
- 用户余额、point_records、套餐积分、推荐奖励都不动。推荐计划是关闭的且奖励为 0；自定义音色创建扣费是代码里的常量（见下方遗留项），与这两列无关。

## 校验（事务内，任一失败整笔回滚）

1. 写入前 `model_point_costs` 与 `generation_point_multipliers` 必须都是 `{}`，否则说明有人已在后台填过，中止。
2. 写入后 `model_point_costs` 恰好 14 个键，每个值等于上表。
3. `videoQuality` 恰好 `480=1, 720=2, 1080=5`；`videoSeconds` 恰好 13 个键（-1 与 4～15）且值等于键（-1 为 15）；`imageQuality`、`imageResolution` 全部为 1。
4. 所有值都是整数。
5. 抽查三条实扣：兔子 2.0 1080p 5 秒 = 55×5×5 = 1375；模汇 2.0 720p 10 秒 = 34×2×10 = 680；天翼云 mini 480p 4 秒 = 22×1×4 = 88。
6. `settings_revision` 原值加 1（后台保存带乐观锁，不加 1 的话正在编辑的管理员会用旧版本覆盖这次写入）。

同时在 `vozeb_pro_audit_logs` 记一条 `points-pricing-config`，脚本重跑时看到它直接退出。

## 生效与回退

应用每次扣费都读 `getAuthSettings()`，这两列没有进程内缓存，写入后下一次生成即按新价扣，不需要重启。

回退：把两列改回 `{}`，`settings_revision` 再加 1。脚本执行前先 `pg_dump` 备份 `vozeb_pro_app_settings`。

## 已知遗留（本次不做）

> 2026-11-02 结论：第 2、3 条只在全新空库或配置被清空时才生效，决定不处理；第 1 条由另一个会话负责。

1. `web/src/app/api/custom-voices/route.ts` 的 `pointsPerYuan = 1` 仍按 1 积分 = 1 元计自定义音色创建费。生产没有 custom_voices 表、也没有相关扣费记录，暂不影响。改它属于代码变更，单独走发布。
2. `web/src/lib/server/database/schema.ts` 的种子数据仍是旧比例：创作者月卡 500 积分 / 9.9 元、专业月卡 2,000 积分 / 29.9 元。生产库这两行已是 ×10 后的 5,000 和 20,000，但**重建数据库会回到旧值**。另外按新比例 100 积分 = 1 元折算，这两张月卡实际给出约 505 积分/元和 669 积分/元，是生成扣费比例的 5 倍以上，属于补贴还是漏改需要产品确认。
3. `web/src/lib/auth/store-foundation.ts` 的 `DEFAULT_GENERATION_POINT_MULTIPLIERS` 里 `videoQuality` 全是 1、`videoSeconds` 只有 `-1/5/10` 三个键。数据库配置正常时用不到它；一旦 `generation_point_multipliers` 被清空，未列出的秒数会按倍率 1 计费，也就是只收 1 秒的钱。建议在代码里补齐 4～15 秒并改成 1/2/5，随下一次发布带上。
