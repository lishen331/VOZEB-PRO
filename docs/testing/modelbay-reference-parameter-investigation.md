# ModelBay reference parameter investigation

Source: authenticated ModelBay pricing UI, premium/seedance-2 API panel.

Capability description declares image-to-video and video references. The observed complete parameter table lists only prompt/resolution/duration. Reference field path, format and cardinality remain unconfirmed. No billable request made during this investigation. Prior text-only success does not prove reference support.

```text
调用示例
cURL
Python
TypeScript
JavaScript
# 1. submit — returns {"code":"success","data":{"task_id":"..."}}
curl https://api.modelbay.io/video/submit \
  -H "Authorization: Bearer $NEW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
       "model": "premium/seedance-2",
       "input": {
         "prompt": "a small wooden sailboat drifting on a calm lake at dawn, gentle camera push-in",
         "resolution": "720p",
         "duration": 5
       }
     }'


# 2. poll until status is SUCCESS or FAILURE
curl "https://api.modelbay.io/video/fetch/<TASK_ID>" \
  -H "Authorization: Bearer $NEW_API_KEY"

替换 <YOUR_API_KEY> 替换为令牌设置中的 API Key。

身份验证

所有请求必须携带 Authorization: Bearer <TOKEN> 请求头。Anthropic 格式的端点也接受 x-api-key 请求头。

在「令牌」页面生成 API Key，可以按模型、分组、IP、速率等维度精细化授权。

支持的参数
参数	类型	默认值 / 范围	说明信息

prompt
必填

string
	—
该模型必填；原样透传给上游


resolution
必填

string
	—
该模型必填；原样透传给上游


duration
必填

number
	—
该模型必填；原样透传给上游
```
