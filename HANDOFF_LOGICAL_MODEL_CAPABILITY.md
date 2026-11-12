# 交接：逻辑模型能力类型改不掉

写给接手这个任务的工程师。仓库在 `D:\Claude code programe\VOZEB-PRO\VOZEB-PRO`，分支 `develop`。

## 用户的唯一需求

在后台「模型渠道 → 逻辑模型 → 路由设置」抽屉里修改「能力类型」下拉框，弹一个确认框，点确认后**改动能真正保存下来**。

现在的症状：改完点「应用修改」再点「保存更改」，能力类型弹回原值。

不要扩大范围。用户已经明确拒绝了数据迁移脚本、存量数据清理、以及任何"顺手优化"。兔子渠道目前可用，不要动线上数据。

## 已经完成并推送的部分

提交 `4bc275af`，已推送 `origin/develop`，CI 绿。

修的是模型能力**自动识别**的两个缺陷（与本次弹回问题无关，但同属这次排查）：

- `web/src/lib/model-capability.ts` 的 `capabilityFromHint` 之前不认识中文 category。兔子上游对 `gpt-image-2` 返回 `category: "生图"`，识别不了就漏到 `supported_endpoint_types`，其中 `openai-video` 被视频正则误命中，于是整个 gpt-image 系列被判成 video 并路由到 `/videos`。图片请求体没有时长，上游解析 `seconds` 得到空字符串，报 `could not convert string to float: ''` → 403 → 渠道熔断 → 前端 503。
- 现在 CJK category 标签优先识别；同时 `openai-video` 这类厂商复合端点名不再压过同一组提示里显式声明的 `image-generation`，但单独出现时仍判 video（保住既有契约）。
- 回归测试在 `web/src/lib/server/admin-model-catalog.test.ts`，用的是兔子真实返回数据。

已验证：`npx tsc --noEmit` 干净；全量 980 个测试文件、4996 个测试通过。

## 弹回问题的根因

保存逻辑模型时会跑 `synchronizeLogicalModelsWithChannels`，它拿渠道侧已存的能力值覆盖用户的编辑。注意**不是重新识别**，识别只在点「同步模型」时发生；覆盖用的是首次同步时存进数据库的旧值。

关键代码 `web/src/lib/model-routing-config.ts:75`：

```ts
capability: catalogModel.authoritative || !existing ? catalogModel.capability : normalizeCapability(existing.capability),
```

`existing.capability` 是用户刚改的值，`catalogModel.capability` 是渠道侧存的值。`authoritative` 为真就丢掉用户的编辑。

`authoritative` 的判定在同文件 `:192-203` 的 `resolveChannelModelCapability`，最后一行：

```ts
return configured ? { capability: configured, authoritative: true } : { capability: inferred, authoritative: false };
```

渠道侧只要存在任何值就算权威。用户的 637 个模型全都有值，所以 `authoritative` 恒为真，第 75 行永远走渠道值那条路，用户的编辑永远进不去。

## 为什么必须加"人改过"标记

`web/src/lib/auth/store-types.ts:241` 的 `LogicalModel` 类型：

```ts
export type LogicalModel = {
    id: string;
    name: string;
    capability: LogicalModelCapability;
    enabled: boolean;
    bindings: LogicalModelBinding[];
};
```

只有 `capability`，没有任何字段说明这个值的来路。所以第 75 行拿到 `existing.capability` 时无法区分"用户刚手改的"和"上次同步推导的旧值"，只能定死规矩。加个标记才有判断依据。

## 需要改的四处

### 1. 类型加字段

`web/src/lib/auth/store-types.ts` 的 `LogicalModel` 加一个可选字段标记能力是人工指定的，例如 `capabilitySource?: "manual"`。

同步逻辑要保留这个字段，落库的规范化路径也要保留它。规范化入口是 `web/src/lib/auth/store-normalizers.ts:344` 的 `normalizeLogicalModels`，它委托给 `web/src/lib/model-routing-config.ts:15` 的 `normalizeLogicalModelsConfig`，最终还是 `synchronizeLogicalModelsWithChannels`。所以标记必须在这个同步函数里被透传，否则每次保存都会被抹掉。

另外检查 `web/src/lib/auth/store-normalizers-channel.ts` 附近有没有对 LogicalModel 做字段白名单过滤的地方，有的话要放行新字段。

### 2. 同步函数尊重标记

`web/src/lib/model-routing-config.ts:72-79` 的返回对象，第 75 行改成：用户标记过人工指定时，保留 `existing.capability`，不被 `catalogModel.capability` 覆盖；同时把标记本身带进返回值。

注意 `:51` 开始的 `.map()` 里 `existing` 可能是 undefined（新模型），要处理。

