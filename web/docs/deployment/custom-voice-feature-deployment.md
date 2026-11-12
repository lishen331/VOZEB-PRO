# 自定义音色功能部署和测试指南

## 功能概述

自定义音色功能允许用户通过两种方式创建专属音色：

- **语音克隆 (clone)**: 上传音频文件，系统克隆出相似音色
- **语音设计 (design)**: 通过文本描述生成符合要求的音色

支持两个供应商：

- **minimax**: 付费服务，每个音色 9.9 CNY（约 99 积分）
- **qwen**: 免费服务

## 一、前置检查

### 1.1 代码更改清单

确认以下文件已包含所有必需更改：

✅ **src/lib/auth/store-types.ts**

- 第 10 行：`import type { VoiceCustomizationConfig } from "@/lib/custom-voice-config";`
- 第 210 行：`voiceCustomization?: VoiceCustomizationConfig;` 添加到 `SystemChannelAdvancedConfig`

✅ **src/lib/server/database/schema.ts**

- 第 9 行：`import { SCHEMA_CUSTOM_VOICES } from "./schema-custom-voices";`
- 第 1179 行附近：`${SCHEMA_CUSTOM_VOICES}` 包含在 `POSTGRESQL_SCHEMA_SQL` 模板字符串中

✅ **新增文件**

- `src/lib/custom-voice-config.ts` - 配置类型定义和工具函数
- `src/lib/server/custom-voice-store.ts` - 数据库操作层
- `src/lib/server/custom-voice-upstream.ts` - 上游供应商集成
- `src/lib/server/database/schema-custom-voices.ts` - 数据库 schema 定义
- `src/app/api/custom-voices/route.ts` - 列表和创建 API
- `src/app/api/custom-voices/[id]/route.ts` - 单个音色 CRUD API

### 1.2 依赖检查

```bash
# 检查 TypeScript 编译
cd web
npm run build

# 预期结果：编译成功，无类型错误
```

## 二、环境配置

### 2.1 数据库配置

确保测试环境配置了 PostgreSQL 连接：

```env
# .env.local 或环境变量
DATABASE_URL=postgresql://user:password@host:port/database
```

### 2.2 系统渠道配置

需要在系统设置中配置支持音色定制的 TTS 渠道。以下是配置示例：

#### Minimax 渠道配置示例

```json
{
    "id": "minimax-tts-01",
    "name": "Minimax TTS",
    "baseUrl": "https://api.minimax.chat/v1",
    "apiKey": "YOUR_MINIMAX_API_KEY",
    "apiFormat": "openai",
    "models": ["speech-01-turbo"],
    "enabled": true,
    "purpose": "audio",
    "advancedConfig": {
        "protocol": "compatible",
        "voiceCustomization": {
            "provider": "minimax",
            "enabled": true,
            "audioLimits": {
                "minSeconds": 3,
                "maxSeconds": 30,
                "maxMB": 10,
                "formats": ["mp3", "wav", "m4a"]
            },
            "cloneLimits": {
                "maxVoicesPerUser": 10
            },
            "designLimits": {
                "enabled": true,
                "promptMin": 10,
                "promptMax": 500,
                "previewTextMin": 20,
                "previewTextMax": 200
            },
            "pricing": {
                "createVoiceUSD": 1.39,
                "deleteVoiceUSD": 0
            },
            "apiPaths": {
                "voiceClone": "/voice_clone",
                "voiceDesign": "/voice_design",
                "voiceDelete": "/voice/{voice_id}"
            }
        }
    }
}
```

#### Qwen 渠道配置示例

```json
{
    "id": "qwen-tts-01",
    "name": "Qwen TTS",
    "baseUrl": "https://dashscope.aliyuncs.com/api/v1",
    "apiKey": "YOUR_QWEN_API_KEY",
    "apiFormat": "openai",
    "models": ["cosyvoice-v1"],
    "enabled": true,
    "purpose": "audio",
    "advancedConfig": {
        "protocol": "qwen-tts",
        "voiceCustomization": {
            "provider": "qwen",
            "enabled": true,
            "audioLimits": {
                "minSeconds": 3,
                "maxSeconds": 30,
                "maxMB": 10,
                "formats": ["mp3", "wav"]
            },
            "cloneLimits": {
                "maxVoicesPerUser": 20
            },
            "designLimits": {
                "enabled": true,
                "promptMin": 10,
                "promptMax": 300,
                "previewTextMin": 10,
                "previewTextMax": 100
            },
            "pricing": {
                "createVoiceUSD": 0,
                "deleteVoiceUSD": 0
            },
            "apiPaths": {
                "voiceClone": "/services/aigc/text2speech/create-personal-voice",
                "voiceQuery": "/services/aigc/text2speech/query-personal-voice"
            }
        }
    }
}
```

