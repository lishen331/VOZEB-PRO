# RunningHub 工作流配置体验优化计划

## 目标用户画像
**普通运维人员**：
- 不懂代码，不懂 JSON
- 只需要通过界面点击配置
- 能够测试工作流是否正常运行
- 不需要理解底层节点映射逻辑

---

## 当前问题分析

### 1. 配置流程复杂度过高
**现状**：
```
1. 填写基础信息（工作流名称、业务code、capability、Workflow ID）
2. 点击"读取工作流"按钮
3. 切换到"识别结果"标签页
4. 手动勾选需要的输入/输出候选项
5. 切换到"节点与出参高级信息"标签页
6. 手动编辑 JSON（inputSchema / nodeMappings / outputMappings）
7. 点击保存
8. 回到列表，找到工作流，点击测试按钮
9. 填写测试参数
10. 查看测试结果
```

**问题**：
- 步骤过多，运维人员容易迷失
- 需要理解 inputSchema、nodeMappings、outputMappings 的区别
- 需要手动编辑 JSON
- 勾选候选项和保存之间没有明确的因果关系（用户勾选了但保存后消失）

### 2. 识别结果与保存配置脱节
**现状**：
- `discover()` 函数调用后，生成 `suggestedInputs/suggestedNodeMappings/suggestedOutputs`
- 这些建议直接写入 `draft` 和 `jsonText` 状态
- 用户在"识别结果"标签页看到的候选项复选框，仅控制 `selectedCandidates` 状态
- 保存时，代码从 `jsonText` 解析 JSON，**忽略** `selectedCandidates`
- 结果：用户勾选/取消勾选操作不影响最终保存的配置

**核心代码问题**：
```typescript
// runninghub-workflow-editor.tsx:86-94
const submit = async () => {
    // ...
    const inputSchema = parseJson("inputSchema", "array");
    const nodeMappings = parseJson("nodeMappings", "array");
    const outputMappings = parseJson("outputMappings", "array");
    // 直接使用 JSON 编辑器里的配置，不根据勾选过滤
    const confirmedNodeMappings = nodeMappings;
    const confirmedOutputMappings = outputMappings;
    // ...
}
```

注释明确说明："直接使用 JSON 编辑器里的配置，不根据勾选过滤"

### 3. discovery 自动识别不准确
**已修复**：
- ✅ 提示词字段被误判为图片（优先级问题）
- ✅ UI 配置字段被误判为图片（只看扩展名不看字段名）

**仍存在的问题**：
- 可能有些工作流的提示词字段名不是标准的 `prompt/text/value`
- 可能有些工作流的图片字段没有明确的文件扩展名
- 运维人员无法手动标记"这个字段应该是提示词"

### 4. 测试面板缺少即时反馈
**现状**：
- 测试面板仅读取 `workflow.inputSchema`
- 如果 `inputSchema` 不包含某个字段，测试面板就不显示
- 运维人员必须先保存配置，才能在测试面板看到效果
- 没有"预览"功能

---

## 设计方案

### 方案 A：保留当前架构，修复体验问题（推荐）

**核心改动**：
1. **识别结果复选框真正生效**：保存时根据 `selectedCandidates` 过滤配置
2. **JSON 编辑器改为只读预览**：不允许运维人员手动编辑，避免混乱
3. **增加"手动添加字段"功能**：当自动识别不准时，运维可以手动标记字段类型
4. **增加"保存前预览"功能**：在保存前弹窗显示最终的 inputSchema，让运维确认

**优点**：
- 改动量小，不破坏现有架构
- 运维人员不需要理解 JSON
- 保留高级用户的灵活性（可以通过勾选精确控制）

**缺点**：
- 仍需要两个步骤：读取工作流 → 勾选 → 保存
- 对于简单场景（全选所有候选项）仍显冗余

---

### 方案 B：完全傻瓜式，一键配置（激进）

**核心改动**：
1. **删除"识别结果"标签页**
2. **删除"节点与出参高级信息"标签页**
3. **点击"读取工作流"后，自动应用所有建议并保存**
4. **测试面板直接嵌入编辑器底部**，保存后立即可测试

**流程简化为**：
```
1. 填写工作流名称 + Workflow ID
2. 点击"读取工作流"按钮
3. 自动保存（无需手动点保存）
4. 在下方测试区域立即填写参数测试
```

**优点**：
- 极致简化，运维人员无需思考
- 适合 90% 的标准工作流

**缺点**：
- 完全依赖自动识别准确性
- 无法处理复杂场景（需要手动排除某些字段）
- 删除了灵活性

---

### 方案 C：混合模式（平衡）

**核心改动**：
1. **默认模式：简化版**
   - 只显示：工作流名称 + Workflow ID + "读取并保存"按钮
   - 点击后自动应用所有建议并保存
   
2. **高级模式：完整版**
   - 显示"识别结果"标签页，允许手动勾选
   - 显示 JSON 编辑器，允许手动调整
   - 通过顶部"切换高级模式"按钮启用

**优点**：
- 兼顾新手和高级用户
- 简单场景不暴露复杂度
- 复杂场景保留灵活性

**缺点**：
- 实现成本最高
- UI 需要额外的模式切换逻辑

---

## 推荐方案：**方案 A + 部分 C**

### 具体实施计划

#### Phase 1：修复当前问题（高优先级）
1. **让复选框生效**
   ```typescript
   // runninghub-workflow-editor.tsx:submit()
   const confirmedInputs = inputSchema.filter(input => 
       selectedCandidates.some(c => c.endsWith(`.${input.key}`))
   );
   const confirmedNodeMappings = nodeMappings.filter(mapping => 
       selectedCandidates.includes(`${mapping.nodeId}.${mapping.fieldName}`)
   );
   ```

