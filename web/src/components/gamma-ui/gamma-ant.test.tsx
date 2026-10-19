import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Alert, Button, Checkbox, Empty, Pagination, Segmented, Spin, Switch, Tag } from "./gamma-ant";
import { Input, InputNumber } from "./gamma-ant-input";
import { Popconfirm, Tabs, Tooltip } from "./gamma-ant-overlay";
import { Card, Collapse, Progress, Radio, Space, Steps } from "./gamma-ant-display";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("gamma-ant 兼容层：与 antd 同 API", () => {
    it("Button：htmlType / disabled / loading / href / iconPlacement", () => {
        expect(html(<Button htmlType="submit">提交</Button>)).toMatch(/<button[^>]*type="submit"[^>]*><span>提交<\/span><\/button>/);
        expect(html(<Button disabled>启用此绑定</Button>)).toMatch(/<button[^>]*disabled=""[^>]*><span>启用此绑定/);
        expect(html(<Button loading>保存</Button>)).toContain('aria-busy="true"');
        expect(
            html(
                <Button href="/help" target="_blank">
                    帮助
                </Button>,
            ),
        ).toMatch(/<a[^>]*href="\/help"[^>]*rel="noopener noreferrer"/);
        expect(html(<Button type="primary">主操作</Button>)).toContain("gm-btn-primary");
        const endIcon = html(
            <Button icon={<i data-icon="" />} iconPlacement="end">
                下一步
            </Button>,
        );
        expect(endIcon.indexOf("下一步")).toBeLessThan(endIcon.indexOf("data-icon"));
    });

    it("Tag：预设色映射到 gamma 状态色，任意色原样使用", () => {
        expect(html(<Tag color="success">已通过</Tag>)).toContain("var(--gm-success)");
        expect(html(<Tag color="error">失败</Tag>)).toContain("var(--gm-danger)");
        expect(html(<Tag color="#123456">自定义</Tag>)).toContain("#123456");
        expect(html(<Tag>默认</Tag>)).not.toContain('style="color');
    });

    it("Segmented：受控选中 + 字符串 / 对象选项", () => {
        const markup = html(<Segmented<string> value="b" options={["a", { value: "b", label: "乙" }]} onChange={() => {}} />);
        expect(markup).toContain('role="radiogroup"');
        expect(markup).toMatch(/aria-checked="true"[^>]*data-value="b"/);
        expect(markup).toContain(">乙<");
        expect(markup).toContain(">a<");
    });

    it("Switch / Checkbox：受控状态与无障碍属性", () => {
        expect(html(<Switch checked aria-label="启用" />)).toMatch(/role="switch"[^>]*aria-checked="true"/);
        expect(html(<Switch checked={false} checkedChildren="开" unCheckedChildren="关" />)).toContain(">关<");
        expect(html(<Checkbox checked>同意</Checkbox>)).toMatch(/type="checkbox"[^>]*checked=""/);
        expect(html(<Checkbox checked={false} indeterminate />)).toContain('aria-checked="mixed"');
    });

    it("Spin / Empty / Alert", () => {
        expect(html(<Spin />)).toContain("gm-spin-spinning");
        expect(html(<Spin spinning={false} />)).toBe("");
        expect(
            html(
                <Spin spinning>
                    <p>内容</p>
                </Spin>,
            ),
        ).toContain("<p>内容</p>");
        expect(html(<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无" />)).toContain("暂无");
        expect(html(<Empty image={null} description="无图标" />)).not.toContain("<svg");
        expect(html(<Alert type="error" title="出错了" description="详情" showIcon />)).toMatch(/role="alert"[\s\S]*出错了[\s\S]*详情/);
        expect(html(<Alert type="warning" message="旧写法" />)).toContain("旧写法");
    });

    it("Pagination：页码、当前页与每页条数", () => {
        const markup = html(<Pagination current={3} pageSize={10} total={95} showSizeChanger pageSizeOptions={[10, 20]} onChange={() => {}} />);
        expect(markup).toMatch(/aria-current="page"[^>]*>3</);
        expect(markup).toContain("gm-pagination-next");
        expect(markup).toContain("20 条/页");
        expect(html(<Pagination total={5} pageSize={10} hideOnSinglePage />)).toBe("");
    });

    it("Input：allowClear / showCount / Search 按钮 / Password / TextArea / InputNumber", () => {
        expect(html(<Input value="ab" maxLength={10} showCount onChange={() => {}} />)).toContain("2 / 10");
        expect(html(<Input value="ab" allowClear onChange={() => {}} />)).toContain('aria-label="清空"');
        expect(html(<Input.Search enterButton="查询" />)).toContain(">查询<");
        expect(html(<Input.Password value="x" onChange={() => {}} />)).toContain('type="password"');
        expect(html(<Input.TextArea rows={3} value="t" onChange={() => {}} />)).toMatch(/<textarea[^>]*rows="3"/);
        expect(html(<InputNumber value={2.5} precision={2} onChange={() => {}} />)).toContain('value="2.50"');
        expect(html(<InputNumber value={null} onChange={() => {}} />)).toContain('value=""');
    });

    it("Tooltip：空 title 只渲染子元素，禁用子元素外包 span", () => {
        expect(html(<Tooltip title="">{<button type="button">按钮</button>}</Tooltip>)).toBe('<button type="button">按钮</button>');
        expect(
            html(
                <Tooltip title="提示">
                    <button type="button" disabled>
                        禁用
                    </button>
                </Tooltip>,
            ),
        ).toMatch(/^<span[^>]*cursor-not-allowed[^>]*><button[^>]*pointer-events-none/);
    });

    it("Popconfirm：关闭态只渲染触发元素；disabled 时不包装", () => {
        const trigger = (
            <button type="button" data-trigger="">
                删除
            </button>
        );
        expect(html(<Popconfirm title="确认删除？">{trigger}</Popconfirm>)).toMatch(/^<button[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
        expect(
            html(
                <Popconfirm title="确认删除？" disabled>
                    {trigger}
                </Popconfirm>,
            ),
        ).toBe('<button type="button" data-trigger="">删除</button>');
    });

    it("Tabs：受控 activeKey、role=tab/tabpanel、默认只渲染当前面板", () => {
        const markup = html(
            <Tabs
                activeKey="b"
                onChange={() => {}}
                items={[
                    { key: "a", label: "甲", children: <p>面板甲</p> },
                    { key: "b", label: "乙", children: <p>面板乙</p> },
                ]}
            />,
        );
        expect(markup).toMatch(/role="tab" aria-selected="true"[\s\S]*乙/);
        expect(markup).toContain("面板乙");
        expect(markup).not.toContain("面板甲");
        expect(markup).toContain('role="tabpanel"');
    });

    it("展示类：Space 跳过空子元素、Card 标题栏、Progress 夹取百分比、Steps 当前步", () => {
        expect(
            html(
                <Space size={[4, 8]}>
                    <span>a</span>
                    {null}
                    {false}
                    <span>b</span>
                </Space>,
            ),
        ).toMatch(/column-gap:4px;row-gap:8px[^>]*><span>a<\/span><span>b<\/span><\/div>$/);
        expect(
            html(
                <Card title="标题" extra={<i>x</i>}>
                    内容
                </Card>,
            ),
        ).toMatch(/<header[^>]*>.*标题.*<i>x<\/i>.*<\/header><div class="p-5">内容<\/div>/);
        expect(html(<Progress percent={140} showInfo />)).toContain('aria-valuenow="100"');
        expect(html(<Steps current={1} items={[{ title: "一" }, { title: "二" }]} />)).toMatch(/aria-current="step"[\s\S]*二/);
    });

    it("Radio.Group：受控 value 选中对应项；Collapse 默认收起", () => {
        const markup = html(
            <Radio.Group value="b" onChange={() => {}}>
                <Radio value="a">甲</Radio>
                <Radio value="b">乙</Radio>
            </Radio.Group>,
        );
        expect(markup.match(/checked=""/g)).toHaveLength(1);
        expect(markup).toMatch(/checked=""[\s\S]*乙/);
        expect(html(<Collapse items={[{ key: "x", label: "章节", children: <p>正文</p> }]} />)).not.toContain("正文");
    });
});
