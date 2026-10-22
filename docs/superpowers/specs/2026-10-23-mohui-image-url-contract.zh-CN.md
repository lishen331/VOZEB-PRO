# 模汇图片 URL 返回（B 项）：按模型显式选择返回格式

日期：2026-10-23
来源：交接包 `模汇URL-B项交接包-20261022`（`B-url-contract-only.patch`，4 个文件）
范围：只改图片返回格式的选择和回退。不改路由、计费、溢出候选，也不改任何渠道配置。

## 1. 要解决的问题

渠道的模型配置里可以写 `advancedConfig.modelConfigs[上游模型].imageResponseFormat`（`url` 或 `b64_json`）。基础能力（`b00fbad7`、`c9a7e7f0`）已经在 main 和 develop 上，但有两个问题：

1. **优先级反了**：渠道级默认值会盖过具体模型的设置，管理员给某个模型配了 `url` 也不生效
2. **会自动换格式重新生图**：显式要 `url` 时，上游报 400、建议改用 base64，或者返回的是内部地址，代码都会自动换成 b64 或 Responses 再提交一次。这一次是要付费的

## 2. 改动

- `image-task-support.ts`
  - `explicitImageResponseFormat`：先看模型配置，再看渠道默认
  - 新增 `allowsImageResponseFormatFallback`：管理员显式指定了格式，就不再自动尝试另一种格式
- `image-task-openai.ts`
  - 换格式的回退（url→b64、改用 Responses、内部 URL→b64）改为由 `allowsImageResponseFormatFallback` 控制
  - 协议形态的回退（multipart 切 JSON 编辑、同格式重试 JSON 编辑请求体）仍由 `allowsImageProtocolFallback` 控制，并保留用户选定的 responseFormat
- 测试：`image-task-support.test.ts` 加 2 个，`image-task-url-contract.test.ts` 新增 2 个

**不是**"整个任务最多只调一次上游"：溢出候选和既有的同格式重试不在这次范围内。

## 3. 不改的

- 不改任何渠道配置。代码上线后，没有配 `imageResponseFormat` 的模型行为和现在完全一样
- 不把 URL 参数加给 ModelBay（ModelBay 编辑接口会拒绝 `response_format`）
- 不解决大图栈溢出、ModelBay 素材 403、余额、视频尺寸这些问题

## 4. 验证（2026-10-23，基于 develop `4aa7662c`）

- `git apply --check` 通过，没有冲突（`image-task-support.ts` 偏移 3 行）
- 定向：image-tasks 下 10 个文件、99 个测试全部通过
- 回归确认：把两个源文件恢复成改动前的版本，新增的 3 个测试失败；恢复改动后通过
- 全量：1081 个文件通过、7 个跳过；5801 个测试通过、33 个跳过、0 失败
- tsc 0，eslint 0 错误，prettier 通过

## 5. 配置（代码上线后另做，要先确认）

字段：渠道 `advancedConfig.modelConfigs[实际上游模型].imageResponseFormat = "url"`。

- 只改模汇图片的 gpt-image-2-all / gpt-image-2-c。要先读出实际绑定的渠道和上游模型名，不能按显示名猜
- 合并现有对象，只改这一个字段；走后台的版本控制保存，不直接改数据库
- 配了 `url` 也不保证上游一定返回 URL，要看实际返回结构
- 回滚：恢复发布前备份的绑定配置；原来没有这个字段的，就删掉

## 6. 发布

先推 develop 到测试环境，再和其它修复一起推生产。
