# 短剧实验室资产编辑器与生成模式对齐（第一阶段）实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不影响 Canvas、Agent、普通短剧和公共生成协议的前提下，为短剧实验室角色、场景、道具补齐 L 风格的可持久化最终提示词与单图/四视图生成模式字段，并让编辑弹窗能够查看、编辑和保存这些字段。

**Architecture:** 扩展 `DramaAssetVisualDetails` 为资产生成元数据契约；资产编辑器继续复用现有 `DramaLabVisualAssetsPanel`，仅增加字段和模式选择；生成提示词函数优先读取已保存的 `polishedPrompt`，没有时再按现有逻辑生成。第一阶段不改变图片模型请求协议，不实现 L 的二次文本润色任务和完整四视图模板生成（属于第二阶段）。

**Tech Stack:** Next.js 16、React 19、TypeScript、Ant Design、Vitest、Prettier、ESLint。

## Global Constraints

- 仅修改 `VOZEB-PRO/web` 短剧实验室资产准备相关类型、组件、提示词辅助函数与专项测试。
- 不修改 Canvas、Agent、普通短剧、公共图片/视频任务协议、公共资产服务和成片导出逻辑。
- 不删除现有资产字段；旧项目数据缺失新字段时必须保持兼容并使用默认值。
- `polishedPrompt` 是可编辑的最终生图提示词；`imagePrompt` 继续保留为原始/业务图片提示词。
- `generationLayout` 只允许 `single` 或 `four_view`；默认值按资产类型：角色 `four_view`，场景和道具 `single`。
- 本阶段不将 `generationLayout` 误当成已完成的四视图图片生成；只完成数据契约和编辑入口。

## 已完成

- 扩展资产视觉字段：`polishedPrompt`、`singleImagePrompt`、`generationLayout`。
- 角色默认四视图，场景/道具默认单图；旧数据自动兼容。
- 资产编辑弹窗增加生成版式、原始图片提示词、最终生图提示词。
- 生成提示词优先复用已保存的 `polishedPrompt`。
- 增加契约、提示词和资产面板回归测试。

## 第二阶段留项

- L 的文本模型二次格式化服务。
- 角色四视图、场景四格、道具四视图的完整布局合同。
- `polishedPrompt` 自动生成、历史版本和重新生成按钮。
- 生成历史主参考图切换与四视图结果解析。

## 验证

- 3 个专项 Vitest 文件，11 个测试通过。
- TypeScript 类型检查通过。
- ESLint 无错误；保留既有图片 `<img>` 警告。
- Prettier 检查通过。
