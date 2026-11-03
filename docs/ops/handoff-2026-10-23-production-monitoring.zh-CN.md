# 生产监控与修复工作交接（2026-10-23）

> **19:15 更新**：已下课，监控已停。今天的结果和最新待办见 [日报告](../reports/2026-10-23-production-classroom-day-report.zh-CN.md)，以那份为准。下文第 1、2 节是 10:10 的状态，部分已过时：
> - 栈溢出：HP-1、HP-2 热更新后 0 次（另一会话，见 `docs/reports/2026-10-23-prod-hotpatch-log.zh-CN.md`），还没进源码
> - media_timeout：已取证，是模汇图床慢；HP-3 放宽了超时
> - ModelBay 已充值；兔子真人素材已实测跑通并热更新（12:18）
> - `mon-loop.sh` 改成单实例（`mon-loop.pid`），`mon-check.sh` 的栈溢出计数起点改为 11:54 并覆盖保存阶段

写给：接手的新会话。读完这一份就能接着干，不用翻旧会话。

## 0. 先做这三件事

1. 读用户规则（第 6 节），尤其是"改代码前先写开发文档等用户同意"和"生产发布要用户明确批准"
2. 跑一次 `bash /d/tmp/vz-mon/ssh.sh /d/tmp/vz-mon/prod-quick-status.sh`，确认生产版本和健康状态
3. 如果在上课时段，重新开监控：`Monitor` 跑 `bash /d/tmp/vz-mon/mon-loop.sh`（30 分钟到期要重开）

## 1. 现在的状态（2026-10-23 10:10 左右）

| 项 | 状态 |
|---|---|
| 生产版本 | v0.8.18，镜像 `ghcr.io/lishen331/vozeb-pro:sha-232737aadaafb96d001da3699484b8d67c928483` |
| 生产热更新 | 有。另一个会话 10:05 打的：栈溢出修复（`rawImageBase64DataUrl` 改用 `globalThis.__vzB64` 逐字符检查）。**下次发版会被冲掉**，必须进源码随版本发 |
| 测试环境 | `sha-01c1f6d1`（develop，含栈日志 + B 项） |
| 课堂监控 | 用户 09:00 左右说"上课了开始监控"。还没说下课 |
| 用户最后指示 | "继续监控，收集异常、报错，等日志和证据，以便晚上修复 bug"。之后用户拒绝了一次查询（查 media_timeout 详情），**原因没说**，接手后先问用户能不能继续跑只读查询 |

## 2. 待办（按优先级）

1. **栈溢出正式修复**：另一个会话在做，热更新已上。等它进源码、发版。上线后盯大图（>4.5MB）是否还 `RangeError`
2. **media_timeout**：10:07、10:08 两次（task `c6362ff7` 等），gpt-image-2-c 模汇图生图，上游 200 但结果读取超时。只拿到报错文本，**还没取证**。等用户同意后查诊断事件
3. **ModelBay 余额为负**（＄-0.001576）：所有 ModelBay 图片/视频和溢出切过去的任务都失败。需要用户充值
4. **模汇磁盘满**：凌晨 03:30 上游报 `system disk overloaded (99.6%)`。之后模汇大多正常，但要留意
5. **兔子真人参考图**：等兔子回复"审核 active 的 asset:// 提交视频报'素材地址未返回可下载文件'"。源码改动在本地分支 `hotfix/tuzi-asset-model`（commit `88b696b9`，未推送）
6. **ModelBay flare/sunburst 图生图 `Unknown parameter: 'response_format'`**：没修，配置问题，查绑定
7. **10 个低成功率模型**：10-21 晚为测试重新打开，用户说"明早再关"，还没关。关闭脚本见第 5 节
8. 晚上下课后：出全天报告，按证据修 bug

## 3. 今天/昨天做过的事

### 已上线
- **v0.8.15** 溢出 403 修复（签名路由头 + 溢出被拒换一次）。PR #60
- **v0.8.16** 画布结果 A/C（另一会话写的，我发的）。PR #61
- **v0.8.17** 图片媒体授权按上游模型签名 + 视频参考图尺寸（另一会话发的）
- **v0.8.18**（我发的，PR #62，`232737aa`）：
  - `642a325f` 程序异常记录调用栈：`traceMediaException` 遇 RangeError/TypeError/ReferenceError 打 `[media-stack]` 日志 60 层，诊断里存 20 层（≤1500 字）。`Error.stackTraceLimit=60`
  - `b287d87e` 模汇 URL B 项：模型级 `imageResponseFormat` 优先；显式格式不再自动换格式重生图
