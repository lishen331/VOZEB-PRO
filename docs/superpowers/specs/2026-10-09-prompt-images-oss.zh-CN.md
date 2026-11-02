# 提示词示例图存到 OSS

> 2026-10-09。涉及 `web/src/lib/server/public-prompt-image.ts`、`web/src/app/api/public/prompt-images/route.ts`。

## 1. 现状

- `/api/public/prompt-images?path=images/xxx_caseN/output.jpg&width=640` 每次缓存未命中都去 `raw.githubusercontent.com/tigerowo/awesome-gpt-image-2-prompts/<COMMIT>/<path>` 拉原图，sharp 转 webp 后返回。
- 缓存只有进程内存（`media-image-variant-cache.ts`，64 条 / 64MB），重启或多实例都会重新拉 GitHub。
- 拉失败（超时 15s、非 200、非图片）就返回 484B 的灰色占位图，`Cache-Control: no-store`。
- 生产实测（今天）：case108 正常（67930B，immutable）；case107、case109 返回 484B 占位图，也就是 GitHub 拉取失败。服务器访问 GitHub 不稳定，是这次要解决的问题。

## 2. 改法

读取顺序：内存缓存 → OSS → GitHub（拉到后写入 OSS）。

1. OSS 对象键：`${config.prefix}/prompt-images/<COMMIT>/<imagePath>`，存**原图**（GitHub 上的原始 jpg/png/webp 字节，Content-Type 用原值）。按宽度生成 webp 仍在本机做，结果进内存缓存。
   - 原因：宽度参数有多档，存原图只存一份；COMMIT 写进键里，以后换 commit 不会读到旧图。
2. `createPublicPromptImage` 取原图：
   - `config.enabled` 为真：先 `getObjectBytes`；不存在（404/NoSuchKey）再拉 GitHub，拉成功后 `putObjectBytes` 写入（写入失败只打日志，不影响本次返回）。
   - OSS 读取报其他错误（凭据、网络）：打日志，退回 GitHub，不写入。
   - `config.enabled` 为假：行为与现在完全一致。
3. 补齐脚本 `web/scripts/backfill-prompt-images-to-oss.mjs`（`pnpm backfill:prompt-images`）：从 `original-author-seeds.json` 取出 955 张示例图路径（COMMIT 从 `public-prompt-image.ts` 读，保证与线上一致），逐个检查 OSS 是否已有，没有就上传。在能访问 GitHub 的机器上跑一次，之后线上不再依赖 GitHub。
   - 并发 4，失败的列出来，可重复执行。
4. 路由、白名单正则、大小和像素限制、占位图逻辑都不改。

## 3. 测试

- `public-prompt-image.test.ts` 增加：OSS 命中时不请求 GitHub；OSS 404 时拉 GitHub 并写入 OSS；OSS 读出错时退回 GitHub 且不写入；OSS 写入失败仍正常返回；OSS 未启用时与原逻辑一致。
- 测试环境跑补齐脚本，然后请求 case107、case108、case109，确认都返回真图（不是 484B），且 OSS 上能看到对应对象。

## 4. 已确认（2026-10-09）

- 存原图。
- 补齐脚本在本机跑：本机直连 GitHub 正常（case107/108/109 均 200，0.3～1.4s）。生产服务器不需要装这个脚本，Dockerfile 不改。
- 运行方式（二选一提供 OSS 配置，前缀必须与后台“外部存储”一致，否则线上读不到）：
  - 环境变量 `PROMPT_IMAGES_OSS_ENDPOINT / _REGION / _BUCKET / _PREFIX / _ACCESS_KEY_ID / _SECRET_ACCESS_KEY / _FORCE_PATH_STYLE`；
  - 或 `DATABASE_URL` + `VOZEB_PRO_ENCRYPTION_KEY`，直接读后台保存的配置（本机能连到生产库时用）。
- 先 `--dry-run` 只检查 GitHub 源图是否都能取到；正式跑会跳过 OSS 里已有的对象，可重复执行；失败项列在最后，退出码 1。
- 即使不跑脚本，上线后每张图第一次被请求时也会自动写入 OSS，脚本只是一次性补齐、避免线上首次请求仍依赖 GitHub。
