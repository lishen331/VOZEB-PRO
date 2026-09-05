# 短剧实验室 Phase 4 配置收敛证据

## 结论

短剧实验室运行时不读取 LocalMiniDrama 旧配置/任务表。运行链路的权威来源已经限定为：

| 运行内容                   | 权威来源                                                                       | 证据                                                                     |
| -------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 九套提示词正文             | `drama_lab_prompt_templates` 的全局 `template_key`                             | `resolveDramaLabPrompt` 按 canonical key 查询，不按管理员 `user_id` 分叉 |
| 文本、图片、视频、音频模型 | 平台 `getAuthSettings()` 的 `defaultModels`、`logicalModels`、`systemChannels` | 短剧各生成 Route 和服务显式读取平台设置                                  |
| 并发与任务状态             | 平台 `generation_tasks`、Generation Worker                                     | 短剧任务查询、恢复和同步均带 `surface=drama` 与项目坐标                  |
| 项目画幅、风格和资产       | `drama_projects.project_json` 及项目版本                                       | 分镜、帧和媒体服务按项目/剧集/镜头校验                                   |

以下表仍由 schema 保留，用于旧数据兼容或后台历史查看，但当前运行时没有读取点：

`drama_lab_ai_configs`、`drama_lab_character_library`、`drama_lab_scene_library`、`drama_lab_prop_library`、`drama_lab_async_tasks`、`drama_lab_image_generations`、`drama_lab_video_generations`、`drama_lab_video_merges`、`drama_lab_assets`、`drama_lab_image_proxy_cache`、`drama_lab_ai_model_map`、`drama_lab_global_settings`、`drama_lab_business_scenarios`、`drama_lab_generation_settings`、`drama_lab_sd2_assets`。

没有删除这些表，也没有把它们接回生成链路。后台页面已将对应 Tab 标为兼容用途：AI 配置、业务场景和 SD2 资产只读，生成设置只读并显示平台全局并发别名；只有九套系统提示词保留编辑/恢复默认。对应旧写入入口（创建、更新、删除、上传）统一返回明确的 `410`，历史 AI 测试入口也返回 `410`，避免出现“保存成功但运行不生效”的假成功。真实模型验证统一从平台“模型渠道”发起。

## 并发写入修复

系统提示词编辑接口已从 `SELECT -> UPDATE/INSERT` 改为单条 PostgreSQL `INSERT ... ON CONFLICT (template_key) ... DO UPDATE`。全局 partial unique index 与 canonical legacy key 映射共同保证多个管理员首次保存同一模板时不会出现竞态 500；`story_generation` 和 `storyboard_output_format` 仍兼容映射到正式 key。

## 自动化证据

- Prompt 管理 Route：3 项通过（canonical upsert、legacy key、空正文拒绝）。
- 未接入 AI 测试 Route：2 项通过（410 明确失败、鉴权先行）。
- 配置/部署契约与 Phase 4 跨模块回归：定向测试通过。
- `tsc --noEmit --pretty false`：通过。

## 仍需人工验收

1. 登录管理员后台确认历史 Tab 的兼容提示、平台模型渠道入口和 410 错误文案。
2. 修改全局提示词后，在短剧故事、资产、分镜和帧规划流程分别确认新正文生效；恢复默认后确认回退内置正文。
3. 在生产等价 PostgreSQL、Generation Worker 和真实模型渠道上执行 Phase 4 统一回归；不使用历史兼容表作为生成结果来源。
