# 兔子素材上传补 model 字段（恢复真人参考图视频）

日期：2026-10-22
范围：只改兔子 Seedance 的素材上传。其它渠道、生图都不动。

## 1. 问题

兔子 Seedance（`doubao-seedance-2-0-260128`、`doubao-seedance-2-5-260628`）带真人参考图的视频今天全部失败，报 `may contain real person`。

## 2. 原因（已在生产验证）

我们上传素材时只传了 `file`，没有传 `model`。兔子那边现在按 `model` 选素材渠道，不传就找不到：

| 请求 | 结果 |
|---|---|
| `POST /v1/seedance/assets`，只有 `file` | `{"message":"当前 Token 没有可用的素材渠道","success":false}` |
| 同一个令牌，加 `model=doubao-seedance-2-0-260128`、`name` | `success:true`，返回 `id` 和 `asset://...` |
| 再调 `POST /v1/seedance/assets/{id}/compliance` | `compliance_started:true`，有 `review_task_id`，几秒后出审核结果 |

上传失败后，代码按设计退回直接传图。非真人图能出片，真人图被兔子拒绝，所以用户看到的是"可能含真人"。

兔子给的示例脚本（`调用本地（桌面）素材审核.txt`）也是这样传的：`file` + `model` + `name`。10-20 出现过"素材适配器配置已变更，请重新上传素材"，应该是那时兔子改了接口。

测试用的是 64×64 灰色方块，审核结果是"未通过"，这是图片本身的问题，不影响结论：上传和审核这两步都已经走通了。

## 3. 改动

1. `tuzi-asset-service.ts`：`TuziAssetServiceOptions` 加 `model?: string`。上传时多带两个字段，`model`（有值才带）和 `name`（文件名）
2. `video-generation-route.ts` 的 `prepareTuziReferences`：把当前任务的上游模型名（`channel.model`，如 `doubao-seedance-2-0-260128`）传进去
3. 缓存的 key 加上 model，避免不同模型共用同一份素材引用
4. 审核仍按现在的做法显式调一次 `compliance`。兔子示例说"上传后会自动审核"，但我们在 `api.tu-zi.com` 上实测 100 秒都没开始，手动调用后立即开始了

## 4. 不改的

- 上传失败退回直传的逻辑保持不变
- 域名继续用 `api.tu-zi.com`。示例用的是 `apius.tu-zi.com`，实测 `api.tu-zi.com` 也能用
- ModelBay、模汇、天翼云不动

## 5. 测试

- 单测：上传的表单里带了 `model` 和 `name`；不同模型的缓存分开
- tsc、vitest、prettier
- 测试环境：画布用兔子 2.0 + 一张真人参考图出一条视频。日志里不再出现 `当前 Token 没有可用的素材渠道`，视频出片
- 生产：你在测试环境确认后再发

## 6. 发布

生产现在跑的是 v0.8.14。这个修复要基于 v0.8.14 做，单独发一个版本（只带这一处改动），不带 v0.8.15/16 的内容，避免和栈溢出问题混在一起。
