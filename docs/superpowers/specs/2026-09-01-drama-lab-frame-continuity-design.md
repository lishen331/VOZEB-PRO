# 短剧实验室首尾帧连续性设计

> 建立日期：2026-09-01  
> 范围：仅限 VOZEB PRO 的短剧实验室（`/drama-lab` 与 `/api/drama-lab/*`）。  
> 参考：LocalMiniDrama `tailFrameLinkService`、`storyboards_tail_link` 和 `storyboardFrameBinding`。

## 目标

把“上一镜视频末帧 -> 下一镜首帧”的业务闭环迁入短剧实验室：末帧必须来自已完成视频的真实最后一帧，服务端独立保存媒体和来源，默认只生成下一镜的候选，用户确认后才绑定为下一镜首帧。该流程不修改普通 Canvas、教师/学生管理、商单算力或平台通用生成链路。

## 业务流程

```text
当前镜头视频任务成功
  -> 同步任务时确认可播放视频
  -> 服务端下载视频并用 FFmpeg 提取最后一帧
  -> 持久化独立尾帧图片记录
  -> 在同一剧集按 order 找到下一镜
  -> 保存下一镜 firstFrameCandidate（不覆盖已有首帧）
  -> 用户预览并确认
  -> 以候选图片绑定下一镜 frames.first
  -> 下一镜首帧/关键帧/尾帧规划和视频生成读取该绑定
```

没有下一镜时仍允许保存当前镜尾帧，但不创建候选。最后一镜不显示“衔接到下一镜”确认动作。

## 数据契约

在 `DramaShotFrameState` 中增加以下可选字段，旧项目数据不迁移也能读取：

```ts
type DramaShotFrameSource = "generated" | "uploaded" | "video_tail" | "restored";

type DramaShotFrameState = {
  prompt: string;
  description?: string;
  status: DramaTaskStatus;
  taskId?: string;
  attempt?: number;
  url?: string;
  storageKey?: string;
  width?: number;
  height?: number;
  error?: string;
  history?: DramaShotGenerationHistory[];
  source?: DramaShotFrameSource;
  sourceVideoTaskId?: string;
  sourceShotId?: string;
  sourceVideoHistoryId?: string;
  locked?: boolean;
};
```

候选不直接塞入 `frames.first`，而是存储在镜头的可选字段：

```ts
type DramaShotFrameCandidate = {
  id: string;
  frameType: "first";
  url: string;
  storageKey?: string;
  width?: number;
  height?: number;
  source: "video_tail";
  sourceVideoTaskId: string;
  sourceShotId: string;
  sourceVideoHistoryId: string;
  createdAt: string;
  projectUpdatedAt: string;
};
```

`firstFrameCandidate` 只允许由服务端产生或由同一候选确认请求引用；客户端不能提交任意 URL 冒充候选。确认后复制候选到 `frames.first`，设置 `source: "video_tail"`、`locked: true`，并清除候选。已有 `frames.first.url` 且未明确替换时，候选继续保留，确认接口返回 `409`，UI 必须让用户先选择“保留已有首帧”或“用候选替换”。

## 服务端接口

### 1. 末帧提取

`POST /api/drama-lab/projects/:id/shots/:shotId/extract-tail-frame?episodeId=:episodeId`

- 校验当前用户、项目、剧集、镜头归属。
- 仅接受当前镜头最新完成且属于当前用户的视频任务；优先使用 `generationTaskId` 对应结果，找不到时返回 `409`，不猜测历史视频。
- 只接受非 `data:`/`blob:` 的持久化视频地址；通过现有 `downloadMediaToFile` 下载到临时目录。
- 通过现有 `runFfmpeg` 提取最后一帧，输出为持久化图片并登记 `source=drama-lab-tail-frame`、`projectId`、`taskId`。
- 按镜头 `order` 找到下一个镜头；若不存在，返回当前尾帧和 `nextShot: null`。
- 若存在，原子保存 `nextShot.firstFrameCandidate`。相同 `sourceVideoTaskId` 重复请求必须幂等返回已有候选，不重复下载、写媒体或覆盖更晚候选。
- 项目版本冲突返回 `409`，不得覆盖用户同时保存的脚本、资产或帧数据。
- FFmpeg 不可用、视频不存在、下载失败、提取为空均返回明确的 `422/502/503` 错误，不留下半成品候选。