配置方式：

1. 通过管理后台 `/admin/settings` → 系统渠道 → 添加/编辑渠道
2. 或直接修改 `data/auth-db.json` 的 `settings.systemChannels` 数组

## 三、部署步骤

### 3.1 代码部署

```bash
# 1. 拉取代码到测试环境
git pull origin <feature-branch>

# 2. 安装依赖（如有新增）
cd web
npm install

# 3. 构建应用
npm run build

# 预期结果：构建成功，生成 .next 目录
```

### 3.2 数据库初始化

应用首次访问数据库时会自动创建 `custom_voices` 表，无需手动执行 SQL。

验证表是否创建：

```sql
-- 连接到测试数据库
psql $DATABASE_URL

-- 检查表结构
\d custom_voices

-- 预期输出：
-- 表 "public.custom_voices"
--     列名            |  类型  |  说明
-- -------------------+--------+--------
-- id                | text   | 主键
-- owner_user_id     | text   | 用户 ID
-- channel_id        | text   | 渠道 ID
-- provider          | text   | minimax 或 qwen
-- tts_model         | text   | 模型名称
-- kind              | text   | clone 或 design
-- name              | text   | 音色名称
-- status            | text   | creating/ready/failed/deleted
-- upstream_voice_id | text   | 上游音色 ID
-- preview_url       | text   | 试听链接
-- preview_mime_type | text   | 试听文件类型
-- failure_reason    | text   | 失败原因
-- shared            | boolean| 是否共享
-- charge_receipt_id | text   | 扣费凭证 ID
-- upstream_request_id| text  | 上游请求 ID
-- last_used_at      | timestamptz | 最后使用时间
-- expires_at        | timestamptz | 过期时间
-- created_at        | timestamptz | 创建时间
-- updated_at        | timestamptz | 更新时间

-- 检查索引
\di custom_voices*

-- 预期输出：
-- custom_voices_pkey (PRIMARY KEY)
-- custom_voices_owner_idx (owner_user_id)
-- custom_voices_shared_idx (shared WHERE shared = true)
-- custom_voices_expires_idx (expires_at WHERE expires_at IS NOT NULL)
```

### 3.3 启动应用

```bash
# 开发环境
npm run dev

# 生产环境
npm start

# 预期输出：
# ▲ Next.js ...
# - Local:        http://localhost:3000
# - Ready in ...
```

### 3.4 健康检查

```bash
# 检查应用是否正常运行
curl http://localhost:3000/api/health

# 或访问任意公开页面
curl http://localhost:3000/
```

## 四、功能测试

### 4.1 测试准备

1. **创建测试用户**
    - 注册或使用现有测试账号
    - 确保账号有足够积分（至少 100 积分用于测试 minimax）

2. **准备测试音频**
    - 准备一个 3-30 秒的音频文件（MP3/WAV/M4A）
    - 文件大小 < 10MB
    - 音质清晰，无背景噪音

3. **获取认证 token**
    ```bash
    # 登录获取 session token
    curl -X POST http://localhost:3000/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"username":"testuser","password":"testpass"}'

    # 保存返回的 token
    export TOKEN="<session-token>"
    ```

### 4.2 测试用例

#### 测试 1：列出音色（空列表）

```bash
curl http://localhost:3000/api/custom-voices \
  -H "Authorization: Bearer $TOKEN"

# 预期结果：
{
  "voices": []
}
```

#### 测试 2：语音克隆创建（Minimax）

```bash
# 将音频文件转为 base64
AUDIO_BASE64=$(base64 -w 0 test-audio.mp3)

curl -X POST http://localhost:3000/api/custom-voices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "clone",
    "name": "测试音色-克隆",
    "ttsModel": "speech-01-turbo",
    "audioData": "'$AUDIO_BASE64'",
    "audioFormat": "mp3"
  }'

# 预期结果：
{
  "voice": {
    "id": "<uuid>",
    "ownerUserId": "<user-id>",
    "channelId": "minimax-tts-01",
    "provider": "minimax",
    "ttsModel": "speech-01-turbo",
    "kind": "clone",
    "name": "测试音色-克隆",
    "status": "creating",
    "upstreamRequestId": "<request-id>",
    "chargeReceiptId": "<receipt-id>",
    "createdAt": "2024-...",
    "updatedAt": "2024-..."
  }
}

# 保存 voice.id 用于后续测试
export VOICE_ID="<uuid>"
```

