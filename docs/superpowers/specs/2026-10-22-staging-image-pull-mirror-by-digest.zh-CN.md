# Staging 拉镜像加速：按 digest 走 NJU 代理，失败回落 GHCR

## 背景

- staging 部署在 `cn-guangzhou`，现在 `staging-image.yml` 直接从 `ghcr.io` 拉 1.24GB 镜像，每次最长 3×20 分钟。
- 2026-09-07 曾接入 `ghcr.nju.edu.cn`，10-06 撤掉。撤掉的原因是：代理对刚推送的 `sha-<commit>` **tag** 会滞后，返回 `manifest unknown`。
- 撤掉后 `env.STAGING_IMAGE_PROXY` 还留在 workflow 第 18 行，但已经没有任何步骤使用。

## 已核实（2026-10-22，本机探测）

- `ghcr.nju.edu.cn` 可用：`develop` tag 返回 200，digest 与 `ghcr.io` 一致（`sha256:818a4e03…`）。
- 按 **digest** 请求 manifest（`/manifests/sha256:818a4e03…`）同样返回 200。
- 不能用 Docker daemon 的 `registry-mirrors` 解决：该配置只作用于 Docker Hub，对 `ghcr.io` 无效。

未核实：代理对一个**全新** digest 首次请求时，是否会立即回源拉取（预期会，因为 digest 不可变、没有 tag 缓存过期的问题），需要第一次 develop 推送时观察日志确认。

## 方案

核心变化：不再用 tag 走代理，改用构建步骤输出的 digest。digest 是内容地址，代理不存在“tag 指向旧内容/还没刷新”的问题，Docker 拉取时也会自动校验内容。

1. `Build and push staging image` 加 `id: build`，取 `steps.build.outputs.digest`。
2. 部署脚本把两个镜像引用传给服务器：
   - `PROXY_IMAGE=ghcr.nju.edu.cn/lishen331/vozeb-pro@<digest>`
   - `IMAGE=ghcr.io/lishen331/vozeb-pro:sha-<commit>`（保持不变，compose 和 `.env` 仍写这个名字）
3. 服务器上先尝试代理：`timeout -k 30 900 docker pull "$PROXY_IMAGE"`，成功后 `docker tag "$PROXY_IMAGE" "$IMAGE"`。
4. 代理失败（超时、404、网络错误）时，进入现有的直连 GHCR 逻辑（3 次 × 20 分钟，不改）。层按内容寻址，代理阶段已下载完成的层会被复用。
5. 日志打印实际拉取来源（proxy / ghcr），便于观察加速效果。
6. digest 为空时（理论上不会发生）直接跳过代理，走 GHCR。

## 边界

- 只改 `.github/workflows/staging-image.yml`，不改应用代码、compose、数据库、端口。
- 不在服务器上改 Docker daemon 配置，不新增凭据或付费资源（ACR 个人版对企业认证账号不可用，见 09-07 文档）。
- 生产不受影响；生产部署是否同样接入，另行决定。

## 验收

1. develop 推送后，日志显示 `pulled from proxy`，拉取耗时明显低于直连。
2. 人为让代理失败（例如把代理域名改错跑一次 `workflow_dispatch`）时，自动回落 GHCR 并部署成功。
3. `docker inspect` 显示 `app` 与 `generation-worker` 使用同一个 `sha-<commit>` 镜像，`/api/health/ready` 通过。

## 回滚

还原这一个 commit 即可回到当前的纯直连行为。
