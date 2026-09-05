# 短剧实验室 Phase 2C 音频与 TTS 阶段报告

日期：2026-09-02（阶段收尾）
范围：仅限短剧实验室（`/drama-lab` 与 `/api/drama-lab/*`）的对白/旁白音频任务、任务恢复和按音频节奏拆镜；同时只对平台通用音频恢复接口增加 pending 任务唤醒兼容。普通 Canvas、教师/学生管理、学校/商单算力及平台通用音频创建语义不在本阶段变更范围。

## 阶段结论

Phase 2C 已完成代码级闭环和定向自动化验证：镜头中的对白、旁白可以分别创建真实平台音频任务，任务上下文、状态和媒体结果能够回写短剧镜头；刷新或进程中断后可以查询并恢复原任务；按音频节奏拆镜采用“预览后显式应用”的追加模型，不覆盖源镜头或已有手工镜头；独立音轨已接入现有整集合成和剪映导出链路。

这表示服务端契约和本地自动化测试达到阶段开发门槛，不表示真实供应商、生产等价 PostgreSQL、浏览器人工交互或最终成片合成已经验收。下列未验证项必须在 Phase 0-4 统一验收时完成。

## 已实现

### 1. 音频数据契约

- `DramaShot` 新增独立的 `dialogueAudio` 和 `narrationAudio` 状态，分别保存 `status`、`taskId`、尝试次数、错误、媒体地址、MIME、说话人、声线、语速、指令和测量时长。
- 保留并规范化旧版 `audioStatus`、`audioTaskId`、`audioUrl` 等字段，读取旧项目时不会丢失已有任务信息；无效地址（包括 `data:`/`blob:`）不会被当作可播放媒体保存。
- 按音频拆镜候选保存 `audioSplitSourceShotId` 和 `audioSplitSegmentIndex`，用于来源追踪和重复应用幂等。
- 项目、剧集、镜头归属由服务端校验；任务回写使用乐观版本，冲突返回 `409`，不覆盖较新的用户编辑。

### 2. 短剧音频任务服务与 API

- `prepareDramaLabAudio` 从持久化 `utterances` 生成对白/旁白文本，必要时回退到镜头的 `dialogue`、`narration` 或字幕字段；角色匹配到项目资产时读取其 `voiceProfile`（声线、速度和指令）。
- `POST /api/drama-lab/projects/:id/shots/:shotId/generate-audio` 在服务端读取短剧默认音频模型，向平台 `/api/audio-tasks` 创建任务，并强制携带 `surface=drama`、`projectId`、`episodeId`、`shotId`、`audioKind`、说话人及幂等请求标识。
- 创建成功后原子写入对应对白或旁白轨道，同时投影旧版兼容字段；镜头已有同轨道活动任务时拒绝重复提交，避免重复上游任务和重复扣费。
- 空文本、缺少默认音频模型、跨项目镜头和上游无任务 ID 等情况会返回明确错误，不写入半成品状态。
- 平台通用音频任务、计费、媒体登记和 Worker 继续复用现有实现，本阶段没有复制第二套基础设施。

### 3. 同步、刷新恢复与轨道隔离

- `POST /api/drama-lab/projects/:id/shots/:shotId/sync-audio` 按任务状态将结果映射为 `running`、`success`、`error` 或 `cancelled`；成功只有在存在稳定可播放地址时才落盘，否则进入错误状态。
- `POST /api/drama-lab/projects/:id/shots/:shotId/recover-audio` 优先使用镜头已保存的任务 ID，核对用户/项目/剧集/镜头/音频轨道完整上下文后，查询并恢复原上游任务，不创建新的任务。
- 对白和旁白的任务 ID、状态及恢复请求相互隔离；一个轨道的任务不能写入另一轨道。恢复失败会保留原任务身份并返回可操作原因。
- 工作台轮询使用可取消请求和任务签名；切换剧集、卸载页面或同步失败不会让旧请求回写当前镜头。成功结果显示原媒体播放器，失败和待检查状态显示服务端原因。