- **配置**：模汇 `_-eQ3SntRYtuDZz9mJ_OK` 的 `modelConfigs.gpt-image-2-all/gpt-image-2-c.imageResponseFormat="url"`，settings_revision 96→97（直接改库，用户授权）。实测请求带了 url，但**模汇仍返回 base64**

### 已定位
- **大图栈溢出根因**（10-23 09:37 靠 v0.8.18 日志抓到）：`web/src/app/api/image-tasks/image-task-support.ts` 的 `rawImageBase64DataUrl` 和 `resolveImageBase64Like` 用 `/^[a-z0-9+/=_-]+$/i.test(数 MB base64)`，V8 正则爆栈。进程跑热后才爆，所以新进程复现不了。调用链：`parseImagePayloadOrPoll → findImageResults → collectImageResults → resolveImageBase64Like → rawImageBase64DataUrl → RegExp.test`
- 本地分支 `fix/b64-regex-overflow`（worktree `D:\tmp\vz-hotfix`）有我改的一半（逐字符 `isBase64Text`，没写测试、没提交）。用户说交给其它会话修了，**这个分支可以删**

### 撤回/没做成的
- 兔子素材两次热更新（14:20、15:15）都撤回了，原因见 2-5
- 10-22 晚手动触发 12 次大图想复现栈溢出：12/12 成功（新进程不爆）

## 4. 访问方式

### 生产服务器
- SSH：`root@8.163.33.161`，端口 `22222`，key `C:\Users\admin\Downloads\id_ed25519_8_163_33_161_root_pc2_20260907`
- 封装：`bash /d/tmp/vz-mon/ssh.sh <本地脚本>`（把本地脚本当 bash 在远端跑）。环境变量不会传过去，要写进脚本里
- 容器：`vozeb-pro`（app，3000）、`vozeb-pro-generation-worker`、`vozeb-pro-postgres`
- compose：`/opt/vozeb-pro/production/compose.production.yml`，镜像在 `.env` 的 `VOZEB_PRO_IMAGE`
- 管理员用户 id：`ed5bbb31-5a9f-438f-81ea-4412bb275970`；可用画布项目 `canvas-HbxDXzUKU-mH1XGNecaZ0`

### 测试服务器
- `bash /d/tmp/vz-mon/ssh-stg.sh <脚本>`
- 容器：`vozeb-staging-app-1`、`vozeb-staging-generation-worker-1`、`vozeb-staging-postgres-1`
- 域名：`reddetail.gammablue-x.com`

### 数据库（psql 在 postgres 容器里）
```
docker exec -i vozeb-pro-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -A -t -F "|"' <<'SQL'
...
SQL
```
- 表名都有前缀 `vozeb_pro_`：`generation_tasks`（`payload` jsonb、`diagnostic_events` jsonb，`at` 是毫秒）、`generation_logs`、`app_settings`（id='default'，`logical_models`、`default_models`、`settings_revision`）、`system_model_channels`（`advanced_config`，密钥列 `api_key_ciphertext` **不要打印**）
- 改配置要 `settings_revision + 1`，先备份到 `/root/`

### 内部接口（不用账号密码）
在 worker 容器里调 app：`authorization: Bearer $VOZEB_PRO_WORKER_TOKEN` + `x-vozeb-pro-worker-user-id: <用户id>`，地址 `http://app:3000`。例子：`/d/tmp/vz-mon/prod-trigger-big.sh`、`prod-url-verify.sh`。
- `/api/admin/settings` 只认浏览器会话，worker 凭证调不了

### 渠道 ID
| 渠道 | id |
|---|---|
| 模汇X中漫 | `_-eQ3SntRYtuDZz9mJ_OK` |
| 兔子 | `hr5VKuKJKirZ1-sdRZPY5` |
| ModelBay | `X9te4qOV0ZaPsJpErRRWS` |
| 天翼云 TokenHub 视频 | `wD0cO6S6cyhbyvYIRDE28` |

### 解密渠道密钥（只在容器内、只打指纹）
见 `/d/tmp/vz-mon/prod-tz-asset-probe.sh`：从库里取密文，在 app 容器里用 `VOZEB_PRO_ENCRYPTION_KEY` 解 AES-256-GCM（前缀 `vozeb-pro-secret:v1:`）。输出一律 mask。

### GitHub
- 仓库：`lishen331/VOZEB-PRO`（`gh` 要带 `-R lishen331/VOZEB-PRO`）
- `develop` push → Staging image 自动构建部署（约 20 分钟）
- 打 `vX.Y.Z` tag（必须在 main 上）→ Production image 构建+部署（约 25 分钟）
- Quality 的 Dependency audit 一直红（68 个漏洞，生产基线就有），不是本次改动造成
- 网络偶尔 TLS 握手失败，`git fetch/push` 要重试

