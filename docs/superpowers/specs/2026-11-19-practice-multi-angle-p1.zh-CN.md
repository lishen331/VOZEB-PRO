# 多角度练习 P1 · 接入真实 AI 生成

日期：2026-11-19  
状态：待开发。需求已对齐，可直接开工。  
前置：P0 已验收（CI 全绿，测试服 `/practice/multi-angle` 可用）。  
取代：`2026-11-18-practice-multi-angle-standalone.zh-CN.md` 第六节 §P1。

---

## 一、目标

把多角度练习页「生成」按钮从 P0 的本地 canvas 演示渲染换成真实 AI 生成，复用现有练习会话链路，不新增后端接口，不动单项练习（character / scene / prop 面板）。

---

## 二、模型池路由策略

前端提交会话时传 `logicalModelId: "gamaimage"`。  
这是画布的虚拟模型名，后端见到它就从所有 `open-source-practice` image 渠道里随机选一个执行，与画布无限练习行为完全一致，不绑定任何特定工作流。

后端需要在 `resolvePracticeModelFromSettings`（[practice-session-service.ts:463](../../web/src/lib/server/practice-session-service.ts)）现有逻辑**最开头**加一个豁免分支，让 `gamaimage` 请求直接走 `resolvePracticeCanvasPoolCandidates` 而非 RunningHub workflow 匹配路径。详见第四节。

---

## 三、提示词策略

复用画布已有的 `buildAnglePrompt` / `buildAngleLabel`，把多角度页的 `h / p / d / fisheye / promptOn` 映射到 `CanvasImageAngleParams` 后调用。

### 3.1 新建共享模块

新建 `web/src/lib/angle/angle-presets.ts`，把 `buildAngleLabel` 和 `buildAnglePrompt` 从 [`canvas-page-utils.ts`](../../web/src/app/(user)/canvas/[id]/canvas-page-utils.ts) 移入（`SHOT_SIZE_LABELS` 也随之移入），并在 `canvas-page-utils.ts` 原位置保留 re-export，不改画布任何调用点。

```ts
// web/src/lib/angle/angle-presets.ts
// 从 canvas-page-utils.ts 移入，逻辑不变
export type CanvasAngleshotSize = "closeup" | "near" | "medium" | "wide" | "far";
export type CanvasImageAngleParams = { horizontalAngle: number; pitchAngle: number; shotSize: CanvasAngleshotSize; wideAngle: boolean; usePrompt: boolean };
const SHOT_SIZE_LABELS: Record<CanvasAngleshotSize, string> = { closeup: "特写", near: "近景", medium: "中景", wide: "全景", far: "远景" };
export function buildAngleLabel(params: CanvasImageAngleParams): string { /* 原逻辑 */ }
export function buildAnglePrompt(params: CanvasImageAngleParams): string { /* 原逻辑 */ }
```

> 注：移入前先跑 `node scripts/sync-drama-canvas-runtime.mjs` 确认镜像目录不受影响（画布有双镜像机制）。

### 3.2 多角度参数 → CanvasImageAngleParams

新建辅助函数放在 `web/src/app/(user)/practice/multi-angle/lib/angle-model.ts`：

```ts
import type { CanvasImageAngleParams, CanvasAngleshotSize } from "@/lib/angle/angle-presets";

/** 把多角度页内部参数映射到画布角度参数，供 buildAnglePrompt 使用。 */
export function toCanvasAngleParams(h: number, p: number, d: number, fisheye: boolean, promptOn: boolean): CanvasImageAngleParams {
    // 摄像头模式 h ∈ [0,360)，主体模式 h ∈ [-180,180]。统一归入 -180..180 再传出
    const horizontalAngle = h > 180 ? h - 360 : h;
    const shotSize: CanvasAngleshotSize =
        d <= 2 ? "closeup" : d <= 4 ? "near" : d <= 6.5 ? "medium" : d <= 8.5 ? "far" : "wide";
    return { horizontalAngle, pitchAngle: p, shotSize, wideAngle: fisheye, usePrompt: promptOn };
}
```

