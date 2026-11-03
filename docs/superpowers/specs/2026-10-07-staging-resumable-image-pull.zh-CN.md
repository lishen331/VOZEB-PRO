# Staging 部署：可续传的镜像拉取

日期：2026-10-07

## 背景

`Staging image` workflow 最近两次（run 37473894907、37482431968）都失败在服务器端 `docker pull`：

- 构建和推送 GHCR 都成功，失败只在远端拉取。
- 服务器 `docker info`：Docker 24.0.9，overlay2，未启用 containerd image store。
- dockerd 日志每次被 `timeout` 杀掉时记录 `Not continuing with pull after error: context canceled`，随后 `Layer sha256:… cleaned up`。即：一次 pull 未整体成功，本次已下完的新层也会被回收，下一次重试从头开始。workflow 注释里 "completed layers are cached" 不成立。
- 网络大体正常（ghcr.io 0.5s 可达），但每次总有 1～2 个层（约 115MB 新增层中的某个）卡住超过 120s，于是 8 次重试全部失败。

## 方案

不再依赖 `docker pull`，改为服务器上自己按 manifest 逐个下载 blob，再 `docker load`。

新增 `scripts/staging-pull-image.py`（仅用 Python 3 标准库，服务器为 3.11，无 jq）：

1. 向 `ghcr.io` 匿名取 token，读取 tag 的 index，选 `linux/amd64` manifest。
2. 每个 blob（config + layers）下载到持久缓存 `~/.cache/vozeb-image-blobs/sha256/<hex>`：
   - 已存在且 sha256 正确 → 跳过；
   - 否则写入 `.partial`，用 `Range` 续传；读超时 20s 视为卡顿，断开重试，已下部分保留；
   - 重试在 `ghcr.io` 与代理 `ghcr.nju.edu.cn` 之间交替（blob 按 digest 寻址，校验 sha256，换源安全）；
   - 4 个 blob 并发下载，总时限 20 分钟。
3. 全部就绪后，流式生成 `docker save` 格式 tar（`manifest.json` + config + 压缩层），管道给 `docker load`，打上 `ghcr.io/lishen331/vozeb-pro:sha-<commit>`。`docker load` 会按 config 的 `diff_ids` 再校验一次层内容。
4. 清理缓存中 14 天未被使用的 blob。

workflow 部署步骤改为：先 `ssh ... python3 - "$IMAGE" < scripts/staging-pull-image.py`，后面写 `.env`、`docker compose up --pull never`、就绪检查保持不变。

## 影响与回滚

- 只改 workflow 和新增脚本，不改服务器 Docker 配置。
- 首次需完整下载约 466MB 到缓存；之后每次只下新增层。
- 回滚：revert 本次提交即恢复原 `docker pull` 重试循环。

## 验证

1. 本地对 GHCR 跑脚本的下载部分（`--download-only`），确认 manifest 解析和续传逻辑。
2. 在服务器上对当前 HEAD 镜像（sha-160d8551…）跑完整脚本：只写缓存目录并 `docker load` 出镜像，不动任何容器。
3. 提交、push `develop`，观察 workflow 部署和就绪检查通过。
