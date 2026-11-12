# 视频自定义清晰度仍显示：生产缓存补充热修复

## 证据与范围

用户2026-11-10截图仍显示视频清晰度自定义输入框。生产原8文件补丁哈希全部匹配，源码调用已是allowCustom=false，补丁未丢失；但JS响应头为Cache-Control: public,max-age=31536000,immutable，旧文件名原地热改不能使浏览器缓存失效。未取得用户浏览器的实际网络缓存记录，因此将缓存判定为有响应头支持的原因，未声称已读取用户缓存。

## 本次修复

保留原文件供旧页面引用，给3个已修复客户端chunk建立内容哈希命名的新地址，并更新普通画布、短剧画布、创作页3份page_client-reference-manifest.js。没有改业务参数、数据库、生成流程或已保存的视频配置；图片4K修复保留。

生产镜像仍为sha-69e2dec6d52e1d6fd4ce1956d8c128ea6445e447，BUILD_ID仍为P59sr1hudwDZ_mQsklIIP。

## 验证与回滚

- 3份RSC manifest在VM中执行成功，引用新地址且无原chunk地址残留。
- gammatv与edu两生产域名6次实际资源请求均成功，内容SHA256与已验证补丁完全一致。
- 生产readiness/database/schema/encryption/generationWorker健康，app与worker运行正常。
- 原始8文件修复的真实Chromium组件证据仍有效：1280/390/430下无自定义视频清晰度输入，预设可选，图片4K在快照与刷新后保留。本次不改其字节内容。
- 生产登录态页面交互验收未完成：浏览器扩展domSnapshot仍报timeoutMs读取异常；不将资源校验冒充真实生产点击验证。
- 备份：/opt/vozeb-pro/production/hotpatches/canvas-parameter-cache-20261110/，包含3份原manifest、applied.json、manifest.json和rollback.py。回滚前校验镜像及after哈希，恢复manifest并重启app；保留新静态别名避免中断已加载页面。脚本py_compile通过，未执行回滚。
- 本次未push、merge或部署测试环境。旧页面需要重新加载才能采用新引用；普通刷新即可请求新的静态地址。