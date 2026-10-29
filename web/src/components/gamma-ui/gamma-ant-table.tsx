"use client";

/*
 * gamma-ui 的 antd Table 兼容层：覆盖项目内实际用到的子集——
 * columns（title/dataIndex/key/render/width/align/fixed）、dataSource、rowKey（字符串或函数）、
 * loading、pagination（对象或 false）、scroll.x（横向滚动）、简单 rowSelection、size、locale.emptyText、
 * tableLayout、className。不支持 antd 的 sorter / filterDropdown / expandable（项目内未使用）。
 */

import type { CSSProperties, Key, ReactNode } from "react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { Empty, Pagination, Spin } from "@/components/gamma-ui/gamma-ant";

/** 固定列没给 width 时的估算值，仅为算出相邻固定列的偏移量 */
const DEFAULT_FIXED_WIDTH = 120;
/** 行选择复选框列宽，参与左固定列的偏移累加 */
const SELECTION_WIDTH = 40;

export interface TableColumnType<T> {
    title?: ReactNode;
    dataIndex?: keyof T | string;
    key?: string;
    width?: number | string;
    align?: "left" | "center" | "right";
    fixed?: "left" | "right" | boolean;
    className?: string;
    responsive?: readonly string[];
    /** 单行省略并通过 title 显示完整内容；仅在没有自定义 render 时生效 */
    ellipsis?: boolean;
    // antd 的 render 实际以 any 承接首个参数，否则窄类型回调（如 (value: string) => ...）无法赋值
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render?: (value: any, record: T, index: number) => ReactNode;
}

export type TableColumnsType<T> = readonly TableColumnType<T>[];
/** antd 的 ColumnsType 是同一个类型的别名 */
export type ColumnsType<T> = TableColumnsType<T>;

export interface TablePaginationConfig {
    current?: number;
    pageSize?: number;
    total?: number;
    showSizeChanger?: boolean;
    /** 未实现跳转输入框，仅为兼容调用处类型而保留 */
    showQuickJumper?: boolean;
    hideOnSinglePage?: boolean;
    showTotal?: (total: number, range: [number, number]) => ReactNode;
    onChange?: (page: number, pageSize: number) => void;
}

export interface TableRowSelection<T> {
    selectedRowKeys?: readonly Key[];
    onChange?: (selectedRowKeys: Key[], selectedRows: T[]) => void;
    getCheckboxProps?: (record: T) => { disabled?: boolean; title?: string };
}

export interface TableProps<T> {
    columns: TableColumnsType<T>;
    dataSource?: readonly T[];
    rowKey?: keyof T | ((record: T) => Key);
    loading?: boolean;
    pagination?: TablePaginationConfig | false;
    scroll?: { x?: number | string; y?: number | string };
    rowSelection?: TableRowSelection<T>;
    size?: "small" | "middle" | "large";
    tableLayout?: "auto" | "fixed";
    locale?: { emptyText?: ReactNode };
    className?: string;
    style?: CSSProperties;
}

function resolveRowKey<T>(record: T, index: number, rowKey?: keyof T | ((record: T) => Key)): Key {
    if (typeof rowKey === "function") return rowKey(record);
    if (rowKey !== undefined) return String(record[rowKey]);
    return index;
}

const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** 与 antd Table 同 API 子集：columns + dataSource 渲染表格；loading 时盖加载层；pagination=false 时不出现分页 */
/** 固定列的横向偏移量：左固定按前面的列宽累加，右固定从末尾往前累加 */
function useFixedOffsets<T>(columns: TableColumnsType<T>, selectable: boolean) {
    return useMemo(() => {
        const offsets: { left?: number; right?: number }[] = columns.map(() => ({}));
        const widthOf = (column: TableColumnType<T>) => (typeof column.width === "number" ? column.width : DEFAULT_FIXED_WIDTH);
        let acc = selectable ? SELECTION_WIDTH : 0;
        columns.forEach((column, index) => {
            if (column.fixed === "left" || column.fixed === true) {
                offsets[index].left = acc;
                acc += widthOf(column);
            }
        });
        acc = 0;
        for (let index = columns.length - 1; index >= 0; index -= 1) {
            const column = columns[index];
            if (column.fixed === "right") {
                offsets[index].right = acc;
                acc += widthOf(column);
            }
        }
        return offsets;
    }, [columns, selectable]);
}

/**
 * 固定列的定位样式。antd 要求固定列给 width，这里缺省按 DEFAULT_FIXED_WIDTH 估，
 * 否则偏移量算不出来、几列会叠在一起。
 */
function fixedCellStyle(offset: { left?: number; right?: number }, isHeader: boolean): CSSProperties | undefined {
    if (offset.left === undefined && offset.right === undefined) return undefined;
    return { position: "sticky", left: offset.left, right: offset.right, zIndex: isHeader ? 3 : 2 };
}