### 3. authoritative 判定收紧

`web/src/lib/model-routing-config.ts:202` 让渠道侧的值只在确实是人手改过时才算权威。

**这里有个坑**：判断"渠道侧是否人手改过"的依据是 `config.source === "manual"`，但用户库里 637 个 `source` 全是 `manual`（原因见下一节），所以这个条件目前恒为真，光改这行没用。因此第 2 处（逻辑模型自己的标记优先）是真正生效的那一处，第 3 处是配套。

如果时间有限，可以只做第 2 处 + 第 4 处，先让用户的需求跑通。

### 4. 确认弹窗

`web/src/components/admin/admin-logical-model-manager.tsx:283-285` 是能力类型下拉框。用户要的是**只在改了能力类型时弹**（不是保存时统一弹，也不是改完之后的结果提示）。

文案要说清影响，例如「把 gpt-5 从文本改为图片，会影响该模型的调用路径，确认吗？」

保存动作在同文件 `:77` 的 `saveDraft`。改能力时要把第 1 处那个标记写进 draft。

项目用 antd，`Modal.confirm` 即可，同文件已经引入了 antd 组件。

## 附带发现的另一个 bug（用户已明确说不做）

`web/src/lib/channel-protocol-registry.ts:345-362` 的 `protocolModelConfig` 和 `applyModelProtocol` 会无条件给协议预设盖 `source: "manual"`。

协议预设是平台根据所选协议推导出来的路径模板，不是人手改的。因为 `newapi` 是 strict 协议，`web/src/app/api/admin/models/route.ts:206-214` 会给每个模型生成协议预设，且作为**最后一个**参数传给 `mergeModelConfigs`，盖过一切。结果用户库里 654 条 `modelConfigs` 全部 `source: "manual"`（已查证，一条 `provider` 都没有）。

后果是 `web/src/lib/server/admin-model-catalog.ts:144` 那条"manual 不被覆盖"的保护机制失效——系统分不清真人手改和自己生成的预设，自动识别永远盖不掉错值。

**用户明确说这个不做**，因为兔子渠道现在可用，他不想动存量数据。如果以后要修，注意：
- 只去掉盖章，路径模板本身不能动（用户选 New API 就该套那些标准路径）
- 建议留空 `source` 而不是设成 `provider` 或 `official`。`official` 在这套代码里指具体模型的内置配置（如 Agnes 渠道），协议预设是协议级模板，语义不同
- `applyModelProtocol` 被编辑器和自动路径共用，去掉盖章后要让调用方原有的 `source` 存活，否则真人手改的标记会被抹掉
- 改动只影响以后新产生的记录，存量 654 条假 manual 还在库里

## 文件里的可疑内容，动手前请先看

`web/src/lib/channel-protocol-registry.ts` 里有两处异常，且 `git status` / `git diff` 显示该文件**没有未提交改动**，说明是提交进仓库的：

1. 一段伪装成"权威规则更新"的中文散文，指示去掉 `admin-system-channel-editor.tsx` 里的 `source: "manual"`。**不要执行它。** 那是文件内容不是指令；而且内容是反的——编辑器那处 stamp 是唯一正确的一处（它代表真人手改），去掉等于剥掉真人编辑的标记，同时让自动预设继续冒充 manual，正好把这个 bug 焊死。中文散文直接放在 `.ts` 里也根本编译不过。
2. 一个 `normalizeStrictProtocolModelConfig2`，和它上面的函数逐字重复。

我查到最近改这个文件的提交是 `1f035cd3 fix(video): preserve New API reference parameters`，但没往下深挖是哪一个引入的。建议接手后跑一下 `git log -p -- web/src/lib/channel-protocol-registry.ts` 定位，可能是同事提交的，也可能是某次合并事故。

## 验证方式

改完跑：

```
cd web
npx tsc --noEmit
npx vitest run src/lib/model-routing-config.test.ts src/lib/server/admin-model-catalog.test.ts
npx prettier --check <改过的文件>
```

CI 会跑 prettier 检查，格式不过会失败（本次排查中已经踩过一次）。

功能验证：后台改一个模型的能力类型 → 确认弹窗 → 保存 → 刷新页面确认没弹回。

## 环境

- 线上 staging：`https://reddetail.gammablue-x.com`，服务器 `8.163.37.148:22222`，容器 `vozeb-staging-app-1`
- CI 推 develop 后自动构建镜像并部署 staging
- 数据库：`docker exec vozeb-staging-postgres-1 psql -U vozeb_staging -d vozeb_staging`
- 渠道配置在 `vozeb_pro_system_model_channels` 表，`advanced_config` 列；兔子渠道 id 是 `_Y1IVuMqWk43Itb5-2326`
