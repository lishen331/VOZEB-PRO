# 2026-10-21 扩样统计补充与本地修复发布前核查

## 结论与范围

- 原始扩样报告保持不变。本附件补充统计不确定性及本地质量门禁缺口，不是新一轮付费测试，也不是新代码上线验收。
- 31个原始选择模型已达到用户要求：文本每模型16次、图片每模型至少11次、视频每模型6次。387次唯一提交，331个已建任务终态；252成功、79任务失败，另56次服务器HTTP503未建任务。
- **样本配额满足不等于所有渠道绑定样本充分，也不等于全部模型可开放。** 无task拒绝不能计作某个上游的实际调用；备用渠道仅被选中几次时不得据此永久禁用整个渠道。
- 当前A/B/C代码只在本地隔离分支；没有本轮提交、push、远端合并、配置修改或部署。候选与溢出路由未改。

## 1. 统计区间口径

附件 statistical-intervals.csv/json 分开列出两种分母：

1. selected-model-end-to-end：用户所选模型的全部唯一提交。无task503也是用户提交失败。
2. actual-channel-model-attempt：真实渠道与真实上游模型的实际attempt。不归属尚未发往上游的无task拒绝，也不将最终模型冒充原始选择。

使用Wilson score名义95%区间，z=1.959963984540054。可复算公式：p=k/n，D=1+z²/n；中心=(p+z²/(2n))/D；半宽=z×sqrt(p(1-p)/n+z²/(4n²))/D。以中心±半宽并截到[0,1]输出百分数。

示例：6/6成功的区间为60.97%–100%；11/11为74.12%–100%；16/16为80.64%–100%。不能将观察到100%写成长期可靠性100%。同批请求、共用上游、时段相关和条件溢出不满足严格独立同分布保证；这里仅帮助观察样本不确定性，不是生产SLA保证或未经用户批准的开放阈值。耗时P95也不能与成功率置信区间混用。

## 2. 实际渠道暴露不足的绑定

下表只表示实际attempt数低于该类型的逐模型提交目标，不表示应重新无条件付费补样。选择模型的配额仍全部满足。需要评价某个特定绑定时，另做固定该绑定的验证；不得为了补数修改本次禁止改动的路由。

| 类型 | 实际渠道 | 实际上游模型 | 成功/实际attempt |
| --- | --- | --- | --- |
| video | 兔子 API 渠道 | doubao-seedance-2-5-260628 | 0/1 |
| image | 模汇X中漫 API 渠道 | gpt-image-2.5-sunburst | 0/1 |
| image | 兔子 API 渠道 | gpt-image-2-all | 0/1 |
| image | modelbay API 渠道 | gpt-image-2.5-sunburst | 0/2 |
| text | 昱梦渠道 gpt | gpt-6-astra | 0/3 |
| video | 兔子 API 渠道 | doubao-seedance-2-0-260128 | 0/4 |
| text | 昱梦渠道 gpt | codex-auto-review | 0/5 |
| text | 模汇x中漫 API gpt文本 | gpt-5.2 | 13/13 |
| text | 模汇x中漫 API gpt文本 | gpt-5.4 | 13/13 |
| text | 模汇x中漫 API gpt文本 | gpt-5.6-luna | 14/14 |
| text | 模汇x中漫 API gpt文本 | gpt-5 | 14/14 |
| text | 模汇x中漫 API gpt文本 | gpt-5-mini | 14/14 |
| text | 模汇x中漫 API gpt文本 | gpt-5.1 | 14/14 |
| text | 模汇x中漫 API gpt文本 | gpt-5-pro | 0/14 |
| text | 模汇x中漫 API gpt文本 | gpt-5.4-mini | 14/14 |
| text | 模汇x中漫 API gpt文本 | gpt-5.6-sol | 14/14 |
| text | 模汇x中漫 API gpt文本 | gpt-5.6-terra | 14/14 |
| text | 模汇x中漫 API gpt文本 | gpt-5.5-pro | 0/15 |
| text | 模汇x中漫 API gpt文本 | gpt-5.4-pro | 0/15 |
| text | 模汇x中漫 API gpt文本 | gpt-5.5 | 15/15 |

建议沿用主报告的两维判断：模型/上游能力证据与平台端到端可靠性分开。额度不足、平台准入拒绝、生成后结果下载失败、明确能力不支持分别处理；未覆盖能力标未测。后台是否显示给学生仍由用户决定，本轮没有自动开关模型。

## 3. A/B/C本地实现核查

| 项 | 当前实现 | 可核验本地证据 | 尚缺证据 |
| --- | --- | --- | --- |
| A 图片结果交付及日志 | 既有20MB/30秒/40MP契约；真实字节/完整解码验收；媒体每跳及body错误与持久化分阶段记录；不重复付费生成 | reader/delivery/proxy/stream专项；真实本地TCP媒体fixture；原生Canvas生成、回写、刷新 | 部署后真实供应商、OSS、数据库诊断串联 |
| B 显式URL兼容 | 现有modelConfigs中imageResponseFormat优先；显式格式不自动切b64或Responses再次生成；未操作线上配置 | support与URL契约测试，包括错误返回与无付费格式重发 | 部署后逐具体绑定核对真实出站response_format及媒体读取 |
| C 兔子视频参考首跳直出 | 仅有效provider-read签名+登记OSS视频走200/206/416；保留Range/许可/取消背压；浏览器与图片仍307 | 真实签名权限、Range、源失败与取消专项、本地TCP fixture | 部署后真实OSS及兔子取视频链路 |

