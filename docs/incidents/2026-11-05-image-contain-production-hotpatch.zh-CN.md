# 图片原图保留与固定比例预览：生产临时热更新记录

## 授权与基线

用户2026-11-05确认第三种方案，并明确授权先热更新生产、验收后再决定正式推送测试和生产。未授权本轮push，未执行push/merge/Actions发版，未调用付费模型。

生产：gammatv.gammablue-x.com，root@8.163.33.161:22222，app=vozeb-pro，worker=vozeb-pro-generation-worker。镜像基线 sha-8b3116fe38bd611925a013d86f8917a377029c29。仅重启app，worker与数据库未重建。

## 行为

1. 保存上游完整图字节与真实MIME/宽高，不自动crop/resize/拉伸/补边。
2. 画布普通生成结果框按已请求比例显示，内部object-contain；刷新与图像元数据到达后仍保留框比例。
3. 批量额外结果遵循相同比例；auto/无比例和上传图保持自然比例；全景/分层有原处理分支，不扩展改造。
4. 放大/下载/引用使用源图。旧已裁历史图不承诺恢复，不修改已有图片文件或数据库记录。
5. 自由调整框中的普通图片也完整contain，不因框比例不同拉伸人物。

## 代码及验证

隔离worktree基于生产8b3116fe，本次源码修复普通画布、复制的短剧画布运行时与generated-image-normalizer。未覆盖主工作区已有UI/voice变更。

- 先执行失败测试：9项明确失败（后端旧cover及前端自然尺寸覆盖）。最小实现后通过。
- 相关扩大测试49项通过；完整生产基线回归1114文件/6099测试通过，8文件/36测试跳过。
- tsc --noEmit通过；10个改动源码/测试文件ESLint与Prettier通过；diff --check通过。
- 开发地图/接口索引按生产基线更新并验证：440 Route、69页面、147表。不是develop的444 Route基线，后续正式移植须重新生成。
- 本地生产bundle实际执行：8个尺寸函数、2个normalizer、4个多结果安装函数通过，不只是源文件测试。
- Chromium/PL：1280×900和390×844无横向溢出；16:9外框720×405/342×192.375，内部图片2172×724，contain；放大图真实3:1。fixture使用生产补丁实际尺寸函数。没有把fixture当作登录后生产端到端证据。

## 线上应用

备份目录：/opt/vozeb-pro/production/hotpatches/image-contain-20261105

- before-next 是应用更新前完整.next副本；backup-targets.tar.gz及manifest.json保留目标原字节和sha256。
- 临时补丁16文件（2后端保存chunk、画布SSR/尺寸chunk、3个客户端引用manifest、6个新静态chunk）。精确校验原始SHA、文件路径、匹配数量、node --check后应用。
- 静态chunk使用 -ic1105.js 新文件名，旧文件保留，避免immutable缓存和已开页面404。
- 重启app后第2次readiness通过；公网ready200。
- 实际线上16个文件SHA匹配；6个公网新chunk均200且内容hash匹配。
- 生产实际normalizer执行2172×724构造图，传目标1824×1024，结果原字节完全相同、真实尺寸2172×724。
- 更新前后近6小时pending/running任务定向查询均为空；未对任务作修改。
- 镜像标签不变（临时容器文件补丁，不是正式镜像）。重建容器会丢失临时补丁；正式发布应移植源码，不依赖此运行状态。

## 回退

先核对仍是上述基线镜像且未被后续发布替换，再执行：

```sh
docker exec -u 0 vozeb-pro node /tmp/vozeb-image-contain-hotpatch/rollback.cjs
docker restart vozeb-pro
curl -fsS http://127.0.0.1:3000/api/health/ready
```

rollback校验文件为本补丁或原版，恢复10个被覆盖文件；保留6个新增静态文件，避免已打开的客户端404。服务器host也保存rollback.cjs；容器重建后不可盲目运行旧补丁。

## 验收缺口

PL没有生产登录态，访问生产跳转login；未绕过鉴权或伪造session。用户需刷新生产画布检验新结果及留边效果。未真实付费生图，无法将线上检查描述为真实上游生成端到端已通过。用户确认前不正式推送测试/生产。