### 3.3 最终提示词组装

每个机位提交前组装：

```ts
import { buildAnglePrompt } from "@/lib/angle/angle-presets";
import { toCanvasAngleParams } from "./lib/angle-model";

const anglePrompt = buildAnglePrompt(toCanvasAngleParams(h, p, d, fisheye, promptOn));
const finalPrompt = [anglePrompt, prompt.trim()].filter(Boolean).join(" ");
// finalPrompt 作为 input.prompt 传给 createSession
```

---

## 四、后端：`resolvePracticeModelFromSettings` 豁免分支

文件：[`web/src/lib/server/practice-session-service.ts:463`](../../web/src/lib/server/practice-session-service.ts)

在现有函数体第一行（`const capability = ...` 之前）插入：

```ts
// 多角度练习走画布 image 池：随机命中任一 open-source-practice image 渠道，
// 不走 RunningHub workflow 匹配路径，行为与画布 gamaimage 一致。
if (rawModelName(requestedLogicalModelId || "").toLowerCase() === "gamaimage") {
    const { resolvePracticeCanvasPoolCandidates } = await import("./runninghub-workflow-runtime");
    const candidates = resolvePracticeCanvasPoolCandidates(settings, "image");
    const selected = candidates[0];
    if (!selected) throw new PracticeServiceError("练习 image 池暂无可用渠道", 503, "PRACTICE_MODEL_UNAVAILABLE");
    // 返回空 logicalModelId + capability；downstream 路由依赖 candidate channel 而非 logicalModelId
    return { logicalModelId: selected.logicalModelId || "", capability: "image" };
}
```

> `rawModelName` 已在该文件所在目录可用（`runninghub-workflow-runtime` 导出）。  
> 返回值无 `workflow` 字段——下游路由对 `gamaimage` 请求已有对应处理，与画布同路径。

---

## 五、前端：multi-angle-workbench.tsx 改动

P1 的改动集中在两处：**图片上传** 和 **generate 函数**。其他状态、拖拽、球控、参数面板、CSS 全部不动。

### 5.1 新增 import

```ts
import { practiceApi } from "@/services/api/practice";
import { uploadImage } from "@/services/image-storage";
import type { UploadedImage } from "@/services/image-storage";
import { buildAnglePrompt } from "@/lib/angle/angle-presets";
import { toCanvasAngleParams } from "./lib/angle-model";
```

### 5.2 state 变更

```ts
// 现有
const [image, setImage] = useState<string | null>(null);         // 保留，用于本地预览
// 新增
const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
const [uploading, setUploading] = useState(false);
```

### 5.3 图片上传

现有 `acceptFile` 读取 data URL 后，同步触发上传：

```ts
const acceptFile = useCallback((file: File | null | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    setUploadedImage(null);
    const reader = new FileReader();
    reader.onload = () => {
        if (typeof reader.result === "string") setImage(reader.result);
    };
    reader.readAsDataURL(file);
    uploadImage(file)
        .then((uploaded) => { if (aliveRef.current) setUploadedImage(uploaded); })
        .catch(() => { if (aliveRef.current) message.error("图片上传失败，请重试"); })
        .finally(() => { if (aliveRef.current) setUploading(false); });
}, [message]);
```

### 5.4 generate 函数替换

用真实 AI 会话替换 P0 的本地 canvas 渲染循环。  
新版 `generate` 保持现有的 jobs 构造、`aliveRef` 检查和 `setShots` / `setRuns` 更新结构，只换内部执行逻辑：