详细实现位置见隔离工作树 docs/development/2026-10-21-canvas-result-media-delivery.zh-CN.md。该说明不替代测试证据。

## 4. 本地质量门禁：通过项与未通过项同时保留

- 全量自动测试：5768项，5735通过、33跳过、0失败。
- 媒体专项：312项全部通过。以上两组有交集，不能相加冒充独立用例总数。
- 新增E2E模型fixture契约单测另通过。专项复核发现先前浅色用例只设置全局theme，未设置独立canvasThemeOverride，不能证明浅色已测。已先加入实际主题断言，旧前置条件真实失败（html仍dark），再仅修正本轮E2E前置条件；不改业务主题。最终桌面/390/430 ×真实浅深主题6场景，连setup共9项通过（41.5秒），同时检查生成原节点可读、刷新媒体可见、主题保持和不重复提交。通过范围是本地TCP媒体源，不是真实供应商。
- Prettier、改动范围ESLint、差异空白检查通过。开发地图与接口索引验证：routes=426、pages=64、tables=144。
- 本次追加源码类型核查通过：外部临时配置沿用项目tsconfig，仅检查src、next.config、next-env，未修改仓库tsconfig。**这不是标准typecheck通过的替代声明。** 本轮新增E2E也另做含Node类型的专用TypeScript核查，已通过；图片元素使用HTMLImageElement运行时类型收窄，不使用类型断言掩盖问题。
- 标准typecheck仍失败：生成后的 .next/types 报4条诊断，指向 admin/drama-lab-config/page.tsx 的额外导出/initialTab页面props，以及 api/admin/drama-lab/generation-settings/route.ts 导出的DEFAULT_SETTINGS。两份源码与分支基线blob完全一致；本轮未改。尚未执行完整干净基线复现，不将该比较扩大为已证明全部CI基线结论。不得通过删除生成类型include或跳过检查掩盖。
- webpack生产编译成功。production-build脚本先做源码类型检查，随后在Next编译阶段跳过重复类型校验；因此这次编译成功不能覆盖上面的生成类型门禁失败。
- 默认Turbopack受Windows工作树依赖junction越过构建根限制；standalone启动脚本遇同源目标复制ERR_FS_CP_EINVAL。本地浏览器用已编译产物的next start；没有修改部署脚本，不能声称standalone启动通过。
- 较宽历史E2E：4失败、1未运行、3通过。画布交互测试固定期望白底，但真实画布默认深色；creative-workspaces在桌面/390/430等待旧 .ant-segmented 定位器超时，当前页面使用Gamma Segmented组件。相关历史测试和页面均未被本轮修改。保留失败日志；未将新专项9通过冒充宽矩阵通过，也未为迎合旧测试改变业务主题或短剧UI。

## 5. 发布前剩余步骤（未执行）

1. 对标准生成类型门禁、历史E2E/standalone环境差异做发布前决策；需要跨模块修改时单列范围，不夹带后台或路由变更。
2. 用户对本轮push和测试部署明确批准后，才同步同事最新develop、重新核对差异、更新并验证开发地图与接口索引，再跑受影响门禁。
3. 测试环境验收A：一条原生图片任务串联生成HTTP/上游媒体真实状态/实际字节/OSS登记/原节点刷新/账务；故障用本地fixture或明确允许的故障场景，不额外重复扣费生成。
4. 验收B：只针对已确认支持URL的具体模型绑定，以实际出站请求及返回为证；未配置模型不硬塞response_format。
5. 验收C：真实provider-read签名视频首跳200和Range206，核对上游实际收到可读视频；普通浏览器和图片仍307。
6. 三项真实验收后再评估并发回归与生产发布。当前不宣告总体目标完成。

## 6. 可审计证据位置

原扩样报告：D:/Claude code programe/VOZEB-PRO/VOZEB-PRO/docs/reports/2026-10-21-canvas-model-expanded-samples/production-live-model-report.zh-CN.md

本地验证目录：C:/Users/admin/Downloads/VOZEB-capacity-20261021/local-verification

关键日志：full-suite-final.json、media-suite-final.json、canvas-media-delivery-browser.log（旧记录，不作为真实浅色证明）、canvas-media-theme-red.log、canvas-media-theme-green-final.log、typecheck-e2e-media-theme.log、routing-scope-audit.json、typecheck-final.log、typecheck-source-audit.log、tsconfig-source-audit.json、production-build-webpack.log、canvas-browser-regression-direct-next.log、format-final.log、eslint-final.log、development-map-verify-final.log。

本补充不含账号口令、API Key、签名媒体URL、私钥或请求正文。样本账号继续使用Uxx别名。