**验证点**：

- ✅ 返回状态码 200
- ✅ voice.status = "creating" 或 "ready"
- ✅ 包含 chargeReceiptId（扣费凭证）
- ✅ 包含 upstreamRequestId（上游请求 ID）
- ✅ 积分余额减少约 99 积分

#### 测试 3：语音设计创建（Qwen 免费）

```bash
curl -X POST http://localhost:3000/api/custom-voices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "design",
    "name": "测试音色-设计",
    "ttsModel": "cosyvoice-v1",
    "prompt": "一位温柔的女性声音，语速适中，音调柔和，适合讲述故事和朗读文章",
    "previewText": "欢迎使用自定义音色功能，这是一段测试文本，用于生成音色预览"
  }'

# 预期结果：
{
  "voice": {
    "id": "<uuid>",
    "provider": "qwen",
    "kind": "design",
    "status": "creating",
    ...
  }
}

export VOICE_ID_DESIGN="<uuid>"
```

**验证点**：

- ✅ 返回状态码 200
- ✅ 积分余额不变（免费）
- ✅ status = "creating"

#### 测试 4：查询单个音色

```bash
curl http://localhost:3000/api/custom-voices/$VOICE_ID \
  -H "Authorization: Bearer $TOKEN"

# 预期结果：
{
  "voice": {
    "id": "<voice-id>",
    "status": "ready",  # 或仍为 "creating"
    "upstreamVoiceId": "<upstream-id>",
    "previewUrl": "https://...",  # 如果已完成
    ...
  }
}
```

**验证点**：

- ✅ 如果 status = "ready"，应包含 upstreamVoiceId
- ✅ 如果提供商支持预览，应包含 previewUrl
- ✅ 如果 status = "failed"，应包含 failureReason

#### 测试 5：列出音色（非空列表）

```bash
curl http://localhost:3000/api/custom-voices \
  -H "Authorization: Bearer $TOKEN"

# 预期结果：
{
  "voices": [
    {
      "id": "<voice-id-1>",
      "name": "测试音色-克隆",
      "kind": "clone",
      "provider": "minimax",
      ...
    },
    {
      "id": "<voice-id-2>",
      "name": "测试音色-设计",
      "kind": "design",
      "provider": "qwen",
      ...
    }
  ]
}
```

#### 测试 6：按模型过滤

```bash
# 只列出 minimax 的音色
curl "http://localhost:3000/api/custom-voices?ttsModel=speech-01-turbo" \
  -H "Authorization: Bearer $TOKEN"

# 预期结果：只返回 ttsModel = "speech-01-turbo" 的音色
```

#### 测试 7：更新音色名称

```bash
curl -X PATCH http://localhost:3000/api/custom-voices/$VOICE_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试音色-重命名"
  }'

# 预期结果：
{
  "voice": {
    "id": "<voice-id>",
    "name": "测试音色-重命名",
    ...
  }
}
```

#### 测试 8：设置共享状态

```bash
curl -X PATCH http://localhost:3000/api/custom-voices/$VOICE_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shared": true
  }'

# 预期结果：
{
  "voice": {
    "shared": true,
    ...
  }
}
```

**然后用另一个用户测试访问**：

```bash
# 用另一个用户的 token
curl "http://localhost:3000/api/custom-voices?shared=true" \
  -H "Authorization: Bearer $TOKEN_USER2"

# 预期结果：能看到用户 1 共享的音色
```

#### 测试 9：删除音色

```bash
curl -X DELETE http://localhost:3000/api/custom-voices/$VOICE_ID \
  -H "Authorization: Bearer $TOKEN"

# 预期结果：
{
  "success": true
}
```

**验证**：

```bash
# 再次查询应返回 404 或 status = "deleted"
curl http://localhost:3000/api/custom-voices/$VOICE_ID \
  -H "Authorization: Bearer $TOKEN"

# 预期：404 或音色状态为 "deleted"
```

### 4.3 错误场景测试

#### 测试 10：积分不足

```bash
# 使用积分余额为 0 的测试账号
curl -X POST http://localhost:3000/api/custom-voices \
  -H "Authorization: Bearer $TOKEN_NO_POINTS" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "clone",
    "name": "测试",
    "ttsModel": "speech-01-turbo",
    "audioData": "'$AUDIO_BASE64'",
    "audioFormat": "mp3"
  }'

# 预期结果：
{
  "error": "Insufficient points"
}
# 状态码：400 或 402
```

#### 测试 11：音频文件过大