### 本地
- worktree：`D:\tmp\vz-hotfix`（不要动主仓库 `D:\Claude code programe\VOZEB-PRO\VOZEB-PRO`，里面有别的会话的未提交改动）
- 跑测试：`cd /d/tmp/vz-hotfix/web && npx vitest run --maxWorkers=3`（不限 worker 会报 paging file too small）。`pnpm` 不在 PATH，用 `npx`
- Windows 上 `dead-route-guard.test.ts` 偶发 5 秒超时，单独重跑会过
- 状态灯：`curl -s "http://localhost:18789/api/report_status?status=running|waiting|done"`

## 5. 脚本（都在 `D:\tmp\vz-mon\`）

| 脚本 | 用途 |
|---|---|
| `mon-loop.sh` + `mon-check.sh` | 课堂巡检：每 5 分钟报新失败、大图/栈溢出计数、容器、日志。`mon-check.sh` 里的大图起点时间要随发版改 |
| `prod-media-stack-watch.sh` | 抓 `[media-stack]` 日志 |
| `prod-quick-status.sh` / `prod-quick-status2.sh` | 快速看版本、错误分布 |
| `prod-image-info.sh` | 看两个容器的镜像和启动时间 |
| `prod-day-report.sh` / `prod-day-report2.sh` | 全天统计（时间窗写死在脚本里，要改） |
| `prod-big-detail.sh` | 每次大图返回的明细 |
| `prod-rollback-v0815.sh` 等 | 版本切换：改 `.env` 的镜像 + `docker compose up -d --pull never`。改 `IMG=` 即可切到任意已拉取的版本 |
| `prod-rollback-v0817.sh` | 备用：回滚到 v0.8.17（未执行） |
| `prod-mohui-url-revert.sh` | 备用：撤回模汇 URL 配置（未执行） |
| `prod-disable-lowrate.sh` | 关闭 10 个低成功率模型 + 默认视频改 doubao-seedance-2-0 |
| `prod-reenable-lowrate.sh` | 重新打开那 10 个 |
| `prod-stack-patch.sh` | 热更新加栈日志（v0.8.18 起已进源码，不再需要） |
| `prod-hot-patch2.sh` / `prod-hot-revert2.sh` | 兔子素材热更新及撤回 |
| `prod-trigger-big.sh` | 串行提交图生图大图（付费） |

## 6. 用户规则（必须遵守）

- **改代码前先写开发文档**（`docs/superpowers/specs/`），等用户同意再写代码
- **修之前先查有没有现成修复**（GitHub 分支/PR）
- **生产发布每次都要用户明确批准**，一次批准不延续到下一次
- 推新分支，不直接推 main；生产发布只带要发的提交，不把 develop 上同事的 UI 改动带进去
- 课堂监控："开始上课"开始，"下课"停止；每个异常一份报告 `docs/ops/findings/YYYY-MM-DD-HHMM-<slug>.zh-CN.md`
- 不打印密钥，只在容器内解密并 mask
- 回复用中文；写给用户的文字简单直接
- commit 结尾：`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`；PR 结尾：`🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- 别的会话可能同时在发版/热更新，动生产前先看 `prod-image-info.sh` 和 `gh run list`

## 7. 文档索引

`D:\Claude code programe\VOZEB-PRO\VOZEB-PRO\docs\` 下：

- `ops/findings/2026-10-22-1155-image-edit-rangeerror-large-b64.zh-CN.md`：栈溢出全过程（含根因）
- `ops/findings/2026-10-22-1320-real-person-video-asset-channels.zh-CN.md`：真人参考图 / 兔子素材
- `ops/findings/2026-10-22-1155-image-edit-response-format-rejected.zh-CN.md`
- `ops/findings/2026-10-22-1155-video-reference-size-and-modelbay-asset-400.zh-CN.md`
- `ops/findings/2026-10-22-1155-channel-quota-low-mohui.zh-CN.md`
- `ops/findings/2026-10-23-0330-mohui-url-config-verification.zh-CN.md`：B 项验收
- `reports/2026-10-22-production-classroom-day-report.zh-CN.md`：10-22 全天报告
- `superpowers/specs/2026-10-19-image-overflow-403-and-switch.zh-CN.md`
- `superpowers/specs/2026-10-22-tuzi-asset-upload-model-field.zh-CN.md`
- `superpowers/specs/2026-10-22-media-exception-stack-logging.zh-CN.md`（也在 worktree `docs/`）
- `superpowers/specs/2026-10-23-mohui-image-url-contract.zh-CN.md`（在 worktree `docs/`，已随 v0.8.18 合入 main）
