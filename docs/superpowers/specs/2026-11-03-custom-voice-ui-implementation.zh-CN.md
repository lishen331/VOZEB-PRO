# 自定义音色 UI 实现方案

**日期**: 2026-11-03  
**前置**: `2026-10-09-custom-voice-minimax-qwen.zh-CN.md` Step 2 已完成（qwen 597 基础音色 + 3.1 模型支持）  
**目标**: 实现音频设置面板的自定义音色管理界面（Step 3）

## 1. 现状分析

### 1.1 音色选择当前实现

- `components/audio-settings-panel.tsx` 的 `AudioParamSelect` 组件渲染音色下拉框
- `lib/audio-model-params.ts` 定义 `voiceId` 字段为 select 类型，options 列表包含预置音色
- MiniMax: 16 个预置音色（`minimaxVoiceOptions`）
- Qwen: 597~736 个音色（`qwenCatalogVoices(model)`），已支持试听按钮

### 1.2 需要添加的功能

根据规格文档第 6 节：

1. **音色弹窗分三栏**：音色库（预置）、我的音色、共享音色
2. **创建音色按钮**：打开弹窗，包含克隆和设计两个标签页
3. **克隆界面**：上传音频 + 授权勾选 + 格式/时长/大小校验
4. **设计界面**：声音描述 + 试听文本 + 字数限制
5. **扣费预览**：提交前显示将扣积分
6. **我的音色列表**：显示过期倒计时（MiniMax 未使用时 7 天）
7. **共享音色列表**：其他用户分享的音色

## 2. 架构决策

### 2.1 不修改 AudioParamSelect，创建新组件

原因：
- `AudioParamSelect` 是通用的参数选择器，用于所有 select 类型字段
- 音色选择有特殊需求（标签页、创建按钮、试听、倒计时），逻辑复杂度高
- 修改通用组件会影响其他字段（如格式、采样率等）

方案：
- 保留 `AudioParamSelect` 用于非音色字段
- 创建 `VoiceSelector` 专用组件，在 `AudioParamControl` 中针对 `voiceId` 字段特殊处理

### 2.2 音色数据结构

```ts
type PresetVoice = AudioParamOption;  // 现有结构
type CustomVoice = {
  id: string;
  name: string;
  kind: "clone" | "design";
  status: "creating" | "ready" | "failed";
  provider: "minimax" | "qwen";
  ttsModel: string;
  upstreamVoiceId?: string;
  previewUrl?: string;
  previewMimeType?: string;
  failureReason?: string;
  shared: boolean;
  ownerUserId: string;
  expiresAt?: string;  // MiniMax 未使用时 7 天过期
  createdAt: string;
};
```

### 2.3 组件层次

```
AudioModelParamsPanel
  └─ AudioParamControl
       └─ VoiceSelector  (key === "voiceId" 时渲染)
            ├─ Tabs: ["音色库", "我的音色", "共享音色"]
            ├─ CreateVoiceButton
            └─ VoiceList (每个 tab 一个)
                 └─ VoiceItem (preview button + 过期倒计时)

CreateVoiceModal
  ├─ Tabs: ["克隆", "设计"]
  ├─ CloneTab
  │    ├─ AudioUploader (格式/时长/大小校验)
  │    ├─ ConsentCheckbox
  │    └─ PointsPreview
  └─ DesignTab
       ├─ PromptInput (字数限制)
       ├─ PreviewTextInput (字数限制)
       └─ PointsPreview
```

## 3. API 接口

已有实现：
- `GET /api/custom-voices?ttsModel=&shared=&includeOwned=`
- `POST /api/custom-voices` (body: kind, name, ttsModel, audioData?, audioFormat?, prompt?, previewText?)

需要补充：
- `PATCH /api/custom-voices/[id]` (name, shared)
- `DELETE /api/custom-voices/[id]`
- `GET /api/custom-voices/[id]` (刷新 creating 状态)

## 4. 实现步骤

### Step 3.1: 自定义音色 CRUD 接口（后端）

