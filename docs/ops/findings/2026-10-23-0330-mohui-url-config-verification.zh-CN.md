# 模汇图片 URL 返回（B 项）生产验收

- 时间：2026-10-23 03:10 改配置，03:20～03:31 验收
- 版本：v0.8.18（`sha-232737aa`）
- 配置：模汇X中漫 `_-eQ3SntRYtuDZz9mJ_OK` 的 `modelConfigs.gpt-image-2-all/gpt-image-2-c.imageResponseFormat = "url"`，settings_revision 96 → 97。用户授权直接改库；备份在 `/root/mohui-url-config-backup-20261023-031053.txt`

## 结果

### gpt-image-2-c，图生图（1 张参考图）——成功，但上游没给 URL

task `d9bb8093`，上游 request id `fb038073-1d00-4e4f-abc9-2785f14e086d`

| 阶段 | 结果 |
|---|---|
| 发给上游的参数 | `response_format: "url"`，`output_format: "png"`，size 1824x1024 |
| 上游响应 | 200，JSON 1,688,037 字节 |
| 结果读取 | 图片 1,265,701 字节，1672×941 PNG，校验通过 |
| 保存 | `result_persist_complete` |
| 计费 | 扣 1 积分，未退款；只尝试 1 次 |

- **代码这边生效了**：请求里确实带的是 `url`
- **上游没有照做**：1,265,701 × 4/3 ≈ 1,687,600，和响应体大小差不多（多出来的约 400 字节是 JSON 外壳）。读取结果时也没有远程地址（`urlHost` 为空）。可以判断模汇的编辑接口**还是返回了 base64**，没有返回 URL
- 所以对模汇图生图来说，配了 `url` 不会让响应变小。B 项里"不自动换格式重新生图"的保护照样有效

### gpt-image-2-all，文生图——失败，原因在上游

task `254c6037`，两次尝试都没有扣费

| 尝试 | 渠道 | 参数 | 结果 |
|---|---|---|---|
| 1 | 模汇 | `response_format: "url"` | 503 `system disk overloaded (current: 99.6%, threshold: 95%)` |
| 2（溢出） | ModelBay `gpt-image-2-5-flare` | `b64_json` | 403 `用户额度不足, 剩余额度: ＄-0.001576` |

- 模汇自己的服务器磁盘满了（99.6%），上游出问题，没走到返回格式那一步，验证不到
- 溢出切到 ModelBay 后，没有再出现之前的签名 403，被拒的原因是 ModelBay 余额已经是负数
- **ModelBay 余额为负**，所有走 ModelBay 的图片和视频都会失败，需要尽快充值

## 结论

1. B 项代码在生产生效：模型级配置会被读到，请求里带的是 `url`
2. 模汇图生图实际仍然返回 base64，配置 URL 对模汇编辑接口没有效果
3. 文生图要等模汇的磁盘问题恢复后再验证
4. ModelBay 余额为负，需要充值

## 回滚

删掉这两个模型的 `imageResponseFormat` 字段，就恢复成原来的默认 b64。代码不需要回滚。
