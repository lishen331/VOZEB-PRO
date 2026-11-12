# 热更新方案：兔子真人素材（2026-10-23）

写给：执行热更新的会话。

## 要解决的问题

课上真人参考图视频被拒（"may contain real person"）。兔子要求真人图先进素材库审核，再用 `asset://` 提交。我们现在的代码：

1. 上传素材不带 `model`，兔子按 `model` 选素材渠道，上传失败后退回直接传图，真人图被拒
2. 审核第一次总是 `failed`（"素材适配器已变更或不可用"），代码直接放弃

## 实测依据（生产兔子令牌，11:50 / 11:56）

| 图 | 上传带 model | 第一次审核 | 重提审核 | 视频 |
|---|---|---|---|---|
| 640×480 非人像 | 200 | failed | 6 秒 active | 4 秒 480P，约 3 分钟 completed |
| 2160×3840 真人自拍 | 200 | failed | 6 秒 active | 4 秒 480P，约 4 分钟 completed |

## 改动（只改编译产物，4 处，每处必须恰好匹配 1 次）

文件：两个容器里的 `/app/web/.next/server/chunks/src_18gh31v._.js`（v0.8.18，44,834 字节）

1. 调用处：`cacheScope` 加上模型，并把 `model` 传进去（不同模型的素材不混用缓存）
2. 上传 FormData：追加 `model` 和 `name`
3. 审核轮询：加重提计数 `__vzR`
4. 审核 `failed` 时：在超时前重新 `POST .../compliance`，最多 3 次；仍失败才报错

源码对应本地分支 `hotfix/tuzi-asset-model`（commit `88b696b9`，未推送）。昨天的 `prod-hot-patch2.sh` 是同样的改动，但锚点基于旧产物（`src_1nmpcnr._.js`、变量 `f`），v0.8.18 不能用。

## 执行

脚本都在 `D:\tmp\vz-mon\`：

| 步骤 | 命令 |
|---|---|
| 0. 确认没人在发版 | `bash ssh.sh prod-image-info.sh`；`gh run list -R lishen331/VOZEB-PRO -L 5` |
| 1. 试跑（已跑过，4 处都改上，语法通过，生产文件未动） | `bash ssh.sh prod-hot-patch3-dryrun.sh` |
| 2. 打补丁 | `bash ssh.sh prod-hot-patch3.sh` |
| 撤回 | `bash ssh.sh prod-hot-revert3.sh` |

`prod-hot-patch3.sh` 做的事：

- 先查两个容器镜像都是 `sha-232737aa`，不是就退出
- 两个容器各备份到 `src_18gh31v._.js.bak-tz-<时间>`（撤回脚本只认 `bak-tz-`，不会碰别的会话的 `bak-hp2-`/`bak-hp3-` 备份）
- 打补丁，`node --check` 语法检查
- 重启 worker 和 app，等 app healthy
- 打印两个容器的补丁计数（应为 1）和启动时间

注意：

- 重启 app 和 worker 期间（约 30 秒）正在跑的任务可能受影响，最好挑没有大量任务提交的时候
- **会和栈溢出热更新叠加**。另一个会话 10:05、11:48、11:54 打过栈溢出补丁（`__vzB64`），改的是 `src_0_ksa-j`、`src_1ybwkh2`、`src_1go7_3j`、`src_0akmqvf`、`src_1y_w2ae` 五个 chunk，容器 11:54 重启过。兔子补丁的 `src_18gh31v._.js` 里没有 `__vzB64`（已查，0 处），两者不重叠
- 重启只是重新加载文件，栈溢出补丁改在磁盘上，重启后还在。打完可以 `grep -rl __vzB64 /app/web/.next/server/chunks` 确认
- 下次发版会冲掉，正式修复要进源码随版本发

## 上线后验收

1. 等课上下一条兔子真人参考图视频，或用 `prod-tz-e2e.sh` 的流程走我们的接口提交一条
2. 看任务诊断事件 / 日志里没有 `asset ingest failed, falling back to direct reference`
3. 看视频请求里参考图是 `asset://`，任务 completed
4. 盯半小时：兔子视频失败数不上升

## 范围外

- 模汇渠道的 doubao-seedance-2-0 不走兔子素材库，真人图照样会被拒。要么让真人参考图优先路由到兔子，要么提醒学生，需要另定