```ts
const generate = useCallback(async () => {
    if (!uploadedImage || generating || uploading) return;
    setGenerating(true);

    const snap = { ...live.current };
    const jobs: Array<{ h: number; p: number; name: string }> =
        batch === 1
            ? [{ h: snap.h, p: snap.p, name: singleShotName(preset, snap.h, snap.p) }]
            : BATCH_ANGLES[batch].map((angle) => ({ ...angle }));

    setShots(jobs.map((job) => ({ name: job.name, url: null, sessionId: undefined, status: "queued" as const })));
    setRunMeta({ total: jobs.length, distance: snap.d, wideAngle: snap.fisheye, cameraMode: snap.mode === "camera" });

    for (const [index, job] of jobs.entries()) {
        if (!aliveRef.current) break;
        const anglePrompt = buildAnglePrompt(toCanvasAngleParams(job.h, job.p, snap.d, snap.fisheye, promptOn));
        const finalPrompt = [anglePrompt, prompt.trim()].filter(Boolean).join(" ");
        try {
            const { session } = await practiceApi.createSession({
                module: "character",
                mode: "workflow",
                title: `多角度练习 · ${job.name}`,
                logicalModelId: "gamaimage",
                input: { prompt: finalPrompt, angle: { h: job.h, p: job.p, d: snap.d, fisheye: snap.fisheye } },
                references: [{ type: "asset", id: uploadedImage.storageKey, inputKey: "referenceImage" }],
                clientRequestId: crypto.randomUUID(),
            });
            if (!aliveRef.current) break;
            // 轮询会话，直到 success / failed
            const url = await pollSession(session.id);
            setShots((prev) => prev.map((shot, i) => i === index ? { ...shot, url, status: url ? "success" : "failed" } : shot));
        } catch {
            if (!aliveRef.current) break;
            setShots((prev) => prev.map((shot, i) => i === index ? { ...shot, status: "failed" } : shot));
        }
    }

    setGenerating(false);
    // 收集成功图 URL 写入 runs（同 P0 结构）
    // ...
}, [uploadedImage, uploading, generating, batch, preset, prompt, promptOn]);
```

### 5.5 pollSession 辅助函数

放在 workbench 文件内（非 export），按指数退避轮询，超时 90 s 视为失败：

```ts
async function pollSession(sessionId: string, timeoutMs = 90_000): Promise<string | null> {
    const start = Date.now();
    let interval = 2000;
    while (Date.now() - start < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, interval));
        interval = Math.min(interval * 1.4, 8000);
        const { session } = await practiceApi.getSession(sessionId);
        if (session.status === "success") return session.result?.media?.url ?? null;
        if (session.status === "failed" || session.status === "cancelled") return null;
    }
    return null;
}
```

---

## 六、UI 变更

### 6.1 cost 标注（angle-params-panel.tsx）

现在（P0）：`演示渲染 · N 个机位`  
P1 改为：`N 次生成` / `1 次生成`

在 `AngleParamsPanelProps` 新增 `uploading: boolean` 和 `costLabel: string`；`<span className={s.cost}>` 直接展示 `costLabel`。

调用方 workbench 传入：
```ts
costLabel={batchTotal === 1 ? "1 次生成" : `${batchTotal} 次生成`}
```

### 6.2 生成按钮 disabled 条件

P0：`!ready || generating`  
P1：`!uploadedImage || uploading || generating`

`ready` 条件（有图片）对应换成 `!!uploadedImage && !uploading`。

### 6.3 MultiAngleShot 类型扩展

```ts
// multi-angle-results.tsx
export interface MultiAngleShot {
    name: string;
    url: string | null;
    status?: "queued" | "running" | "success" | "failed";
}
```

骨架占位格（`shotSkeleton`）沿用，`status === "failed"` 时显示一个小错误提示文字即可，不需要新 CSS。

### 6.4 summaryText

去掉 P0 的「本地演示渲染，基于同一主体」，改为「AI 生成 · N 次」：

```ts
const summaryText = useMemo(() => {
    if (!shots.length || !runMeta) return "";
    return `${runMeta.total} 次生成 · ${runMeta.wideAngle ? "鱼眼镜头" : shotLabel(runMeta.distance)} · ${runMeta.cameraMode ? "摄像头视角" : "主体视角"}`;
}, [shots.length, runMeta]);
```

---

## 七、不改的范围

