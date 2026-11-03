# 渠道并发上限 Staging 实测报告

- 日期：2026-10-06
- 环境：https://reddetail.gammablue-x.com（staging）
- 账号：测试管理员账号（凭据不写入本文）
- 结论：**未能执行并发切换实测**。修改渠道并发上限会被绑定验证拦截，这本身是一个需要处理的问题。测试前后配置一致。

## 1. 测试目标

验证同一逻辑模型挂多个渠道时，按渠道设置的并发上限（`capabilityProfile.concurrencyLimit`）能否生效：

1. 两个渠道上限都设为 1，同时提交 3 个生图任务；
2. 预期前 2 个任务分别占用两个渠道，第 3 个排队或等待，不会超发；
3. 任务结束后再提交 1 个，验证名额已释放；
4. 恢复原配置。

## 2. 环境探查结果

| 项目 | 结果 |
| --- | --- |
| `/api/health/ready` | 200 |
| 管理员登录 | 200 |
| 配置版本 | 测试前 144 |
| 逻辑模型数量 | 699 |
| 用户级生图并发 `generationConcurrency.image` | 10（不会干扰本测试） |
| 默认生图模型 | gpt-image-2 |

挂了 2 个已启用渠道的逻辑模型：

| 能力 | 逻辑模型 | 渠道 1（优先级 3） | 渠道 2（优先级 8） | 现有并发上限 |
| --- | --- | --- | --- | --- |
| image | gpt-image-2 | 模汇x中漫 API 图片 视频 渠道 | 兔子 API 渠道 | 未设置 |
| image | gpt-image-2.5-flare | 同上 | 同上 | 未设置 |
| image | gpt-image-2.5-sunburst | 同上 | 同上 | 未设置 |
| video | kling-video-o1 | 同上 | 同上 | 未设置 |
| video | MiniMax-H3 | 同上 | 同上 | 未设置 |

测试选用 `gpt-image-2`。

## 3. 实际执行过程

| 步骤 | 结果 |
| --- | --- |
| 备份 `logicalModels`（本地） | 成功 |
| PATCH `/api/admin/settings`，把 gpt-image-2 两个绑定的 `concurrencyLimit` 设为 1 | **400** |
| 提交并发任务 | 未执行（前置步骤失败） |
| 恢复：只把这两个绑定的 `capabilityProfile` 还原为备份值 | 200，版本变为 145 |
| 恢复校验：699 个逻辑模型与备份逐项规范化比对 | 完全一致 |

400 的报错原文：

> 模型 gpt-image-2 的渠道绑定 模汇x中漫 API 图片 视频 渠道 尚未通过当前配置的生成验证；请先关闭并保存配置，再测试启用。

版本号从 144 变为 145 是恢复保存产生的，配置内容没有变化。

## 4. 问题分析

拦截来自 [binding-verification-policy.ts](../../web/src/lib/server/binding-verification-policy.ts)：

- `bindingVerificationFingerprint()` 把 `resolveLogicalModelCapabilityProfile(...)` 的完整结果算进了指纹，里面包含 `concurrencyLimit`；
- `assertBindingVerificationChanges()` 发现已启用绑定的指纹变了，就要求重新通过生成验证。

所以并发上限一改，指纹就跟着变，已经验证过的绑定会被当成"配置已变、需重新验证"。

影响：

1. 管理员想调某个渠道的并发上限，必须先关闭绑定、保存、跑一次真实生成验证（会消耗上游额度），再重新启用。期间这个渠道不接流量。
2. 并发上限是调度参数，不影响请求怎么发给上游。验证要证明的是"这套配置能生成成功"，并发数和这个无关。

## 5. 建议

计算指纹时排除纯调度字段（至少排除 `concurrencyLimit`），只保留会影响上游请求的字段。同时补一条单测：只改 `concurrencyLimit` 时指纹不变，改 `upstreamModel`、`baseUrl`、凭据时指纹会变。

修复并部署到 staging 后，按第 1 节的步骤重新实测。

## 6. 后续实测待办

- [ ] 修复指纹范围并部署 staging
- [ ] 两个渠道上限设为 1，并发提交 3 个任务，通过 `/api/admin/generation-operations` 记录每个任务实际命中的渠道
- [ ] 任务结束后再提交 1 个，确认名额已释放
- [ ] 恢复配置并逐项比对
