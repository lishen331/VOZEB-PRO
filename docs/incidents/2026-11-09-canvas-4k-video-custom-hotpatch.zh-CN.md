# 生产热修复：图片4K参数保留与隐藏视频清晰度自定义

## 需求与边界

- 隐藏截图红箭头指向的“输入自定义视频清晰度”文本框；保留智能、480P、720P、1080P及模型声明的预设按钮。
- 图片节点显式选择4K后，生成与失败重试不得退回全局默认2K。
- 仅生产先热更新；未推送GitHub、未合并、未部署测试环境。用户尚未要求本次正式镜像发布。
- 视频比例的“自定义像素尺寸”是不同控件，本次未擅自删除；图片自定义尺寸也保留。

## 根因与源码修复

面板写入节点metadata.resolution，而buildGenerationConfig遗漏imageResolution，生成时用全局配置；生成结果又以该配置写回resolution，造成4K回落2K。失败重试重建配置也遗漏同一字段。补齐节点优先的清晰度、与面板一致的背景配置，并保留重试配置/快照中的resolution；画质、提示词和上游协议不变。

源码提交：11320989（普通画布与共享视频参数UI）。短剧复制画布由现有sync脚本同步，未手工修改复制契约。

## 验证

- RED：3 failed /24 passed；4K用例期望4k实际2k，视频自定义隐藏契约失败。
- GREEN：4files /39tests通过；图片节点和配置节点均验证显式4K进入生成配置和输出快照，画质medium不被改为high。
- 真实Chromium隔离组件：1280、390、430均完成“选择4K→生成配置/结果快照→重开/刷新仍4K”；视频自定义清晰度输入框不存在，720P/1080P预设仍能点击切换；无pageerror。不访问真实上游、不产生扣费。
- Web typecheck与目标ESLint/Prettier通过。
- 热更新前逐文件JS语法验证、精确替换次数校验，使用VM验证1K/2K/4K节点优先于全局配置。
- 生产8个文件after哈希校验通过；gammatv与edu两域名实际下载3个客户端chunk，SHA256均等于热补丁after哈希。
- 生产readiness=true，database/schema/encryption/generationWorker健康，app与worker镜像未变。
- 用户登录态生产浏览器验收未完成：Browser扩展交互报timeoutMs读取异常；Computer Use因不能可靠识别URL而停止，未绕过工具限制。隔离组件真实点击和实际对外资源哈希为当前证据，不能冒称已在用户生产画布真实点击验收，也未发起付费生图。

## 生产热更新与回滚

- 容器vozeb-pro，基线镜像sha-69e2dec6d52e1d6fd4ce1956d8c128ea6445e447；BUILD_ID P59sr1hudwDZ_mQsklIIP。
- 修改3个static chunk和5个SSR chunk，普通/短剧复制画布均补齐同一逻辑；未更换整套构建、未动后端API/数据库/Worker。
- 备份目录：/opt/vozeb-pro/production/hotpatches/canvas-4k-video-custom-20261109/，包含8个原文件、manifest.json、applied.json与rollback.py。
- rollback.py已py_compile，仅在镜像仍为指定基线且当前每个文件仍匹配after哈希时恢复before文件并重启app，防止覆盖后续版本；未执行回滚。
- 本次重启app清除SSR缓存，worker未重启；旧标签页需Ctrl+F5获取新chunk。容器重建会替换热补丁，后续正式发布必须包含源码修复。