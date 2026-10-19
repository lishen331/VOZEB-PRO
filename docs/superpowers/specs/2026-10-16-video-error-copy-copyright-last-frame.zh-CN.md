# 视频失败文案：版权拦截与尾帧冲突不再显示"网络异常"

## 背景

生产 10-10～10-13 的视频失败里，有两类上游错误没有命中任何文案规则，被兜底成 `网络异常，请点击重试`，用户以为是网络或并发问题，反复重试：

- 版权拦截（3 条）：`The request failed because the output video may be related to copyright restrictions` / `请求失败，因为输出视频可能与版权限制有关`
- 尾帧与参考图混用（6 条，渠道 `official/seedance-2-5`）：`last frame image content cannot be mixed with reference ...`

## 改动

只改 `web/src/lib/generation-feedback-message.ts`：

- 新增 `GENERATION_COPYRIGHT_MESSAGE = "生成内容可能涉及版权限制，请修改描述或参考素材后重试"`，匹配 `版权` / `copyright`。
- 新增 `GENERATION_LAST_FRAME_MESSAGE = "首尾帧模式不能同时使用参考图，请移除参考图或尾帧后重试"`，匹配 `last frame ... cannot be mixed` 及中文"尾帧…不能/无法…混用/同时"。
- 两条都放在敏感内容规则之前判断，并加入"已是用户文案"集合，避免二次映射。

## 不变

后端、计费、重试逻辑、原始错误记录都不变；只影响前端展示文案。尾帧冲突在提交前拦截属于另一项改动，本次不做。

## 验证

`generation-feedback-message.test.ts` 增加中英文两类原文的映射用例和幂等用例。