### 4. 按音频节奏拆镜

- `planDramaAudioSplit` 是不触碰数据库的确定性规划函数：按持久化对白/旁白顺序生成候选，保留完整文本、说话人和 utterance ID；可使用音频测量时长、起止边界或受约束的语速估算。
- `POST /api/drama-lab/projects/:id/shots/:shotId/split-by-audio` 支持 `preview` 和显式 `apply` 两阶段。服务端对来源指纹、候选数量、文本/说话人、时长边界和镜头归属重新校验，拒绝篡改或过期计划。
- 应用采用 append-only：源镜头和相邻手工镜头保持不变，新候选使用稳定 ID 和来源字段追加到剧集；重复应用会跳过已存在候选，不覆盖用户已编辑的候选。
- 自动拆分不会再次拆分音频候选镜头；只有对白/旁白可拆且至少有两段对白时才允许进入流程，单段或仅旁白场景返回明确提示。
- 候选继承源镜头的场景、角色、道具等视觉关联，并清空待重新生成的图片/视频/音频状态，避免把旧媒体误绑定到新片段。

### 5. 工作台接入

- 分镜卡按“对白音频”和“旁白音频”分别展示文本、状态、生成/同步/恢复动作及成功后的 `<audio>` 播放控件。
- 对符合条件的源镜头提供按音频拆镜预览、重新预览和确认添加；应用成功后刷新项目，计划过期时显示服务端冲突信息。
- 音频动作使用独立 busy key，不阻塞同一镜头的视觉任务，也不会以本地 `setTimeout` 伪造任务完成。

### 6. 恢复与旧数据兼容

- 平台通用 `POST /api/audio-tasks/:id` 恢复接口现在同时支持 `pending`/`created` 任务：只重新唤醒已有 scheduler 记录，不创建第二个上游任务；`submitting` 且没有上游 ID 时保持 `409`，避免重复扣费。
- Worker 发现 scheduler 仍保存上游任务 ID、而音频任务载荷尚未写入该 ID 时，会先恢复原身份再查询；身份恢复失败进入 `needs_review`，不会重新提交。
- 短剧专属恢复不会把并发 Worker 已进入的执行阶段降级为 `created`。旧版根 `audioUrl` 按唯一对白/旁白文本归属回退；同时存在两类文本且无法判断时返回可追踪的 `needsReview/reviewReason`，工作台显示待复核并保留可检查的旧音频播放器；与专属 URL 相同的根 URL 不重复输出。

## 自动化验证

本阶段定向套件共 **10 个测试文件、90 项测试通过**：

- `drama-lab-audio-service.test.ts`：对白/旁白文本解析、角色声线回退、可播放结果回写、任务上下文隔离。
- `generate-audio/route.test.ts`：鉴权、任务上下文、幂等活动任务保护、上游缺少任务 ID 和状态持久化。
- `recover-audio/route.test.ts`：原上游任务恢复、不新建任务、跨项目/跨音频轨道拒绝。
- `drama-lab-audio-split-service.test.ts`：时长和节奏分配、旧台词解析、边界、指纹/篡改校验、手工镜头保护、追加幂等和乐观版本冲突。
- `split-by-audio/route.test.ts`：预览不落库、显式应用、请求体/剧集参数和鉴权校验。
- `drama-audio-tracks.test.ts`：对白/旁白旧字段归属、歧义待复核、无效媒体地址和 URL 去重。
- `drama-render-input.test.ts`：独立对白/旁白轨道进入渲染输入及普通 `/drama` 隔离。
- `drama-jianying-export.test.ts`：独立轨道、旧字段兼容、源视频静音和剪映草稿素材。
- `audio-tasks/[id]/route.test.ts`：通用 pending 恢复、提交中断防重复提交和取消退款。
- `generation-task-recovery-service.test.ts`：scheduler-only 音频上游身份恢复、失败转人工复核和 Worker 轮询。

本次集成检查另已通过：

```text
npm run typecheck (在 `web/`)
```

定向测试命令：

