# 模汇X中漫渠道余额不足，Seedance 2.0 视频直接失败

- 发现：2026-10-22 11:50 巡检
- 级别：告警，需要运营处理（充值）。不是代码问题
- 渠道：模汇X中漫 API 渠道 `_-eQ3SntRYtuDZz9mJ_OK`

## 现象

`doubao-seedance-2-0` 视频任务失败，报错：

```
token quota is not enough, token remain quota: ¥5.096408, need quota: ¥5.970294
```

- 近 24h 4 次，最后一次 10:53
- 剩余约 ¥5.09，一条 Seedance 2.0 视频需要约 ¥5.97，所以这个渠道已经出不了 Seedance 2.0 视频
- 同渠道还承接 gpt-image-2-c / gpt-image-2-all 图片。图片单价低，暂时还能跑，但余额会继续下降

## 影响

`doubao-seedance-2-0` 现在是默认视频模型（10-21 改的）。这个渠道余额耗尽后，默认视频和这个渠道的图片都会失败。

## 处理

1. 尽快给模汇X中漫渠道充值
2. 充值前，Seedance 2.0 可以手动选其它 100% 成功的渠道模型（天翼云 Seedance 2.0、official/seedance-2）

## 验证

```sql
select count(*) from vozeb_pro_generation_tasks
where created_at > '<充值时间>' and coalesce(payload->>'error','') ~* 'quota is not enough';
```

应为 0。