- 单项练习 `practice-character-panel.tsx`、`practice-scene-panel.tsx`、`practice-home.tsx` 均不动
- 多角度页的拖拽、球控、预设、CSS、stage、orbit-widget 均不动
- 不新增 `PracticeModuleKind`，不加后台模块开关
- P0 的 `createSampleImage` / `paintCapture` / `renderShot` 保留在 `angle-model.ts`（可在 `generate` 里判断 `uploadedImage` 为空时降级到演示，当前 P1 直接 disabled 即可，不删）

---

## 八、实施顺序

1. **后端豁免分支**（practice-session-service.ts）——最先，不依赖前端，可单独测试 `listModules` 返回正常
2. **抽取共享 angle-presets.ts**——同步进行，确保画布单测仍通过
3. **toCanvasAngleParams + 更新 angle-model.ts**
4. **workbench.tsx**：uploadedImage 状态 + acceptFile 上传 + generate 替换
5. **angle-params-panel.tsx**：costLabel prop + disabled 逻辑
6. **multi-angle-results.tsx**：status 字段 + failed 展示
7. **tsc + eslint + 测试服验证**

---

## 九、验收标准

- 上传图片后「生成」按钮可点击，未上传时 disabled
- 按钮旁标注「N 次生成」（1 / 4 / 6 随 batch 变）
- 点击生成后各机位逐张出图，失败的机位显示错误提示，不阻断其他机位
- 结果区无「演示渲染」字样
- 单项练习（角色 / 场景 / 道具）功能不受任何影响
- `tsc --noEmit` 和 `eslint` 无新增报错

---

## 十、风险

1. **image 池渠道对 referenceImage 的支持**：`gamaimage` 池里的模型是通用 image 渠道，参考图能否正确传入取决于渠道 adapter 的实现，P0 验收后先用一张图测一次，确认参考图有效再全量开。
2. **轮询超时**：`pollSession` 90 s 超时设得偏保守，视测试服生成速度可酌情调整。
3. **批量失败容忍**：6 张里单张失败不中断，用户可看到部分结果；全部失败时 toast 提示。

---

## 十一、修复记录（2026-11-19，参考图未生效）

### 现象

上传三视图猫咪参考图后，多角度练习生成出摩托车，与参考图无关。

### 根因

练习调度 `dispatchPracticeTask`（`/api/practice/sessions/route.ts`）在下发 `/api/image-tasks` 时只带了 `references`，**没有带 `kind`**；`/api/image-tasks/route.ts:218` 因此按 `generation` 处理。OpenAI 协议渠道走 `runOpenAiImageTask` 的生成分支，请求体只有 `{ model, prompt, n, quality, size }`，**参考图被丢弃**，模型仅凭文本提示词（含「标准镜头」等词）自由发挥。agnes / request-template / async / runninghub 等自定义协议渠道无论 `kind` 都会转发参考图，所以症状取决于随机命中的池内渠道。正式画布 `createImageGenerationTask` 的既有规则是 `kind: references.length ? "edit" : "generation"`，练习路径漏了这条。

### 修复

`dispatchPracticeTask` 在 image 能力、非工作流、且存在参考图时下发 `kind: "edit"`：

```ts
const kind = input.capability === "image" && !input.workflow && references.length ? ("edit" as const) : undefined;
```

- `!input.workflow` 保证只影响练习画布池（gamaimage）路径；角色/场景/道具/分镜工作流模块仍按 `generation`，它们的 `references` 通过 `workflowInput` 进入 RunningHub 载荷，不受 `kind` 影响，且不会被切到工作流自定义的 `editPath` / `editRequestTemplate`。
- 无参考图时仍为 `generation`，与原行为一致。
- 单测：`sessions/route.test.ts` 新增「画布池带参考图 → edit；无参考图 → generation；工作流模块 → 不带 kind」用例。

### 未改动

`resolvePracticeModelFromSettings` 的 gamaimage 豁免分支保持 `candidates[0]`（随机后的首位）。image 池没有 `requiresImageInput` 过滤语义（该过滤仅用于 text→vision 池），参考图能力由 `assertReferenceCapabilities` 在 `/api/image-tasks` 内按渠道 `supportsReferenceImage` 过滤候选，已在本次路径中生效。