```bash
# 使用 > 10MB 的音频文件
LARGE_AUDIO_BASE64=$(base64 -w 0 large-audio.mp3)

curl -X POST http://localhost:3000/api/custom-voices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "clone",
    "name": "测试",
    "ttsModel": "speech-01-turbo",
    "audioData": "'$LARGE_AUDIO_BASE64'",
    "audioFormat": "mp3"
  }'

# 预期结果：
{
  "error": "Audio file too large (max 10MB)"
}
# 状态码：400
```

#### 测试 12：缺少必填字段

```bash
curl -X POST http://localhost:3000/api/custom-voices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "clone",
    "ttsModel": "speech-01-turbo"
  }'

# 预期结果：
{
  "error": "name is required"
}
# 状态码：400
```

#### 测试 13：未配置的模型

```bash
curl -X POST http://localhost:3000/api/custom-voices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "clone",
    "name": "测试",
    "ttsModel": "non-existent-model",
    "audioData": "'$AUDIO_BASE64'",
    "audioFormat": "mp3"
  }'

# 预期结果：
{
  "error": "Channel not found or voice customization not enabled"
}
# 状态码：404
```

#### 测试 14：未授权访问

```bash
# 不带 Authorization header
curl http://localhost:3000/api/custom-voices

# 预期结果：
{
  "error": "Unauthorized"
}
# 状态码：401
```

#### 测试 15：访问他人私有音色

```bash
# 用用户 2 的 token 访问用户 1 的私有音色
curl http://localhost:3000/api/custom-voices/$VOICE_ID_USER1 \
  -H "Authorization: Bearer $TOKEN_USER2"

# 预期结果：
{
  "error": "Forbidden"
}
# 状态码：403
```

### 4.4 退款机制测试

#### 测试 16：上游 API 失败后自动退款

这个需要模拟上游 API 失败，可通过以下方式：

1. 临时修改渠道配置，使用错误的 API Key
2. 或使用网络拦截工具模拟 API 失败

```bash
# 使用错误的 API Key 配置的渠道
curl -X POST http://localhost:3000/api/custom-voices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "clone",
    "name": "测试退款",
    "ttsModel": "speech-01-turbo",
    "audioData": "'$AUDIO_BASE64'",
    "audioFormat": "mp3"
  }'

# 预期结果：
{
  "error": "Upstream API error: ..."
}
# 状态码：500
```

**验证退款**：

```bash
# 查看积分变化记录
curl http://localhost:3000/api/point-records \
  -H "Authorization: Bearer $TOKEN"

# 预期：应该有两条记录
# 1. consume（扣费）-99 积分
# 2. refund（退款）+99 积分
# 余额应恢复到扣费前
```

## 五、数据验证

### 5.1 检查数据库记录

```sql
-- 查看所有音色记录
SELECT
  id,
  owner_user_id,
  provider,
  kind,
  name,
  status,
  upstream_voice_id,
  created_at,
  updated_at
FROM custom_voices
ORDER BY created_at DESC;

-- 检查共享音色
SELECT id, name, shared, owner_user_id
FROM custom_voices
WHERE shared = TRUE;

-- 检查失败记录
SELECT id, name, status, failure_reason
FROM custom_voices
WHERE status = 'failed';

-- 检查已删除记录
SELECT id, name, status, updated_at
FROM custom_voices
WHERE status = 'deleted';
```

### 5.2 检查积分扣费记录

```sql
-- 查看自定义音色相关的积分记录
SELECT
  id,
  user_id,
  type,
  amount,
  balance_after,
  description,
  model,
  idempotency_key,
  created_at
FROM point_records
WHERE description LIKE '%custom-voice%'
   OR idempotency_key LIKE 'custom-voice-%'
   OR idempotency_key LIKE 'refund-custom-voice-%'
ORDER BY created_at DESC;
```

## 六、常见问题排查

### 6.1 表不存在错误

**错误**：`relation "custom_voices" does not exist`

**原因**：schema 未正确集成或数据库未初始化

**解决**：

1. 确认 `schema.ts` 已导入 `SCHEMA_CUSTOM_VOICES`
2. 确认 `POSTGRESQL_SCHEMA_SQL` 包含 `${SCHEMA_CUSTOM_VOICES}`
3. 重启应用触发自动初始化
4. 或手动执行 SQL：
    ```bash
    psql $DATABASE_URL < src/lib/server/database/schema-custom-voices.ts
    ```

### 6.2 TypeScript 类型错误

**错误**：`Property 'voiceCustomization' does not exist on type 'SystemChannelAdvancedConfig'`

**原因**：`store-types.ts` 未添加类型定义

