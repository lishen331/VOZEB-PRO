# Agnes 参考图生视频：素材下载链路调查与本地修复

日期：2026-11-05。范围：VOZEB-PRO 测试环境 Agnes 视频参考素材下载；不改提示词、计费、渠道调度或生成任务状态机。

## 1. 结论与证据强度

已确认上游失败发生在素材读取阶段，但尚不能单独证明 HTTP IP、307 跳转或其后的 OSS 访问哪一项是 Agnes 取图器拒绝的具体原因。本地修复移除已观察到的跳转依赖；部署后的 Agnes 真实带图验收仍有必要。

- 文生视频任务 `59409df3-36eb-4aaa-ac81-867b1d5635c1`：`agnes-video-2.5`，参考图为空，成功生成并保存 5 秒视频。
- 参考图任务 `a628084e-d797-42a7-a13b-3899c2c7e605`：同模型，创建于 `2026-11-05T02:04:54Z`，约 6 秒后失败。创建接口返回 200，已保存上游 ID `task_cc5mtKQQ7C86A8iRH6fKDmjBtiaVIDjy`。
- 上游任务查询返回：`queue group dispatch failed after 1 attempts: media URL could not be downloaded or did not return valid supported media.`
- 因而此例不是“上游 ID 丢失”，没有余额不足的错误证据，也不是 15 分钟签名到期导致这次 6 秒失败。
- 同节点此前两个 Flash 请求返回 `video queue is full`，没有创建上游任务。这与素材下载失败是不同问题，不能混为同一原因。

## 2. 实际取图链路

服务器配置 `NEXT_PUBLIC_SITE_URL=http://8.163.37.148:3001`；`public-request-origin.ts` 优先采用已配置的非本地 origin，因此浏览器访问 HTTPS 域名不代表发给上游的素材链接也使用 HTTPS 域名。

对同一原始 PNG 的有效签名链接，使用禁止自动跟随跳转的只读检查发现：

- HEAD：200，登记的图片元数据正常。
- GET：307，Location 指向 OSS 带签名原件 URL。
- 自动跟随跳转：能读取正常 PNG，1024×1024，1,406,393 字节。

这解释了为什么仅检查 HEAD 或使用默认自动跳转的 fetch，不能证明 Agnes 的取图器也可以读取。现有访问日志未提供可明确归因 Agnes 下载失败的直接请求证据，不能据此断言 OSS 屏蔽了 Agnes。

## 3. 本地最小修复

修改两个既有素材路由，仅将对象存储图片的直出条件从显式 `render=canvas` 扩展为“有效 provider-read 签名，或既有 canvas 读取”。复用原有受限原图读取分支，不新增素材副本或新服务。

- 有效签名 GET：首跳 200，直接返回原图字节、真实 Content-Type 和 Content-Length，无 Location。
- 响应采用 `private, no-store` 与 `nosniff`。
- 普通已认证浏览器展示仍按原逻辑跳转 OSS。
- 无效匿名签名仍拒绝；provider-read 签名不能使用 `download=original` 下载契约。
- 保留现有图片读取上限、限流、并发控制和 permit 释放。
- HEAD 仍只读取登记元数据。
- 不改提示词、参考图用途、原图尺寸、生成提交逻辑和签名有效期。

修改文件（均位于仓库根目录下）：

1. `web/src/app/api/generation-log-assets/[...path]/route.ts`
2. `web/src/app/api/generation-log-assets/[...path]/route.test.ts`
3. `web/src/app/api/reference-assets/[...path]/route.ts`
4. `web/src/app/api/reference-assets/[...path]/route.test.ts`
5. `web/src/lib/server/provider-reference-media.integration.test.ts`

## 4. 验证

