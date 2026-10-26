# 布鲁伽马改版 · 尚未替换为 gamma-ui 的 antd 组件

> 2026-10-26 复盘（首次盘点于 2026-10-16，期间陆续迁移未同步更新本文档，这次按实际 import 重新核过一遍）。范围：非画布页面（画布及其依赖闭包不改，见 `README.md`）。
> 这些组件**外观已统一**：`lib/app-theme.ts` 的品牌主题 + `app/styles/global-gamma-skin.css` 在 `html.gm-app` 下把它们换成布鲁伽马配色、圆角、玻璃浮层。
> 下面只是「组件实现仍是 antd」，后续可按表格顺序逐个替换。

## 已替换（gamma-ui 兼容层，同名同 API）

| 文件                                        | 组件                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `components/gamma-ui/gamma-ant.tsx`         | Button · Tag · Segmented · Switch · Checkbox（含 `Checkbox.Group`，2026-10-26 补齐，迁移 3 个遗留文件：`admin-ip-library-section`、`admin-practice-section`、`agent-skill-create-modal`） · Spin · Empty · Alert · Pagination |
| `components/gamma-ui/gamma-ant-input.tsx`   | Input · Input.TextArea · Input.Search · Input.Password · InputNumber                                                     |
| `components/gamma-ui/gamma-ant-overlay.tsx` | Tooltip · Tabs · Popconfirm                                                                                              |
| `components/gamma-ui/gamma-ant-display.tsx` | Space · Card · Skeleton · Progress · Divider · Avatar · Steps · Timeline · Collapse · Typography · Radio · Slider · List |
| `components/gamma-ui/gamma-ant-modal.tsx`   | Modal · Drawer（`Modal.confirm` 等静态方法仍委托 antd）                                                                  |
| `components/gamma-ui/gamma-ant-overlay.tsx` | Popover（基于 radix Popover，复用 Popconfirm 的 toRadix() 转换；保留 `.ant-popover` 类名兼容既有 e2e 选择器；2026-10-25 迁移站内全部 9 个文件） |
| `components/gamma-ui/gamma-ant-overlay.tsx` | Dropdown（基于 radix DropdownMenu；`menu={{ items, selectable, selectedKeys, onClick }}` 形状不变，支持 icon/danger/disabled/divider；不支持子菜单；保留 `.ant-dropdown*` 类名；2026-10-20 迁移 6 个纯站内文件：drama-assets-panel、drama-agent-panel、drama-agent-history、creative-messages、creative-conversation-list、creative-assets-panel。2026-10-25 补齐画布共享 2 个文件：新增 `content`（等价 antd `popupRender`，整块自定义浮层）、`type: "header"`（等价 antd `type: "group"`，不可点击的标题项）、`panelStyle`（透传覆盖 `--gm-*` 变量，供不挂 `html.gm-app` 的画布路由用）；迁移 `canvas-image-reference-roles-popover`（用 `content`）、`user-status-actions`（用 `type: "header"` + 画布变体下的 `panelStyle`）） |
| `components/gamma-ui/gamma-ant-image.tsx`   | Image / Image.PreviewGroup（基于 radix Dialog 自建 lightbox；`preview={{ src, mask, open, onOpenChange, getContainer, cover }}` / `preview={false}` / `fallback` / `classNames.root\|image\|popup.root` / `styles.popup.{root,mask,body}` 形状不变；`PreviewGroup` 内多图共享一个 lightbox 支持上一张/下一张；2026-10-26 迁移站内全部 17 个文件，含画布共享文件 `components/agent/agent-media-preview.tsx`（用 `styles.popup` + `preview.getContainer` 挂到 document.body，画布路由本身不动）） |
| `components/gamma-ui/gamma-ant-qrcode.tsx`  | QRCode（用 `qrcode` 包的同步 `create()` 取模块位图，自画内联 SVG，不依赖 antd 内部的 `@rc-component/qrcode`；`value/size/type/className/bordered` 形状不变；2026-10-26 迁移站内全部 4 个文件） |
| `components/gamma-ui/gamma-ant-grid.tsx`    | Grid.useBreakpoint（`window.resize` 监听 + 标准断点阈值 sm≥576/md≥768/lg≥992/xl≥1200/xxl≥1600，返回形状与 antd 一致；2026-10-26 迁移站内 4 个非画布文件；画布自带的 2 份 `canvas-assets-panel.tsx` 不动） |
| `components/gamma-ui/gamma-ant-tree.tsx`    | Tree（仅实现 `checkable + checkStrictly` 子集：`defaultExpandAll` / `checkedKeys={{checked,halfChecked}}` / `treeData={{title,key,children?}}` / `onCheck`；不支持非 checkStrictly 级联、拖拽、异步加载；2026-10-26 迁移唯一调用文件 `admin-rbac-sections.tsx`） |
| `components/gamma-ui/gamma-ant-autocomplete.tsx` | AutoComplete（基于 radix Popover 的建议下拉；`options/value/placeholder/className/filterOption/onChange/children` 形状不变，`children` 传自定义输入元素时用 cloneElement 注入受控 value/onChange；不支持 `onSelect`/`onSearch`；2026-10-26 迁移站内全部 2 个文件） |
| `components/gamma-ui/gamma-ant-select.tsx`  | Select（含 `mode="multiple"` / `"tags"` / `showSearch`；基于 radix Popover 的 listbox，方向键移动/回车选中/Esc 关闭；Form.Item 校验态/禁用态从上下文读取；保留 `.ant-select-dropdown` / `.ant-select-item-option` 类名；已迁移站内非画布全部调用点，画布闭包内 2 处——`audio-settings-panel`、`creative-generation-preferences`——保持 antd） |
| `components/gamma-ui/gamma-ant-table.tsx`   | Table（覆盖 `columns`（title/dataIndex/key/render/width/align/fixed）、`dataSource`、`rowKey`、`loading`、`pagination`、`scroll.x`、简单 `rowSelection`、`size`、`locale.emptyText`、`tableLayout`；不支持 `sorter`/`filterDropdown`/`expandable`；已迁移站内全部调用点，非画布引用数为 0） |
| `components/gamma-ui/gamma-ant-upload.tsx`  | Upload / Upload.Dragger（只覆盖站内「手动上传」用法：`accept/maxCount/disabled/beforeUpload` 不变，`beforeUpload` 返回 `false` / `Upload.LIST_IGNORE` 的语义保留；点击 children 或拖拽触发文件选择；不维护受控 `fileList`/`onChange` 队列（调用处都配 `showUploadList={false}` 自行管理状态），不支持 `customRequest`；2026-10-26 迁移站内全部 5 个文件） |

