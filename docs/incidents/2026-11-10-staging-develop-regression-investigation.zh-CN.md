# 测试环境模型池退回旧默认模型：版本基线调查

## 状态与边界

2026-11-10用户要求定位原因，并质疑其他修复被覆盖。本次仅只读取证，冻结后续发布；未执行环境回滚、数据库修复或代码合并。当前画布子开关源码与技能工作保留，尚未发布。

## 已确认根因

测试环境之前已运行develop `e44c0ea759df2b02a10c8f8614882a90348cf1ac`，包含练习模型池。主代理随后把从生产main基线构建的候选 `9879b3ebd23d8d274e46da2f4261c468b639dcbe` 部署到同一测试实例；该候选未包含develop上的模型池及其他独有功能。属于应用版本基线回退，不是浏览器缓存，也不是删除GitHub develop分支。

- GitHub Staging image `42592298061`：develop/e44c，2026-11-09 17:17:46开始、17:29:31完成（北京时间）。
- Staging image `42613346853`：workflow_dispatch，fix/page-defects-prod-20261109/9879，19:59:45开始、20:16:22结束；部署步骤20:10:26—20:16:06。
- 服务器当前app和worker均为sha-9879；app开始20:15:47、worker20:16:02，与workflow时间吻合。
- `git merge-base --is-ancestor e44c 9879` 退出1；两个分支分叉。远端develop仍为e44c，main为69e2（9879的合并树）。
- origin/develop存在 `web/src/components/admin/practice-model-pool-manager.tsx` 与 `/api/admin/practice-model-pool{,/candidates}`；9879与当前main中均不存在。运行实例app-paths-manifest也无对应API。
- develop的admin-logical-model-manager.tsx:18、245挂载PracticeModelPoolManager；9879同文件228、264仍是练习默认模型与未设置默认模型文案，和截图相符。

## 数据保全（只读查询）

第一次查询使用数据库容器默认库，未找到app_settings，事务失败退出，没有写入。随后按应用DATABASE_URL定位实际库和有前缀的表，再执行BEGIN READ ONLY聚合查询。

- `vozeb_staging.public.vozeb_pro_app_settings.practice_model_pool`列存在，值非NULL、类型object。
- 当前保存image池1项（0勾选、1排除），video池2项（1勾选、1排除）；仅返回数量，未输出模型名/渠道密钥/个人数据。
- 当前旧版本的store-repository读取映射无practiceModelPool；develop store-repository.ts:358读取该字段。数据仍在但运行版本不识别。
- 这证明此刻池配置未被整体清空，不证明与部署前所有历史配置完全一致；未核对历史快照，不声称零数据损失。
- 服务器仍保留e44c镜像image ID `sha256:3dd689d1042ca1f280d257dac48ee7eed46798af342d65a7a28864a405b42f86`，但未直接恢复，避免再丢另一侧修复。

## 为什么此前绿色门禁没挡住

门禁覆盖生产基线候选自身的测试，没有把测试环境已上线develop功能作为必须保留的基准。测试部署workflow允许任意ref的手动dispatch，缺少“候选必须包含当前已部署版本/已批准保留清单”的晋级检查。用“避免develop误进生产”的隔离候选直接替换共享测试环境，是本次操作决策错误。

## 调查其余影响

main...develop共30/95个不同侧提交（含合并、文档、等价修复）；不能据此宣称95个产品缺陷。正在按实际内容区分真正缺失、等价已包含、纯文档/产物及未验证项。

## 恢复建议（未执行）

