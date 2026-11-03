# 热更新方案：侧栏先不显示作品广场（2026-10-29）

写给：执行热更新的会话。

## 要解决的问题

v0.8.20 新版侧栏把"作品广场"固定插在社区组第一位，不受模块开关和菜单权限控制（`web/src/components/layout/workspace-navigation.ts` 的 `GALLERY_ITEM`）。侧栏现在不应该有这一项，先用热更新去掉。

**只改侧栏**（用户 2026-10-29 确认）。以下保持不动：首页轮播"逛作品广场"、首页下半屏作品瀑布流、`/gallery` 和 `/community` 页面、"我的作品"页的作品广场按钮、分享页和用户主页的链接、发布时"公开到作品广场"选项。

## 生产现状（15:05 只读探测）

- 两个容器镜像 `sha-3d3bd8ec`，app 06:48 启动，BUILD_ID `wnjjoiD6s1CvK8IzFfxd_`
- 前面有 Cloudflare，页面 `cf-cache-status: DYNAMIC`；`/_next/static/chunks/*.js` 响应头 `public, max-age=31536000, immutable`

## 改动（都在 app 容器 `/app/web/.next/`，每个文件必须恰好匹配 1 次）

把 `...g<0?[...e,M]:[...e.slice(0,g),M,...e.slice(g)]` 改成 `...e`（变量名各文件不同，用正则加反向引用匹配，并校验被插入的变量就是 `{key:"gallery",label:"作品广场"...}`）。

| 文件 | 用途 | 变量 |
|---|---|---|
| `server/chunks/ssr/src_components_layout_gamma-app-sidebar_tsx_0u2bedp._.js` | 侧栏服务端渲染 | `g` / `e` / `M` |
| `static/chunks/3muz6tmlo147r.js` | 首页侧栏（浏览器端） | `i` / `n` / `U` |
| `static/chunks/0l1c55pbat5za.js` | 工作空间页面侧栏（浏览器端） | `s` / `l` / `H` |

服务端和浏览器端必须一起改。只改服务端，页面在浏览器里加载完后会按浏览器端代码重新渲染，入口又会出现。

## 浏览器缓存

静态 chunk 带 `immutable`，原地改文件，已经访问过的用户会继续用旧缓存。所以两个静态 chunk 改完另存为新文件名（`3muz6tmlo147rhg.js`、`0l1c55pbat5zahg.js`），再把 `.next` 下所有引用旧文件名的地方（`server/app/**/page_client-reference-manifest.js` 等，试跑列出完整清单）换成新名字。旧文件不删，已打开的页面不会 404。

## 执行

脚本在 `D:\tmp\vz-mon\`：

| 步骤 | 命令 |
|---|---|
| 0. 确认没人在发版、当前没在上课 | `bash ssh.sh prod-image-info.sh`；`gh run list -R lishen331/VOZEB-PRO -L 5` |
| 1. 试跑：在容器 `/tmp` 副本上改，报告匹配数、`node --check`、旧文件名引用清单，生产文件不动 | `bash ssh.sh prod-hide-gallery-dryrun.sh` |
| 2. 打补丁 | `bash ssh.sh prod-hide-gallery.sh`（试跑通过后再写） |
| 撤回 | `bash ssh.sh prod-hide-gallery-revert.sh`（同上） |

打补丁脚本要做的事：校验镜像 `sha-3d3bd8ec`；被改文件和所有引用文件备份为 `*.bak-hg-<时间>`；打补丁、另存新文件、替换引用、`node --check`；只重启 app（worker 不渲染页面），等 healthy；打印旧文件名在引用文件里的剩余计数（应为 0）。

注意：

- 重启 app 约 30 秒，页面和接口短暂不可用；生成任务在 worker 里，不受影响
- 和之前的热更新不重叠，试跑会 grep 三个目标文件里的 `__vz` 标记确认
- 下次发版会冲掉，正式修复要进源码（另写开发文档）

## 上线后验收

1. 无痕窗口打开首页：侧栏没有作品广场，首页轮播和下半屏照旧，控制台没有水合报错
2. 登录学生账号进 `/works`、`/canvas`：侧栏没有作品广场
3. 用有旧缓存的浏览器普通刷新，确认加载的是新文件名
4. `curl` 两个新文件名返回 200
