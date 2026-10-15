import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Alert, Button, Checkbox, Empty, Pagination, Segmented, Spin, Switch, Tag } from "./gamma-ant";
import { Input, InputNumber } from "./gamma-ant-input";

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
});