- RED：两个新增首跳 200 测试在修复前均以“实际 307、期望 200”失败。
- GREEN：8 个专项文件、91 个测试通过，包含两个素材路由、真实签名的本地 HTTP 下载、签名校验、视频参考图、Agnes provider/fixture 与公共 origin。
- 新增 HTTP 集成测试 16 项：使用随机监听端口、本地固定测试签名密钥与内存 PNG，不调用数据库、真实 OSS 或付费上游。使用实际 Agnes 请求构造器保留原始 prompt 和 images，模拟上游禁用重定向、无 Cookie 下载；核对首跳 200、字节完全相等、PNG 可解码且尺寸不变。覆盖无签名、过期、篡改、跨用户、跨作用域、错误用途拒绝读取，以及普通浏览器保留 OSS 跳转。
- 新增 HTTP 测试也执行 RED/GREEN：暂时恢复旧条件时，两条正向下载测试均以 307 != 200 失败；恢复修复后全部通过。
- TypeScript `tsc --noEmit`、本次五个源码/测试文件 ESLint、Prettier 均退出 0。
- 本次改动 `git diff --check` 通过。
- 全量 Vitest：1124 个文件通过、1 个失败、9 个跳过；6209 个测试通过、1 个失败、41 个跳过。唯一失败位于 `web/src/components/admin/admin-tablet-layout.test.ts:14`，期望管理员日志面板保留旧布局 class；该面板属于工作区其他未提交改动，与本次素材路由不相交。本轮未替其他会话修改其布局或测试。
- 开发文档验证暂未通过：接口索引 443 项，源码 route 444 项。工作区同时存在其他改动，包括新增管理员日志详情路由；本次未新增 route，不为通过门禁覆盖其他会话文件，发布前需由当前整合工作区同步文档基线。

## 5. 待授权的发布与验收

1. 发布本次最小代码修复，不混入其他未提交改动。
2. 将测试环境公共站点 origin 修正为 `https://reddetail.gammablue-x.com`，确认 app/worker 实际运行配置一致。现阶段仅记录建议，没有修改线上配置或重启服务。
3. 线上使用新的有效 provider-read 签名进行 GET，禁止自动跟随跳转，确认首跳 200、原始 PNG/JPEG 字节、Content-Type 正确；同时验证匿名无签名不可读取。
4. 用户明确授权后，发起一次带图视频验收，保存本地任务 ID、上游任务 ID、提交参数、查询结果及最终落盘结果。不得自动重建已接单任务或循环付费重试。
5. Agnes 官方文档区分 `reference + images[]` 与 `keyframe + first_frame/last_frame`。维持既有协议语义，不把两种模式混用，也不添加隐藏提示词。媒体须在上游取用时可访问；现有 15 分钟 TTL 未在本轮调整，若排队跨越该时限，应依据供应商约束和项目配置另行处理，不拍脑袋延长。

官方文档核对地址：`https://wiki.agnes-ai.com/zh-Hans/docs/agnes-video-25.md`。

## 6. 当前边界

本轮修复单独保存在本地 Git 提交中（提交 SHA 见交付消息）。未推送、未合并、未部署、未改线上域名配置、未重新生成付费视频。线上问题尚不能标记已恢复；Flash 队列满也不在此次素材直出修复范围内。

## 7. 测试环境发布准备（2026-11-05）

用户已明确授权本次发布至测试环境 develop，不涉及 main 或生产。使用独立 worktree 从最新 origin/develop `7b04b972` 叠加本次修复，保留已发布的共享 IP 素材限流修复，不混入主工作区未提交的 UI/日志等改动。

- 发布前回归：10 文件、107 测试通过；全量 TypeScript、ESLint 和 Prettier 通过。管理员平板布局测试在隔离发布代码中通过，之前失败来自主工作区尚未提交的其他改动。
- 开发文档更新及验证通过：443 API Route、72 页面、147 表。隔离工作区没有额外管理员日志详情路由，因此不存在主工作区的 443/444 漂移。
- 已备份测试环境 .env（服务器内、0600，不入库），将 NEXT_PUBLIC_SITE_URL 单行改为 https://reddetail.gammablue-x.com；compose 配置语法验证通过。待自动部署重建 app 后核对运行时生效。
- worker 沿用既有架构，通过内部 origin 调用 app，不读取该公共地址；不为此改 compose 或给 worker 复制整份环境密钥。
- 推送后仍须核对 Actions、app/worker 镜像、readiness，以及 HTTPS 有效签名的真实 GET 首跳返回原图。不发起付费视频生成。
