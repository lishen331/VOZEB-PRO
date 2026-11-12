# 练习模型池拆成五个能力池

- 日期：2026-11-03
- 状态：待确认
- 前置：`2026-11-03-channel-practice-enable-split.zh-CN.md`（已实现并推送）

## 1. 问题

练习池目前是**一个平面池**：`practiceModelPool.models: Record<模型名, boolean>`。

由此产生两个后果：

1. **勾选只有一份**，同一个上游模型无法「在文本池里、不在图片池里」——但模型确实可以同时具备两种能力（比如 `gpt-4.1` 既能文本又能看图）。
2. **界面只有一个列表**，顶部那个能力筛选器（`Segmented`：全部/文本/图片/视频/音频）在当前构建里渲染成一个空方块，既是坏的，也表达不了「每个池子独立配置」。
3. 右侧「默认模型」有 **五个字段**（默认文本 / Canvas 图片理解 / 默认图片 / 默认视频 / 默认音频），池子却只有一个，选默认模型时无法按池子限定范围。

实测：练习池统计 总计 18 / 已选 18 / 文本 18 / 图片 0 / 视频 0 / 音频 0 —— 因为只有「模汇x中漫 API 渠道」（纯文本）开了练习开关，其余图片/视频/音频渠道的练习开关是关的。

## 2. 目标

池子按能力分五个，与右侧五个默认模型字段一一对应：

| 池子 key | 名称 | 对应默认字段 | 候选来源 |
| --- | --- | --- | --- |
| `text` | 文本 | `textModel` | 练习渠道中 capability=text 的模型 |
| `vision` | 文本图片理解 | `visionModel` | 同上，且 `supportsImageInput=true` |
| `image` | 图片 | `imageModel` | capability=image |
| `video` | 视频 | `videoModel` | capability=video |
| `audio` | 音频 | `audioModel` | capability=audio |

要点：
- 一个模型可以同时属于 `text` 和 `vision`（前者是全集，后者是子集）。
- 每个池子**独立勾选**，互不影响。
- 未勾选的模型只从该池排除，不影响渠道本身、也不影响它在别的池子里的状态。

## 3. 数据模型

`web/src/lib/auth/store-types.ts`：

```ts
export type PracticePoolKind = "text" | "vision" | "image" | "video" | "audio";

export type PracticeModelPoolConfig = {
    /** 旧的平面池，保留用于向后兼容。pools 存在时以 pools 为准。 */
    models?: Record<string, boolean>;
    /** 五个能力池，各自独立勾选。 */
    pools?: Partial<Record<PracticePoolKind, Record<string, boolean>>>;
    version?: number;
};
```

判定规则（每池独立）：

```
inPool(kind, model) =
  pools[kind]?.[key] !== false            // pools 存在时
  否则 models?.[key] !== false            // 回退旧平面池
```

## 4. 服务端

**候选接口** `GET /api/admin/practice-model-pool/candidates`

改为按池返回：

```ts
{
  pools: {
    text:   [{ upstreamModel, channelId, channelName, modelKey, inPool, supportsImageInput }],
    vision: [...],
    image:  [...],
    video:  [...],
    audio:  [...],
  },
  stats: { text: {total, inPool}, vision: {...}, ... }
}
```

候选来源统一：`channelUsableForSurface(channel, "open-source-practice")`（沿用上一版已落地的 helper）。

**保存接口** `PATCH /api/admin/practice-model-pool`

```ts
{ pool: "text" | "vision" | "image" | "video" | "audio", updates: { [modelKey]: boolean } }
```

写入 `pools[pool][modelKey]`。旧的 `{ updates }` 形式继续支持，写入 `models`（兼容脚本）。

**运行期** `practiceCanvasPoolCandidates(settings, capability, requestedModel)`

按下发的 capability 选对应池：
- `text` / `image` / `video` / `audio` → 直接查同名池
- `vision` 不参与画布路由，只用于「Canvas 图片理解模型」下拉

池内排除逻辑替换现有的 `poolConfig[modelName]` 平面判断。

## 5. 界面（`practice-model-pool-manager.tsx`）

- 删掉顶部那个坏掉的 `Segmented` 能力筛选器。
- 改为 **5 个区块**，竖向排列，每个区块：
  - 抬头：池子名 + `已选 n / 共 m`
  - 全选 checkbox（indeterminate 半选状态）
  - 模型行：名称 + 渠道名 + 复选框
  - 空态文案：`该池暂无候选——把图片/视频/音频渠道的「练习」开关打开后即可出现`
- 每个区块有自己的搜索框（或共用一个、只过滤当前区块——取共用全局搜索，按池过滤）。
- 视觉上沿用现有卡片风格，不引入新组件库。

## 6. 与右侧默认模型的关系

右侧 `availableDefaultFields` 已经有五个字段。改动后：

- 字段下拉的候选 = **该字段对应池里已勾选的模型**
- 池子里一个都没勾时，该字段下拉为空，并提示「请先在练习模型池勾选」

这样「池子」和「默认模型」是同一件事的两面，不会出现「池里有但下拉里没有」的错位。

## 7. 验证

1. 文本池勾 3 个、图片池勾 2 个 → 右侧默认文本/图片模型下拉各自只剩这 3 个 / 2 个
2. 取消文本池一个 → 默认文本模型下拉立刻少一个；图片池不受影响
3. `vision` 池只列 `supportsImageInput` 的文本模型
4. 练习画布请求 `gamatext` → 只从文本池已勾选模型里随机
5. 旧数据（只有 `models` 平面表）升级后：五个池都按 `models` 的勾选状态初始化，行为不变
6. `tsc` + `vitest src/lib src/stores src/components/admin src/app/api` 全绿

## 8. 不在本次范围

- 图片/视频/音频渠道的练习开关是否打开，属于运营配置，不在代码里预设
- RunningHub 工作流池（它走的是 workflow 而不是模型，保持现状）