```text
npm test -- src/lib/server/drama-lab-audio-service.test.ts src/lib/server/drama-lab-audio-split-service.test.ts src/lib/server/drama-audio-tracks.test.ts src/lib/server/drama-render-input.test.ts src/lib/server/drama-jianying-export.test.ts src/app/api/drama-lab/projects/[id]/shots/[shotId]/generate-audio/route.test.ts src/app/api/drama-lab/projects/[id]/shots/[shotId]/recover-audio/route.test.ts src/app/api/drama-lab/projects/[id]/shots/[shotId]/split-by-audio/route.test.ts src/app/api/audio-tasks/[id]/route.test.ts src/lib/server/generation-task-recovery-service.test.ts
```

Lint、差异检查、全量测试和主分支集成提交由主智能体在合并工作台改动后统一执行；本报告不把尚未执行的检查标为通过。

## 尚未验证与后续人工验收

### 真实任务链

- 使用真实登录账号和已配置音频模型，分别生成对白和旁白，核对上游请求中的模型、声线、语速、指令、`surface` 和完整项目坐标。
- 在中转后台、`generation_tasks`、积分流水和媒体登记中核对一次且仅一次的创建、扣费、成功落盘及失败退款；重复点击不得产生第二个上游任务。
- 覆盖供应商成功、失败、取消、超时、`needs_review`/未知提交结果和无可播放地址等终态，确认工作台提示与服务端原因一致。

### 刷新、重启与数据隔离

- 任务执行中刷新页面、切换剧集、关闭后重新进入以及重启 Web/Worker，确认原任务可继续查询，不重复创建或扣费。
- 在生产等价 PostgreSQL 多实例中验证任务上下文索引、恢复、乐观版本冲突、并发点击和跨用户/跨项目拒绝；同时验证文件 Provider 的重启恢复。
- 分别在对白和旁白同时运行时核对轨道状态、媒体地址和声线不会交叉写入。

### 按音频拆镜

- 使用真实音频时长或 ASR/节奏边界验证连续对白、长句、无音频、单段对白和仅旁白等边界；确认台词完整、顺序和说话人不变。
- 在含手工镜头及已编辑候选的剧集中执行预览、确认、重复确认和源镜头编辑后的确认，核对追加顺序、幂等和 `409` 提示。
- 确认拆出的镜头继承正确场景/角色/道具 ID，旧图片/视频不会被误复用，后续生图/生视频任务只读取新镜头绑定的参考资产。

### 浏览器与媒体

- 在登录态桌面、390px 和 430px、浅色/深色主题下验收两条音频轨道、播放器、错误/恢复按钮、轮询中的状态和拆镜预览弹层，无控件越界或横向溢出。
- 验证真实 WAV/MP3 等供应商媒体的 MIME、时长、播放、下载、Range 和刷新后读取；确认媒体代理不会把错误文本当作地址。
- Phase 2C 已复用现有整集合成的音轨混音和剪映导出；本阶段未新增完整批量编排、字幕烧录或 FFmpeg 音频后处理，这些能力仍按总计划单独开发和验收。

## 交付边界

本阶段只增加短剧项目/剧集/镜头范围内的音频字段、服务、路由、工作台控件和测试，不改变普通 Canvas、教师/学生管理、学校/商单算力或平台通用音频 API 的业务语义。真实供应商、生产数据库、浏览器人工回归及整集合成通过前，不应将 Phase 2C 标记为最终商业交付。
## Phase 2C 集成勘误（2026-09-02）

本阶段已接入现有整集合成与剪映导出链路：每个镜头可分别消费已完成的对白、旁白音轨，整集合成时按镜头混音，剪映草稿导出时保留独立对白/旁白轨道，并继续兼容旧版 `audioUrl`。本阶段没有新增批量编排；真实供应商、FFmpeg、PostgreSQL 和浏览器验收仍列为后续人工验收项。

自动化覆盖现包含音频轨道解析、渲染输入、剪映导出及工作台面板测试；提交前以实际定向测试和全量测试结果为准。