/** 固定列必须有不透明底色，否则横向滚动时下面的内容会透上来 */
function fixedCellClass(offset: { left?: number; right?: number }): string | undefined {
    if (offset.left === undefined && offset.right === undefined) return undefined;
    return offset.left !== undefined ? "gm-table-cell-fix-left bg-[var(--gm-surface)]" : "gm-table-cell-fix-right bg-[var(--gm-surface)]";
}

export function Table<T>({ columns, dataSource = [], rowKey, loading = false, pagination, scroll, rowSelection, size = "middle", tableLayout, locale, className, style }: TableProps<T>) {
    const small = size === "small";
    const cellPad = small ? "px-2 py-1.5" : size === "large" ? "px-4 py-3" : "px-3 py-2";
    const selectable = Boolean(rowSelection);
    const selectedKeys = new Set(rowSelection?.selectedRowKeys ?? []);
    const fixedOffsets = useFixedOffsets(columns, selectable);

    const toggleRow = (key: Key, record: T) => {
        if (!rowSelection) return;
        const next = new Set(selectedKeys);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        const nextKeys = [...next];
        const nextRows = dataSource.filter((row, index) => next.has(resolveRowKey(row, index, rowKey)));
        rowSelection.onChange?.(nextKeys, nextRows);
        void record;
    };

    const body =
        dataSource.length === 0 ? (
            <div className="py-6">{typeof locale?.emptyText === "string" || locale?.emptyText === undefined ? <Empty description={locale?.emptyText} /> : locale.emptyText}</div>
        ) : (
            <table className={cn("gm-table ant-table w-full border-collapse text-sm", tableLayout === "fixed" && "table-fixed")} style={{ minWidth: scroll?.x }}>
                <thead className="ant-table-thead">
                    <tr className="border-b border-[var(--gm-border)] text-xs text-[var(--gm-text-3)]">
                        {selectable ? <th className={cn(cellPad, "w-10")} /> : null}
                        {columns.map((column, columnIndex) => (
                            <th
                                key={column.key ?? String(column.dataIndex ?? columnIndex)}
                                style={{ width: column.width, ...fixedCellStyle(fixedOffsets[columnIndex], true) }}
                                className={cn(cellPad, "gm-table-cell font-medium whitespace-nowrap", column.align && ALIGN_CLASS[column.align], fixedCellClass(fixedOffsets[columnIndex]))}
                            >
                                {column.title}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="ant-table-tbody divide-y divide-[var(--gm-border)]">
                    {dataSource.map((record, rowIndex) => {
                        const key = resolveRowKey(record, rowIndex, rowKey);
                        const checked = selectedKeys.has(key);
                        const checkboxProps = rowSelection?.getCheckboxProps?.(record);
                        return (
                            <tr key={key} className={cn("text-[var(--gm-text)] hover:bg-[var(--gm-wash)]", checked && "gm-table-row-selected")}>
                                {selectable ? (
                                    <td className={cellPad}>
                                        <input type="checkbox" aria-label="选择此行" title={checkboxProps?.title} checked={checked} disabled={checkboxProps?.disabled} onChange={() => toggleRow(key, record)} className="gm-checkbox" />
                                    </td>
                                ) : null}
                                {columns.map((column, columnIndex) => {
                                    const value = column.dataIndex !== undefined ? (record as Record<string, unknown>)[column.dataIndex as string] : undefined;
                                    const content = column.render ? column.render(value, record, rowIndex) : (value as ReactNode);
                                    return (
                                        <td
                                            key={column.key ?? String(column.dataIndex ?? columnIndex)}
                                            style={fixedCellStyle(fixedOffsets[columnIndex], false)}
                                            className={cn(cellPad, "gm-table-cell", column.align && ALIGN_CLASS[column.align], fixedCellClass(fixedOffsets[columnIndex]))}
                                        >
                                            {column.ellipsis && !column.render ? (
                                                <span className="block truncate" title={typeof value === "string" ? value : undefined}>
                                                    {content}
                                                </span>
                                            ) : (
                                                content
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        );

    return (
        <div className={cn("gm-table-wrap", className)} style={style}>
            <Spin spinning={loading}>
                <div className={cn("gm-table-content", scroll?.x && "overflow-x-auto")}>{body}</div>
            </Spin>
            {pagination !== false && pagination?.total !== undefined ? (
                <div className="mt-3 flex justify-end">
                    <Pagination
                        current={pagination.current}
                        pageSize={pagination.pageSize}
                        total={pagination.total}
                        showSizeChanger={pagination.showSizeChanger}
                        hideOnSinglePage={pagination.hideOnSinglePage}
                        showTotal={pagination.showTotal}
                        onChange={pagination.onChange}
                    />
                </div>
            ) : null}
        </div>
    );
}
