# 图片备用模型结果媒体授权失败：生产证据与最小修复建议

状态：**代码字段错用已离线复现；没有修改、提交或部署生产代码。**

## 1. 概述

生成创建/轮询通过，并不代表图片已交付。图片换到另一个实际模型后，结果下载签名仍使用原始逻辑模型ID，媒体授权端却核验当前实际执行模型，二者不匹配会被平台自己的`/_media`以403拒绝。

这与之前“生成请求未绑定逻辑模型403”、上游余额403、上游返回504以及JS RangeError是不同层的问题。不能合并成“兔子不行”或“所有403都因额度”。

## 2. 两笔生产证据（2026-10-22，北京时间）

| task ID | 原始logicalModel | 当前执行model | 上游任务ID | 最终耗时 |
| --- | --- | --- | --- | ---: |
| `0ddccffb-02a8-4cd5-b519-df6900aebf16` | `gpt-image-2` | `gpt-image-2.5-sunburst` | `task_B2DIim4pV5iPrPtJEcSkRY1W1TXqkH3e` | 126.161 s |
| `d311a845-f23b-45a4-aaca-3152a9f67580` | `gpt-image-2-c` | `gpt-image-2.5-sunburst` | `task_o2EsnlbHBhrYSEVJro9WXeI4Plz2YRSn` | 400.741 s |

- 第一笔首attempt兔子`gpt-image-2` HTTP200，完整正文4,782,435 bytes后RangeError；第二attempt兔子异步创建200，request ID `202610220913051123062158268d9d69CDHr4mV`，拿到任务ID并轮询到结果处理，随后内部媒体请求403。
- 第二笔首attempt模汇504，第二attempt兔子异步创建200，request ID `202610220912153684375148268d9d60UZuzfUy`，拿到任务ID；轮询后同样内部媒体403。
- 两笔403事件均`transport_response.status=403`、`mediaProxyPath=true`、错误“媒体路径未获任务授权”。不是上游直接返回素材403。
- 最终task/log均失败、`successCount=0`，`result_payload`非空判定false。第一笔两个attempt各查到1积分退款，第二笔第二attempt查到1积分退款。退款只证明平台流水，不代表上游未收费。
- 两笔`routeLogicalModel`均已保存为`gpt-image-2.5-sunburst`；生成路由身份修复不自动修复媒体签名字段。

生产冻结：`2026-10-22-classroom-evidence/fallback-media-auth-production-evidence-20261022-171816.json`。不包含签名URL、token、key或提示词正文。

## 3. 对应生产SHA源码

已按生产镜像SHA `bc2643a5d2c8ddc51173f4a74d45da3c6ee52859`核对：

1. `web/src/lib/server/image-task-result-service.ts:94–100`，`normalizeSafeImageResult`：

   ```ts
   generationMediaProxyHeaders({
     userId: task.userId,
     taskType: "image",
     taskId: task.id,
     channelId,
     upstreamModel: generationModelId(task.config),
     url: proxiedRemoteUrl,
   })
   ```

2. `web/src/lib/server/generation-channel.ts:80–82`：

   ```ts
   return config.logicalModel?.trim() || config.model;
   ```

   因而保留原选logicalModel时，签名的`upstreamModel`并不是实际备用模型。

3. `web/src/lib/server/generation-media-access.ts:5–12`：读取签名及任务，校验user、cancelled、channel后，对比`record.payload.config.model`与`claim.upstreamModel`。
4. `web/src/app/api/ai/system/[channelId]/[...path]/route.ts:389–395`：授权false立即响应403“媒体路径未获任务授权”，尚未进入真实媒体抓取。
5. 同库video/audio媒体签名使用`task.config.model`，可以作为身份语义参考，不能因此直接绕过图片授权。

目前没有抓取生产实际签名header；根因依据是生产字段+明确内部拒绝+部署源码确定性调用+离线复现，并非捕获了真实token。

## 4. 离线复现与对照

`2026-10-22-classroom-evidence/offline-image-fallback-media-auth-20261022.cjs`从生产SHA加载真实签名、授权、generationModelId、normalizeSafeImageResult。仅存储读取/媒体获取被替换为内存fixture；签名使用显式虚构测试密钥，无生产key、用户内容或网络。

