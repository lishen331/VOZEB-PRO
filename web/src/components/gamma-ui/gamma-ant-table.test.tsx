import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Table, type TableColumnsType } from "./gamma-ant-table";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

type Row = { id: string; name: string; status: "active" | "disabled" };

const DATA: Row[] = [
    { id: "1", name: "甲", status: "active" },
    { id: "2", name: "乙", status: "disabled" },
];

const COLUMNS: TableColumnsType<Row> = [
    { title: "名称", dataIndex: "name" },
    { title: "状态", dataIndex: "status", render: (status: Row["status"]) => (status === "active" ? "启用" : "停用") },
];

describe("gamma-ant-table：与 antd Table 同 API 子集", () => {
    it("渲染 columns + dataSource", () => {
        const markup = html(<Table columns={COLUMNS} dataSource={DATA} rowKey="id" />);
        expect(markup).toContain("名称");
        expect(markup).toContain(">甲<");
        expect(markup).toContain("启用");
        expect(markup).toContain("停用");
    });

    it("dataSource 为空时渲染 Empty", () => {
        const markup = html(<Table columns={COLUMNS} dataSource={[]} rowKey="id" />);
        expect(markup).toContain("暂无数据");
    });

    it("locale.emptyText 覆盖默认空状态文案", () => {
        const markup = html(<Table columns={COLUMNS} dataSource={[]} rowKey="id" locale={{ emptyText: "暂无符合条件的数据" }} />);
        expect(markup).toContain("暂无符合条件的数据");
    });

    it("loading 时渲染加载态", () => {
        const markup = html(<Table columns={COLUMNS} dataSource={DATA} rowKey="id" loading />);
        expect(markup).toContain('aria-busy="true"');
    });

    it("pagination 对象时渲染分页；pagination=false 时不渲染", () => {
        const withPagination = html(<Table columns={COLUMNS} dataSource={DATA} rowKey="id" pagination={{ current: 1, pageSize: 10, total: 30 }} />);
        expect(withPagination).toContain('aria-label="分页"');
        const withoutPagination = html(<Table columns={COLUMNS} dataSource={DATA} rowKey="id" pagination={false} />);
        expect(withoutPagination).not.toContain('aria-label="分页"');
    });

    it("rowSelection：渲染选择框，getCheckboxProps 可禁用单行", () => {
        const markup = html(
            <Table
                columns={COLUMNS}
                dataSource={DATA}
                rowKey="id"
                rowSelection={{
                    selectedRowKeys: ["1"],
                    onChange: () => {},
                    getCheckboxProps: (record) => ({ disabled: record.id === "2", title: record.id === "2" ? "不可选" : undefined }),
                }}
            />,
        );
        expect(markup).toContain('aria-label="选择此行"');
        expect(markup).toContain("disabled=\"\"");
        expect(markup).toContain('title="不可选"');
    });

    it("rowKey 为函数时按函数结果取行 key", () => {
        const markup = html(<Table columns={COLUMNS} dataSource={DATA} rowKey={(row) => `row-${row.id}`} />);
        expect(markup).toContain(">甲<");
    });

    it("ellipsis：无自定义 render 时单行省略并带 title", () => {
        const columns: TableColumnsType<Row> = [{ title: "名称", dataIndex: "name", ellipsis: true }];
        const markup = html(<Table columns={columns} dataSource={DATA} rowKey="id" />);
        expect(markup).toContain('title="甲"');
        expect(markup).toContain("truncate");
    });
});