2. **JSON 编辑器改为只读 + 提示**
   ```tsx
   <Input.TextArea 
       value={jsonText[key]}
       readOnly
       placeholder="根据上方复选框自动生成，保存前可在此确认"
   />
   ```

3. **增加保存前确认弹窗**
   ```tsx
   <Modal title="确认配置" onOk={realSubmit}>
       <p>即将保存以下输入字段：</p>
       <ul>
           {confirmedInputs.map(i => <li>{i.label} ({i.type})</li>)}
       </ul>
   </Modal>
   ```

#### Phase 2：增强易用性（中优先级）
1. **增加"手动添加字段"功能**
   - 在"识别结果"标签页底部增加"+ 手动添加输入字段"按钮
   - 弹窗让运维选择：字段类型（提示词/图片/视频/音频/数值）、字段标签、是否必填
   - 手动添加的字段直接加入 `selectedCandidates`

2. **增加"快速预览"功能**
   - 在"识别结果"标签页右侧增加实时预览面板
   - 显示："勾选后，测试面板将显示以下输入框："
   - 运维可以在保存前看到测试面板的样子

#### Phase 3：流程优化（低优先级）
1. **自动切换标签页**
   - 点击"读取工作流"后，自动跳转到"识别结果"标签页
   - 显眼提示："请勾选需要的输入字段，然后点击右上角保存"

2. **增加"一键应用所有建议"按钮**
   - 在"识别结果"标签页顶部增加"全选建议"按钮
   - 点击后自动勾选所有 suggested 字段，并跳到保存按钮

---

## TDD 实施计划

### Test 1：复选框过滤逻辑
```typescript
// runninghub-workflow-editor.test.tsx
describe('WorkflowEditor', () => {
    it('should filter inputSchema by selectedCandidates when saving', async () => {
        const discovery = {
            suggestedInputs: [
                { key: 'prompt', label: '提示词', type: 'textarea' },
                { key: 'referenceImage1', label: '参考图1', type: 'image' }
            ],
            suggestedNodeMappings: [...]
        };
        
        // 用户只勾选了 prompt，没勾选 referenceImage1
        const selectedCandidates = ['nodeA.prompt'];
        
        // 保存时应该只提交 prompt
        const savedPayload = await submitWorkflow(discovery, selectedCandidates);
        
        expect(savedPayload.inputSchema).toHaveLength(1);
        expect(savedPayload.inputSchema[0].key).toBe('prompt');
    });
});
```

### Test 2：自动识别准确性
```typescript
describe('WorkflowDiscovery', () => {
    it('should prioritize semantic field name over file extension', () => {
        const node = { type: 'TextNode', inputs: { prompt: 'example.png' } };
        const role = classifyRole(node, 'prompt', 'example.png');
        expect(role).toBe('prompt'); // 不应该是 'image'
    });
    
    it('should not treat UI config fields as images', () => {
        const node = { type: 'ImageProcessor', inputs: { fit: 'contain.png' } };
        const role = classifyRole(node, 'fit', 'contain.png');
        expect(role).not.toBe('image'); // fit 是 UI 配置，不是图片输入
    });
});
```

### Test 3：保存前预览
```typescript
describe('SaveConfirmation', () => {
    it('should show preview modal before saving', async () => {
        const { getByText, getByRole } = render(<WorkflowEditor />);
        
        fireEvent.click(getByText('保存'));
        
        // 应该弹出确认弹窗
        expect(getByText('确认配置')).toBeInTheDocument();
        expect(getByText('提示词 (textarea)')).toBeInTheDocument();
        expect(getByText('参考图1 (image)')).toBeInTheDocument();
    });
});
```

---

## 实施优先级排序

### Sprint 1（本周）：修复核心问题
- [x] 修复 classifyRole 优先级问题（已完成）
- [ ] 让复选框过滤生效
- [ ] JSON 编辑器改为只读
- [ ] 编写 Test 1 和 Test 2

### Sprint 2（下周）：增强用户体验
- [ ] 增加保存前确认弹窗
- [ ] 增加手动添加字段功能
- [ ] 自动切换标签页
- [ ] 编写 Test 3

### Sprint 3（可选）：高级优化
- [ ] 增加快速预览面板
- [ ] 增加"一键应用所有建议"按钮
- [ ] 增加编辑模式切换（简化版 vs 高级版）

---

## 需要讨论的问题

1. **是否完全禁止手动编辑 JSON？**
   - 方案 A：改为只读，避免混乱
   - 备选：保留编辑能力，但增加警告提示

2. **复选框过滤的粒度？**
   - 当前：按 `nodeId.fieldName` 过滤（精细）
   - 备选：按 `inputSchema.key` 过滤（粗粒度，更简单）

3. **自动识别失败时的降级策略？**
   - 当前：显示候选项让用户勾选
   - 备选：允许用户完全手动配置（不依赖 discovery）

4. **是否需要"测试前必须保存"限制？**
   - 当前：测试面板读取已保存的 workflow.inputSchema
   - 备选：测试面板支持"预览模式"，可以测试未保存的配置

---

请告诉我：
1. 你倾向于哪个方案？（A / B / C）
2. 对于"需要讨论的问题"，你的选择是什么？
3. 是否有其他你认为重要但我遗漏的问题？

我们一起确定方案后，立即开始 TDD 实施。
