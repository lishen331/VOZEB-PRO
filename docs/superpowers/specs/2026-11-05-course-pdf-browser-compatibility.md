# 课件 PDF 预览兼容性修复设计

## 问题与原因

课程 PPT/Word 已在服务器转换成 PDF，页面也成功取得页数并渲染工具栏；旧版浏览器的 `Map` 没有 `getOrInsertComputed`，而 `pdfjs-dist@6.4.299` 的主线程和 worker 都直接调用该 API，造成预览画布失败。

## 目标

- 支持当前正式服需要覆盖的旧版 Chromium 浏览器。
- 保留现有 PDF 页面加载、同源 worker、缩放、翻页、放映和错误提示行为。
- 不修改课程源文件、对象存储对象、预览数据库字段或图片限流修复。

## 方案

将 `pdfjs-dist` 精确固定到 5.4.624（5.7 系列仍调用不兼容 API），并通过 pnpm 更新锁文件。正式服 Node 22.23.4 满足此版本 `>=22.3.0` 的引擎要求。保留现有 PDF.js worker 路径和 `PdfPreview` 组件 API。回归测试检查依赖版本固定、主线程及 worker 无新 Map API 调用，并在真实浏览器加载至少一份课程 PDF，确认页数、canvas 尺寸和渲染内容可见。

## 验收

- 单元测试先复现当前 API 不兼容，再通过。
- PDF.js 及 worker 均不调用 `getOrInsertComputed`。
- 课程 PDF 预览页工具栏显示正确页数，第一页 canvas 非空可见，翻页与缩放正常。
- 定向测试、类型检查、Lint、格式检查和生产构建通过。
