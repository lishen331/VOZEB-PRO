# script-gen-ai migration inventory

- 来源仓库：`https://github.com/kenshinshen1314-sudo/script-gen-ai`
- 固定参考提交：`6f56f0cb942a65d2b752bafadb82bb363efa0d24`
- 使用方式：仅参考公开剧本块、Fountain/FDX 格式行为和结构化编辑职责；未复制其鉴权、数据库、协作同步、Agent 服务或商业逻辑。

## 边界记录

| 参考能力 | VOZEB-PRO 处理 | 备注 |
| --- | --- | --- |
| `ScriptBlock` 类型 | 重新实现 | 仅保留场景、动作、角色、括号、对白、转场、备注七类块 |
| Fountain 解析/序列化 | 重新实现 | 只支持本模块定义的结构化剧本块 |
| FDX 解析/序列化 | 重新实现 | 只读取/写入 Final Draft Paragraph/Text |
| Plate/Slate 式结构化编辑 | 后续重新实现 | 只服务单人无限练习剧本工作区 |
| `read_script` / `edit_script` 思路 | 后续重新实现 | 服务端绑定 owner、项目和版本，不开放 SQL 或媒体工具 |

## 不直接复用的内容

- Loro CRDT、Loro Sync、Supabase 和多人协作服务；
- 独立鉴权、社区、订阅和商业后台；
- 独立 API、Cloudflare 资产和 Chat 服务；
- 任何图片、视频、音频或漫剧任务编排。

本文件记录的是行为参考和重新实现边界，不将参考仓库描述为 VOZEB-PRO 的生产代码或其官方生产实现。
