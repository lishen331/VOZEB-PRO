# 音色面板接线：自定义音色入口 + 分类筛选

日期：2026-11-03
前置：[2026-11-03-custom-voice-ui-implementation.zh-CN.md](2026-11-03-custom-voice-ui-implementation.zh-CN.md)（Step 3.1～3.5 已提交）

## 1. 现象与根因

测试环境画布音频节点（截图 72/73）音色仍是普通下拉：没有「我的音色 / 共享音色 / 创建音色」，千问 609 个音色只有分组标题（「精品英文音色」）没有筛选。

核对代码后是四件事叠加，不是单一遗漏：

| # | 问题 | 证据 |
|---|---|---|
| 1 | `VoiceSelector`、`CreateVoiceModal` 全项目**无人 import** | `grep -rn "VoiceSelector" src` 只命中自身文件 |
| 2 | 面板仍无条件渲染 `AudioParamSelect` | [audio-settings-panel.tsx:173](../../../web/src/components/audio-settings-panel.tsx#L173) |
| 3 | 组件依赖的 `/api/auth/settings` **不存在**（404） | [create-voice-modal.tsx:26](../../../web/src/components/create-voice-modal.tsx#L26)；真实接口是 `/api/auth/session` 与 `/api/model-catalog` |
| 4 | 客户端拿不到 `voiceCustomization` / `voicePricing` | `serializePublicIdentitySettings` 只下发站点信息；`serializeModelCatalogSettings` 有意**不下发渠道配置** |

另外两处服务端断点，接线后必然踩到：

- **5. `normalizeAudioParams` 会把 `custom:<id>` 重置为默认音色** —— 它只接受 `field.options` 里已有的值（[audio-model-params.ts:185](../../../web/src/lib/audio-model-params.ts#L185)）。
- **6. `audioUpstreamFields` 会把 `custom:<id>` 原样发给上游** —— 它直接取 `params.voiceId`（[audio-model-params.ts:219](../../../web/src/lib/audio-model-params.ts#L219)），且在 runtime 里排在 `voice: voiceId` 之后覆盖它。
- **7. `config.customVoiceId` 全项目没有任何地方赋值** —— [runtime:72](../../../web/src/lib/server/audio-task-runtime.ts#L72) 的分支是死代码，因此不会校验归属/模型/渠道，也不会更新 `lastUsedAt`。

## 2. 范围

### 2.1 新增：音色能力查询接口

`GET /api/custom-voices/capabilities?ttsModel=<model>`

- 登录用户可访问；匿名 401。
- 返回 `{ enabled: boolean, config?: VoiceCustomizationConfig, pricing?: { usdToCny, pointsPerYuan } }`。
- `config` 复用 `normalizeVoiceCustomization`，只用于前端算价与限制展示；**不包含 apiKey**（`normalizeVoiceCustomization` 本就不返回凭据）。
- 命中条件与 `POST /api/custom-voices` 一致：渠道 `models` 含该模型且 `advancedConfig.voiceCustomization` 存在。
- `voicePricing` 未配置时不下发 `pricing`，前端按禁用处理。

理由：客户端音色面板需要知道「当前模型能不能创建音色、创建要扣多少积分」，而 `/api/model-catalog` 刻意不下发渠道配置。新接口只暴露该模型对应的那一份音色配置，攻击面小于放开整个 catalog。

### 2.2 面板接线

`AudioModelParamsPanel` → `AudioParamControl` 增加 `model` 参数（面板已有 `model`），`select` 分支改为：

```ts
if (field.key === "voiceId") return <VoiceSelectorRow ... />;
```

`VoiceSelectorRow` 是新组件，职责是把 `VoiceSelector` 塞进原来 `[72px | 1fr | 24px]` 的网格里，保持与其它字段左对齐，并让选中值正常回写 `params.voiceId`。

降级策略（保证正式画布不受影响）：

- `GET /api/custom-voices/capabilities` 返回 `enabled: false` 或请求失败 → 渲染原来的 `AudioParamSelect`，界面与现在完全一致。
- 已保存节点里的 `voiceId` 若不在当前列表（例如渠道配置被关掉后的 `custom:xxx`），显示为「已失效的自定义音色」，允许用户改回预置音色。

### 2.3 分类筛选（下拉筛选框，已确认）

`VoiceSelector` 的「音色库」tab，在搜索框**左侧**加一个分类下拉：

```
[全部 ▾]  🔍 搜索音色            [+ 创建音色]
```

- 选项来自当前音色列表去重后的 `option.group`（旗舰 / 多语种与方言 / 精品中文 / 精品英文 / 其他 / 小语种 / 基础音色），第一项恒为「全部」。
- 与搜索框是**与**关系：先按分类过滤，再按关键词过滤。
- 切换模型后分类列表重算；当前分类不存在时回落到「全部」。
- MiniMax 16 个预置音色没有 `group`，此时不渲染筛选框（分类为空）。
- 「我的音色 / 共享音色」tab 不显示分类筛选。

### 2.4 服务端：自定义音色参数贯通

1. `normalizeAudioParams`：`select` 类型允许 `custom:<uuid>` 形式的值原样保留（不校验长度，只校验前缀与前缀后非空）。
2. `POST /api/audio-tasks`：从 `params.voiceId` 解析 `custom:<id>`，写入 `config.customVoiceId`，并把 `params.voiceId` 置为上游真实音色 ID 之外的占位（见下条）。
3. 候选渠道过滤：存在 `customVoiceId` 时，只保留该音色 `channelId` 对应的渠道（音色与渠道强绑定，runtime 已有 `channelId` 校验，提前过滤可以避免"重试到别的渠道必然失败"）。
4. `audioUpstreamFields`：遇到 `custom:<id>` 时输出 `voice: undefined`，让 runtime 解析出的 `voiceId` 生效，不把内部 ID 发给上游。
5. runtime 的 `customVoiceId` 分支保持现有校验逻辑不动（归属、状态、模型、渠道、`lastUsedAt`）。

### 2.5 `CreateVoiceModal` 数据源修正

把 `/api/auth/settings` 换成 `/api/custom-voices/capabilities?ttsModel=`，删除对 `systemChannels` 的遍历。同时去掉 `pointsPerYuan: 0` 的兜底——未配置时直接禁用「创建音色」按钮并提示「管理员尚未配置音色定价」，而不是显示扣 0 积分。

## 3. 不做的事

- 不改 `AudioParamSelect` 的通用行为（其它 select 字段零影响）。
- 不给音色列表加虚拟滚动：609 项现在是 `max-h-[400px]` 的普通滚动 + 搜索，加分类筛选后可用性已够；如后续实测卡顿再单独处理。
- 不做音色重命名/删除/分享的 UI（接口已有 PATCH/DELETE，等有需求再接）。
- 不动「共享音色」的可见性规则。

## 4. 测试计划

单测：

- `capabilities` 接口：命中 / 未命中 / 未登录 / 未配置定价四种返回。
- `normalizeAudioParams`：`custom:<uuid>` 保留、`custom:` 空 ID 回落默认、非 `custom:` 的未知值仍回落默认。
- `audioUpstreamFields`：`custom:<id>` 时 `voice` 为 undefined；普通 ID 行为不变（回归）。
- `/api/audio-tasks`：`customVoiceId` 正确落库、候选渠道被过滤到音色所属渠道。
- 分类筛选：`filterVoicesByGroup` 纯函数——全部 / 单分类 / 分类 + 关键词 / 模型无分类。

回归：

- 现有千问、MiniMax、Suno、OpenAI 四家的 `normalizeAudioParams` 与 `audioUpstreamFields` 全部旧用例必须保持绿。
- `VoiceSelector` 未启用时面板渲染树与改动前一致（快照或断言 `AudioParamSelect` 存在）。

手工（测试环境）：

1. 未配置 `voiceCustomization` 的渠道打开参数面板 → 与现在一致。
2. 配置后打开 → 三栏 + 创建按钮；切到「精品英文」只剩该分类；搜「Luna」只剩 Luna。
3. MiniMax 渠道 → 无分类筛选框，我的音色可创建克隆音色。
4. 用自定义音色发起合成 → 上游收到的是 `upstreamVoiceId`，任务成功。

## 5. 风险

- **正式画布已投产**：2.4 的 2～4 条改动会碰到音频任务的公共路径。`custom:` 是新增前缀，非该前缀的取值走原逻辑，`customVoiceId` 为空时行为不变。仍需在测试环境验证四家模型各合成一次后再上线。
- **`/api/custom-voices/capabilities` 是新增公开接口**：只返回模型对应的音色配置（无凭据、无渠道密钥），需要登录。

## 6. 确认点

- [ ] 2.1 新增能力查询接口（而不是放宽 `/api/model-catalog`）
- [ ] 2.2 接线 + 降级到原下拉
- [ ] 2.3 分类下拉筛选（放在搜索框左侧）
- [ ] 2.4 服务端 `custom:` 贯通（含正常音频路径改动）
- [ ] 2.5 CreateVoiceModal 数据源修正

确认后按 2.1 → 2.5 顺序实现，每步单独提交，全部通过后推 develop 由 Actions 部署测试环境。