1. 先保全当前数据库/媒体与两个版本的镜像/配置，不清空库，不用旧数据覆盖。
2. 以当前develop为测试集成基线，逐项合入main已发布页面修复和本地热补丁，保留模型池/渠道隔离/其他已上线功能。冲突必须按双侧需求审查，不整文件取某一边。
3. 增加模型池UI、池勾选持久化、文本/视觉/图片/视频/音频候选、渠道正式/练习隔离等验收；无真实收费生成授权则使用TCP fixture/隔离QA库。
4. 新候选同时通过双侧保留清单与完整门禁后，才按用户确认的范围恢复测试；生产升级另行确认集成范围，不能把本次main缺功能说成刚刚生产代码被删除。
5. 所有后续发布先核对实际已部署SHA与候选祖先关系；候选不包含当前版本必须暂停，列出缺失并确认，不能只看CI成功。
## 其余功能的只读差异复核结果

比较对象固定为旧测试develop e44c与现运行9879（不是读取正在编辑的工作树）。以下为源码确定性结论，不等同于各功能已经线上逐一复现：

| 范围 | 结论 | 证据 |
| --- | --- | --- |
| 五能力练习模型池及候选/勾选管理 | 确认未进入当前运行版本 | develop的pool manager及两条API存在；9879及运行manifest均缺失；store映射不读practice_model_pool |
| 渠道正式/练习独立启用开关 | 确认缺失 | develop有practiceEnabled/practice_enabled及按surface判定；9879无对应类型、持久化和UI |
| 练习虚拟模型/视觉分流/非RunningHub模型路由 | 确认缺失 | develop有practice/available-models API和practice-canvas-models；9879无文件，图片候选缺protocol===runninghub再附工作流的保护 |
| 项目生成继承学校上下文 | 确认缺失 | develop有resolveProjectExecutionContext/schoolId传递；9879仍仅执行profile |
| 显式Agnes协议、JSON参考图及排队视频 | 确认缺失部分契约 | develop注册agnes并有agnes-video-provider；9879无该显式协议，非RunningHub排队视频走unsupported；不能因此称所有Agnes通用能力都不存在 |
| 签名参考图直接返回字节 | 确认未保留 | develop的reference-assets和generation-log-assets条件为signed或render=canvas；9879仅render=canvas |
| IP预览组循环重渲染修复 | 确认未保留 | 768685db将register改useCallback及context改useMemo；9879仍是其修复前blob，注册effect依赖group形成自激链 |
| public-media共享出口IP限流倍率 | 确认差异 | develop增加GENERATION_SHARED_IP_MULTIPLIER；9879该策略仍用原值，不代表其它限流倍率均丢失 |
| 音色定制、能力API、运行时和voiceCustomization白名单 | 已有，不能声称丢失 | 相关最终实现与develop一致；除Agnes新增协议外白名单已保留voiceCustomization |
| 图片同时返回base64和URL的去重 | 已有等价修复 | 9879的image-task-support.ts已有hasInlineImage分支跳过重复URL下载 |
| 课程附件转PDF/异步导入/预览布局与翻页 | 大部分实现已有 | 相关最终文件blob与develop一致；不能按独有提交hash判为功能回退 |
| IP返回导航 | 已有等价功能 | main侧已发布明确返回IP库链接；应与IP预览组稳定性问题分开 |
| 弹窗滚动锁 | 不能仅凭hash判丢失 | main使用后续RetainedDialogContent/open-only Overlay替代实现，已有专项回归；本次未重新线上复现 |
| PDF.js版本兼容策略 | 有依赖差异，运行时是否故障未证实 | develop固定5.4.624，9879为^6.4.299；预览组件相同，不能仅据版本号断言当前PDF必坏 |

上述问题并非当前尚未推送的画布子开关引入。操作失误发生于11月9日20:16测试环境切换生产基线候选时。生产main本来就没有develop独有模型池，不能把此次发现描述成刚刚从生产删除了模型池。

## 最终处置状态

本调查没有修改服务器应用/配置/数据库，没有恢复旧镜像。测试e44c原镜像仍可用，池配置列与值仍在。应用数据库只执行只读事务。已冻结后续部署，并将“候选必须保留目标环境当前已上线功能，祖先关系不成立必须暂停核对”的规则补入全局发布技能。当前需要用户确认是否按双侧保留的集成恢复方案执行，而非直接对生产/测试盲目回滚。