页面只把这些组件的 import 从 `"antd"` 改到兼容层，调用处不动。

## 未替换（按建议顺序）

| 优先级 | 组件                                                       | 引用文件数    | 为什么暂不替换                                                                                                    | 替换要点                                                                                                           |
| ------ | ---------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1      | DatePicker                                                 | 8             | 日期面板、区间选择、dayjs 值类型                                                                                  | 需要一套 gamma 日历；值类型保持 dayjs                                                                              |
| 2      | Form / Form.Item / Form.useForm                            | 30            | 校验规则、`name` 路径、`getValueFromEvent`、`dependencies` 联动                                                   | 建议保留 rc-field-form 作引擎，只换 `Form.Item` 的布局与报错样式                                                   |
| —      | App / message / notification / Modal.confirm               | 3（非测试；另有 4 处测试内 `vi.mock`） | 命令式 API（`App.useApp()`），已由品牌主题换肤；剩余 3 处（`app-providers.tsx` 主题提供者本体 + 画布共享 2 处）均不宜替换 | 不建议替换，保持 antd                                                                                              |

## 替换时的检查清单

- 先跑 `过程文件/bluegamma-rollout/survey-props.mjs` 统计该组件实际用到的 props，只实现用到的
- 用 `过程文件/bluegamma-rollout/codemod-gamma-ant.mjs` 加一个 GROUP 批量改 import，再跑 `merge-imports.mjs` 合并重复 import
- 有 `vi.mock("antd", …)` 的测试要把 mock 目标改成对应兼容层文件
- e2e 用到的 antd 类名（`.ant-modal-body`、`.ant-select-dropdown`、`.ant-popover`、`.ant-pagination-next` 等）要在兼容层里保留
- `canvas-isolation.test.ts` 必须保持通过：画布依赖闭包里的文件不能改