1. 创建 `web/src/app/api/custom-voices/[id]/route.ts`
   - GET: 查询单条，千问 creating 时调 query_voice 刷新
   - PATCH: 改名/分享（仅 owner）
   - DELETE: 调上游删除后标记 deleted（仅 owner）

2. 测试已有 POST /api/custom-voices 接口功能完整性

### Step 3.2: VoiceSelector 组件（前端核心）

1. 创建 `web/src/components/voice-selector.tsx`
   - Tabs 切换三种音色列表
   - 预置音色列表：从 audioParamField.options 读取
   - 自定义音色列表：调 GET /api/custom-voices
   - 试听按钮：复用 `useVoicePreview` hook
   - 过期倒计时：MiniMax creating 音色显示 7 天倒计时

2. 修改 `AudioParamControl` 函数
   - 检测 `field.key === "voiceId"`
   - 渲染 `VoiceSelector` 替代 `AudioParamSelect`

### Step 3.3: 创建音色弹窗（前端交互）

1. 创建 `web/src/components/create-voice-modal.tsx`
   - 克隆 tab: 音频上传 + 格式校验 + 授权勾选
   - 设计 tab: prompt + previewText + 字数限制
   - 积分计算：从 channel.advancedConfig.voiceCustomization 读取 pricing

2. 调用 POST /api/custom-voices 提交

### Step 3.4: 合成集成（audio-task-runtime）

1. 修改 `web/src/lib/server/audio-task-runtime.ts`
   - 检测 `config.customVoiceId` 参数
   - 验证音色 ready、owned/shared、模型匹配
   - 替换 voiceId 为 upstreamVoiceId
   - 更新 lastUsedAt（防止 MiniMax 过期）

2. 修改 `web/src/app/api/audio-tasks/route.ts`
   - 任务创建时过滤渠道：customVoiceId 存在时只用 voice.channelId

### Step 3.5: 管理后台（系统设置）

1. 渠道编辑器添加 voiceCustomization JSON 编辑框
   - 保存时校验字段
   - 提供 MiniMax 和 Qwen 默认模板

2. 系统设置添加 voicePricing 字段编辑
   - usdToCny: 美元兑人民币汇率
   - pointsPerYuan: 每元人民币对应积分

## 5. 测试计划

### 5.1 单元测试

- custom-voice-store.ts 两种存储模式（postgres / json）
- custom-voice-upstream.ts 两家上游适配器（mock fetch）
- 权限：别人的未共享音色返回 403
- 扣费与失败退款

### 5.2 集成测试

测试环境 http://8.163.37.148:3001 真实创建音色：

1. MiniMax 克隆 + 设计各一个
2. Qwen 克隆 + 设计各一个
3. 验证合成时 customVoiceId 正确替换
4. 验证过期倒计时显示
5. 验证共享音色在其他账号可见

### 5.3 类型检查和代码质量

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## 6. 风险和注意事项

### 6.1 Production Isolation

- 正式画布已投产，audio-task-runtime 和 audio-tasks/route 的改动必须向后兼容
- customVoiceId 是新增可选参数，不影响现有合成任务
- 部署前在测试环境充分验证

### 6.2 千问克隆异步轮询

- 创建返回 creating 状态，需前端定时 GET [id] 刷新
- 超时 60 秒后保持 creating，由用户手动刷新

### 6.3 MiniMax 音色过期

- 未使用的音色 7 天后被删除
- 每次合成时更新 lastUsedAt，但上游列表查不到未使用音色
- 前端显示倒计时提示用户及时使用

## 7. 部署顺序

1. **后端接口** (Step 3.1): PATCH/DELETE/GET [id] 接口
2. **VoiceSelector 组件** (Step 3.2): 三栏音色列表
3. **创建弹窗** (Step 3.3): 克隆/设计界面
4. **合成集成** (Step 3.4): customVoiceId 处理
5. **管理后台** (Step 3.5): 配置编辑器

每步完成后提交到 develop 分支，GitHub Actions 自动部署到测试环境验证。

---

**决策点确认**：

- 是否采用新组件 VoiceSelector 而不是修改 AudioParamSelect？
- 音色数据是否需要前端缓存（React Query / SWR）？
- 是否需要音色搜索功能（预置音色已有 597 个）？