| 对照 | 实际任务config.model | 签名claim.upstreamModel | 授权结果 |
| --- | --- | --- | --- |
| 当前代码 | gpt-image-2.5-sunburst | gpt-image-2 | false；原样抛“上游图片无法通过授权媒体路径读取” |
| 仅改签名字段的对照 | gpt-image-2.5-sunburst | gpt-image-2.5-sunburst | true |
| 同正确字段但task已cancelled | 相同 | 相同 | false |
| 同正确字段但record为另一用户 | 相同 | 相同 | false |

结果同名JSON：`verified=true`。证明字段错用与应修的方向，不代表完整生产修复已验收。

## 5. 最小修复建议（需审批，未实施）

- 图片媒体签名的`upstreamModel`使用当前实际执行型号`task.config.model`，而不是原始逻辑计费型号。`logicalModel`继续保留用于显示/计费，不篡改原始选择。
- 不删除或放宽`authorizeGenerationMediaProxyRequest`的user/channel/model/url/取消检查；不能用“签名正确即放行任意任务”掩盖身份错位。
- 如果后续支持多次attempt并行交付，授权应明确绑定不可变attempt/channel/upstreamModel/URL及其持久化证据，而不能随意接受历史候选；本次最小修复不擅自扩展权限范围。
- 为`result_download_authorization`增加单独诊断原因码、逻辑与实际模型字段，区分内部授权拒绝、外部HTTP403、下载超时和存储错误，敏感URL/签名不落日志。
- 对已有失败结果，后续可在明确授权和核账后按已保存上游任务ID评估追回；不要重新发付费生成或静默把失败改成功。本轮未恢复学生节点或重放。

## 6. 验收矩阵

1. 原选与执行型号相同的直接URL模式。
2. 同渠道切到不同型号；跨渠道切到不同型号。
3. 原逻辑ID、routeLogicalModel、actual model三者不同。
4. URL结果、base64结果、异步轮询结果；base64不能绕过真实透明/图层验证。
5. 跨用户、错误channel/model/URL、expired、cancelled、无签名均拒绝。
6. 失败重试的扣费/退款幂等不变化；同task多attempt仍只计1个任务。
7. 服务端结果持久化+原画布节点刷新可见，不能只验创建HTTP200。

## 7. 课堂只读边界与补充排除

- 另以当前生产Node v22.23.4 / V8 12.4的独立临时进程对4.5MB/9MB合成响应做4组内存解析，全部未复现RangeError。无实际模型请求、无应用/数据库/文件写入，不修改主进程；这只限制“仅体积与运行时足以触发”的假设，不排除真实响应/其他处理路径。
- 新镜像后35笔终态节点抽查：21成功中19个原节点仍为success且有URL、1个原节点已不存在、1个原节点为idle/isBatchRoot；不能对后两种直接断言丢图。14个旧失败原节点显示loading，但都已绑定不同任务；后续只读查询确认当时仍有活跃任务，不擅自改成失败。
- 不把旧任务的失败状态覆盖到用户已再次生成的当前节点。本轮未写生产数据库、未改代码、未推送或部署。


### 17:26补充核验与勘误

此前“idle/isBatchRoot”仅据元数据字段存在，不是bool真值。后续查询确认该样本`isBatchRoot=false`、无children/snapshots，当前所有项目节点无精确匹配结果URL。不能以batch根解释，但仍缺历史保存/浏览器证据，不能据现状断言从未回写或擅自修学生项目。证据`idle-success-node-followup-20261022-1727.json`；详见`2026-10-22-classroom-regression-coverage-gaps.zh-CN.md`。


### 17:30部署产物核验（补强源码与实际运行版本的一致性）

只读检查实际运行容器`/app/web/.next/server/chunks/`的静态JS产物，命中图片结果下载代码；编译后的签名参数仍调用generationModelId（所归档有限片段从函数名末段`rationModelId)(e.config)`开始），后接“上游图片无法通过授权媒体路径读取”的分支。当前运行构建保留相同逻辑，非仅本机源代码。没有加载应用模块、读取环境变量/用户素材或修改构建文件。归档有限静态片段：`2026-10-22-classroom-evidence/deployed-compiled-parser-snippets-20261022-1730.json`。未产生真实模型请求。
