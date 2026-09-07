# 工作流调试步骤

## 1. 打开浏览器开发者工具
按 F12 或右键 → 检查

## 2. 切换到 Console 标签页

## 3. 粘贴并运行以下代码：

```javascript
// 调试工作流发现
const channelId = "你的渠道ID"; // 从页面获取
const workflowId = "2090436220538150914";
const capability = "image";

fetch("/api/admin/runninghub/workflows/discover", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ channelId, workflowIdOrUrl: workflowId, capability })
})
.then(r => r.json())
.then(result => {
  console.log("=== Discovery 结果 ===");
  console.log("Candidates:", result.data.candidates);
  console.log("Suggested Inputs:", result.data.suggestedInputs);
  console.log("Suggested Node Mappings:", result.data.suggestedNodeMappings);
  console.log("Warnings:", result.data.warnings);
  
  // 检查 prompt 相关
  const promptCandidates = result.data.candidates.filter(c => c.role === "prompt");
  console.log("\n=== Prompt 候选 ===");
  console.log("找到数量:", promptCandidates.length);
  console.log("详情:", promptCandidates);
  
  const promptInputs = result.data.suggestedInputs.filter(i => i.key === "prompt");
  console.log("\n=== Prompt Input Schema ===");
  console.log("找到数量:", promptInputs.length);
  console.log("详情:", promptInputs);
})
.catch(e => console.error("错误:", e));
```

## 4. 查看输出

重点看：
- `Prompt 候选` 的数量是多少？
- 如果是 0，说明工作流 JSON 里没有被识别为提示词的字段
- 如果 > 0，但 `Prompt Input Schema` 数量是 0，说明生成建议时被过滤了

## 5. 如果 Prompt 候选 = 0

说明需要检查工作流 JSON 原始数据。运行：

```javascript
fetch("/api/admin/runninghub/workflows/debug-raw", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ channelId: "你的渠道ID", workflowId: "2090436220538150914" })
})
.then(r => r.json())
.then(result => {
  console.log("=== 工作流原始 JSON ===");
  console.log(JSON.stringify(result.data.raw, null, 2));
})
.catch(e => console.error("错误:", e));
```

把输出结果复制给我，我来看看为什么提示词没被识别。