**解决**：

1. 确认第 10 行有 `import type { VoiceCustomizationConfig } ...`
2. 确认第 210 行有 `voiceCustomization?: VoiceCustomizationConfig;`
3. 重新编译：`npm run build`

### 6.3 上游 API 调用失败

**错误**：`Upstream API error: 401 Unauthorized` 或类似

**原因**：

- API Key 未配置或错误
- API Key 权限不足
- 渠道 baseUrl 错误

**解决**：

1. 检查渠道配置的 `apiKey` 是否正确
2. 检查 `baseUrl` 是否正确（注意是否需要 `/v1` 后缀）
3. 在上游服务商控制台确认 API Key 状态和权限

### 6.4 积分未正确扣除/退款

**症状**：创建失败但积分已扣除，未退款

**排查**：

1. 检查 `point_records` 表是否有对应的 refund 记录
2. 检查应用日志是否有 `refundGenerationCharge` 调用错误
3. 检查 `idempotencyKey` 是否唯一（不应重复）

**手动退款**（如需要）：

```bash
# 通过管理后台或 API 手动调整积分
curl -X POST http://localhost:3000/api/admin/points/adjust \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "<user-id>",
    "amount": 99,
    "description": "Manual refund for failed custom voice creation"
  }'
```

### 6.5 音色创建一直停留在 "creating" 状态

**原因**：

- 上游 API 异步任务未完成
- 缺少轮询或回调机制（当前版本尚未实现）

**临时解决**：

- 等待上游任务完成（通常 1-5 分钟）
- 手动查询上游 API 状态
- 未来版本将实现自动轮询和 webhook 回调

## 七、部署检查清单

部署到测试环境前，确认以下项目：

- [ ] 代码已编译成功，无 TypeScript 错误
- [ ] 数据库连接配置正确（DATABASE_URL）
- [ ] 至少配置了一个支持音色定制的渠道（minimax 或 qwen）
- [ ] 渠道的 `advancedConfig.voiceCustomization` 已正确配置
- [ ] 应用启动成功，健康检查通过
- [ ] 数据库表 `custom_voices` 已创建，包含所有列和索引
- [ ] 测试用例 1-9（核心功能）全部通过
- [ ] 测试用例 10-15（错误处理）全部通过
- [ ] 测试用例 16（退款机制）通过
- [ ] 数据库中有正确的扣费和退款记录
- [ ] 共享功能正常工作（用户间可见性）
- [ ] 日志中无严重错误或警告

## 八、回滚方案

如果部署后出现严重问题，可按以下步骤回滚：

### 8.1 代码回滚

```bash
# 回退到上一个稳定版本
git checkout <previous-stable-commit>

# 重新构建和启动
npm run build
npm start
```

### 8.2 数据库回滚

```sql
-- 如需删除表（谨慎操作）
DROP TABLE IF EXISTS custom_voices CASCADE;

-- 如需保留表但清空数据
DELETE FROM custom_voices;
```

### 8.3 积分数据修复

如果有用户因 bug 损失积分：

```sql
-- 查询受影响的用户
SELECT DISTINCT owner_user_id, COUNT(*)
FROM custom_voices
WHERE status = 'failed'
  AND charge_receipt_id IS NOT NULL
  AND created_at > '<deployment-time>'
GROUP BY owner_user_id;

-- 管理员手动补偿（通过管理后台或 API）
```

## 九、监控建议

部署后建议监控以下指标：

1. **API 错误率**
    - `/api/custom-voices` 的 4xx/5xx 错误率
    - 应 < 5%

2. **上游 API 成功率**
    - minimax/qwen API 调用成功率
    - 应 > 95%

3. **平均响应时间**
    - 创建音色接口响应时间
    - 应 < 3 秒

4. **音色创建成功率**
    - `status = 'ready'` 的比例
    - 应 > 90%

5. **退款率**
    - 自动退款记录数量
    - 应 < 5%

6. **用户使用量**
    - 每日创建的音色数量
    - 每日活跃用户数

## 十、总结

完成以上所有步骤后，自定义音色功能已在测试环境部署完毕并通过完整测试。

**后续工作**：

1. 在测试环境运行 1-2 天，收集真实用户反馈
2. 修复发现的 bug（如有）
3. 完善前端 UI（如需要）
4. 准备生产环境部署方案
5. 编写用户使用文档

**生产环境部署注意事项**：

- 提前通知用户（可能需要短暂维护）
- 在低峰时段部署
- 准备回滚方案
- 密切监控前 24 小时的运行状况
- 准备快速响应机制处理紧急问题