响应示例：

```json
{
  "code": 0,
  "data": {
    "frame": { "url": "/api/reference-assets/permanent/...jpg", "source": "video_tail" },
    "nextShot": { "id": "shot-2", "candidate": { "id": "..." } }
  }
}
```

### 2. 候选确认

`POST /api/drama-lab/projects/:id/shots/:shotId/accept-first-frame-candidate?episodeId=:episodeId&candidateId=:candidateId`

- `shotId` 必须是候选所属的下一镜，候选 ID、项目 ID、源视频任务 ID 必须全部匹配。
- 默认策略 `replaceExisting=false`：已有首帧时返回 `409`，不写入。
- 用户显式确认替换时传 `replaceExisting=true`；旧首帧进入 `frames.first.history`，不删除媒体。
- 接受操作使用项目 `updatedAt` 做乐观并发校验；冲突返回 `409` 并要求刷新。
- 接受成功后设置 `frames.first.status=success`、`source=video_tail`、`sourceVideoTaskId`、`sourceShotId`、`sourceVideoHistoryId`、`locked=true`，并清除候选。

## 视频生成引用规则

短剧视频准备服务按模型能力和角色明确传递引用：

- 有 `frames.first.url` 时，引用角色为 `first_frame`。
- 有 `frames.last.url` 且当前逻辑模型支持尾帧时，引用角色为 `last_frame`。
- 关键帧/分镜图只作为普通 `reference` 或模型要求的唯一视觉输入，不把首尾帧降级成普通图片。
- 首尾帧来源、URL、任务 ID、模型能力和实际请求 prompt 一起写入视频任务上下文，便于恢复和审计。
- 不支持尾帧的模型只发送首帧并在服务端记录降级原因；不允许把尾帧静默当普通参考图。

## UI 行为

在分镜卡片视频区域增加：

- 视频成功后显示“提取尾帧”按钮；没有下一镜时显示不可衔接状态。
- 下一镜有候选时显示候选缩略图、来源镜头/任务和“应用为首帧”“保留现有首帧”动作。
- 首帧显示来源标记（生成、上传、上一镜尾帧、历史恢复）和锁定状态；已锁定首帧不会被后台同步覆盖。
- 提取、确认、同步期间按钮按镜头维度防重复点击；刷新后根据服务端候选和任务状态恢复。
- 错误必须使用用户可理解的弹窗/提示：视频未完成、FFmpeg 不可用、候选已过期、已有首帧、项目已被其他页面修改。

## 并发、恢复与清理

- 任务身份以 `generationTaskId` 为唯一来源；旧视频任务不能为新视频任务生成候选并覆盖它。
- 候选保存是项目 JSON 的原子更新；与自动保存冲突时只重读最新项目并重放候选字段一次。
- 页面刷新不重新提交视频或图片任务；候选和帧历史从项目 JSON 恢复。
- 末帧媒体使用平台参考素材登记和用户归属校验，随项目/用户媒体清理策略处理。
- 提取失败不改变当前视频终态；确认失败不改变候选和既有首帧。

## 验收标准

1. 完成视频可提取真实末帧，服务端存在可访问的持久化图片和来源任务 ID。
2. 下一镜出现候选但已有首帧不被自动覆盖；用户确认后才替换并保留历史。
3. 重复提取同一视频任务幂等；并发保存返回 `409` 且不丢失其他字段。
4. 首帧/尾帧在支持的图片/视频模型请求中保持明确角色，不支持时有可见降级说明。
5. FFmpeg、下载、任务不存在和无下一镜等边界都有明确错误和自动化测试。
6. 桌面和移动端刷新后仍能看到候选、来源、锁定状态和任务终态。

## 非目标

- 不修改普通 Canvas 的数据结构或运行时。
- 不复制 LocalMiniDrama 的 SQLite 表结构。
- 不在本阶段实现音频/TTS、批量视频终态、Canvas 双向自动回写或完整导出。
