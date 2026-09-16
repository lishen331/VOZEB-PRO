# 短剧实验室 Word 小说导入设计

> 日期：2026-09-11
> 范围：仅短剧实验室「剧本 → 创作剧本 → 导入小说」链路。

## 目标

让短剧实验室的导入小说支持 TXT、MD、Markdown、DOCX、DOC，并且点击选择与拖拽导入都走同一个服务端解析和现有分集预览流程。

## 当前问题

V 前端只接受 `.txt/.md`，`readSource` 会直接拒绝 Word 文件；V 后端 multipart 分支把所有上传文件交给文本编码解码器，无法解析 DOCX ZIP/XML 或旧版 DOC 二进制格式。

## 设计

1. 前端 `DramaLabNovelImport` 的文件选择器与拖拽区域接受 `.txt,.md,.markdown,.docx,.doc`。
2. 前端不再把 Word 文件当 UTF-8 文本读取；文件统一以 multipart `file` 上传到现有 `POST /api/drama-lab/projects/:id/import-novel`，由服务端解析后返回预览。
3. TXT/MD/Markdown 继续使用现有编码检测；DOCX 解析 `word/document.xml`，提取段落、换行、制表符并解码 XML 实体；DOC 优先调用 `antiword`，其次 `libreoffice/soffice`，缺少工具时返回明确的转换提示。
4. 预览和确认导入接口保持不变，确认时仍发送解析后的 `sourceText`，保留现有版本恢复语义。
5. 文件大小限制保持 2 MiB 的业务文本限制；multipart 请求允许少量 multipart 开销。解析后的文本仍由现有 `importDramaLabNovelForUser` 校验。
6. 错误通过现有 `messageApi.error` 展示，不增加普通短剧、Canvas、Agent 或通用上传服务行为。

## 接口契约

- JSON 预览/确认：保持现有 `{ sourceText, fileName, targetCharacters, commit }`。
- multipart 预览/确认：`file`（别名 `novel`、`sourceFile`）、可选 `targetCharacters`、`commit`。
- 解析函数：`extractUploadedText(buffer: Uint8Array, originalName: string): string`。

## 验收标准

- 点击选择 `.docx` 能得到正确中文预览。
- 拖拽 `.docx`/`.doc` 到导入区域能得到正确中文预览或明确的 `.doc` 工具缺失提示。
- TXT、MD、Markdown、现有 JSON 导入回归通过。
- 无文件、空文件、超限文件、不支持扩展名均有明确错误。
- 现有预览、分集识别、确认替换和版本恢复流程不变。
