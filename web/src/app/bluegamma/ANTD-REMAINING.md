# 布鲁伽马改版 · 尚未替换为 gamma-ui 的 antd 组件

> 2026-10-16 盘点。范围：非画布页面（画布及其依赖闭包不改，见 `README.md`）。
> 这些组件**外观已统一**：`lib/app-theme.ts` 的品牌主题 + `app/styles/global-gamma-skin.css` 在 `html.gm-app` 下把它们换成布鲁伽马配色、圆角、玻璃浮层。
> 下面只是「组件实现仍是 antd」，后续可按表格顺序逐个替换。

## 已替换（gamma-ui 兼容层，同名同 API）

| 文件 | 组件 |
| --- | --- |
| `components/gamma-ui/gamma-ant.tsx` | Button · Tag · Segmented · Switch · Checkbox · Spin · Empty · Alert · Pagination |
| `components/gamma-ui/gamma-ant-input.tsx` | Input · Input.TextArea · Input.Search · Input.Password · InputNumber |
| `components/gamma-ui/gamma-ant-overlay.tsx` | Tooltip · Tabs · Popconfirm |
| `components/gamma-ui/gamma-ant-display.tsx` | Space · Card · Skeleton · Progress · Divider · Avatar · Steps · Timeline · Collapse · Typography · Radio · Slider · List |
| `components/gamma-ui/gamma-ant-modal.tsx` | Modal · Drawer（`Modal.confirm` 等静态方法仍委托 antd） |

页面只把这些组件的 import 从 `"antd"` 改到兼容层，调用处不动。

## 未替换（按建议顺序）

| 优先级 | 组件 | 引用文件数 | 为什么暂不替换 | 替换要点 |
| --- | --- | --- | --- | --- |
| 1 | Popover | 9 | Agent 创作页 composer 依赖 `autoAdjustOverflow`、受控 open、`trigger={[]}` 等定位细节；e2e 用 `.ant-popover` 定位 | radix Popover；保留 `.ant-popover` 类名；对齐 `creative-composer-popover.ts` 的翻转规则 |
| 2 | Dropdown | 7 | `menu.items` 嵌套、`popupRender` 包裹、`getPopupContainer` | radix DropdownMenu；`menu={{ items, onClick }}` 形状不变；`popupRender` 里的 `.ant-dropdown-menu*` 选择器要同步改 |
| 3 | Image / Image.PreviewGroup | 17 | 点击预览、组内切换、缩放 | 复用 `GammaLightbox`；`preview={{ src }}` / `preview={false}` |
| 4 | QRCode · Grid（`Grid.useBreakpoint`）· Tree · AutoComplete | 4 · 4 · 1 · 2 | 用量少但各自有专门逻辑 | QRCode 换 `qrcode` 生成 SVG；useBreakpoint 换 matchMedia hook |
| 5 | DatePicker | 8 | 日期面板、区间选择、dayjs 值类型 | 需要一套 gamma 日历；值类型保持 dayjs |
| 6 | Upload / Upload.Dragger | 5 | `beforeUpload`、`fileList`、拖拽、`customRequest` | 原生 input + 拖拽区；保持 `beforeUpload` 返回 false 的手动上传语义 |
| 7 | Select（含 `mode="multiple"` / `"tags"` / `showSearch`） | 73 | 188 处调用；多选、标签输入、搜索过滤、`optionRender`、在 Form 中受控 | 风险最高：先做单选 + 搜索，再做 multiple/tags；保留 `.ant-select-dropdown` / `.ant-select-item-option`（e2e 在用） |
| 8 | Form / Form.Item / Form.useForm | 29 | 校验规则、`name` 路径、`getValueFromEvent`、`dependencies` 联动 | 建议保留 rc-field-form 作引擎，只换 `Form.Item` 的布局与报错样式 |
| 9 | Table | 27 | 分页、勾选、`scroll`、`fixed` 列、空态 | 列定义 `columns` 形状不变；先做无 fixed 列的表 |
| — | App / message / notification / Modal.confirm | 94 | 命令式 API（`App.useApp()`），已由品牌主题换肤 | 不建议替换，保持 antd |

## 替换时的检查清单

- 先跑 `过程文件/bluegamma-rollout/survey-props.mjs` 统计该组件实际用到的 props，只实现用到的
- 用 `过程文件/bluegamma-rollout/codemod-gamma-ant.mjs` 加一个 GROUP 批量改 import，再跑 `merge-imports.mjs` 合并重复 import
- 有 `vi.mock("antd", …)` 的测试要把 mock 目标改成对应兼容层文件
- e2e 用到的 antd 类名（`.ant-modal-body`、`.ant-select-dropdown`、`.ant-popover`、`.ant-pagination-next` 等）要在兼容层里保留
- `canvas-isolation.test.ts` 必须保持通过：画布依赖闭包里的文件不能改
