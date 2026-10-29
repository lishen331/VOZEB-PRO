"use client";

/*
 * gamma-ui 的 antd Tree 兼容层。只实现站内实际用到的子集：
 * checkable + checkStrictly（父子勾选互不级联，级联逻辑由调用处的 checkedKeys 计算结果决定）+
 * defaultExpandAll + checkedKeys（{checked, halfChecked} 形状）+ treeData（{title,key,children?}）+ onCheck。
 * 不支持非 checkStrictly 模式、拖拽、异步加载。画布不使用本文件。
 */

import { useState } from "react";
import { Minus, Square } from "lucide-react";

import { cn } from "@/lib/utils";

export interface TreeNodeData {
    title: React.ReactNode;
    key: string;
    children?: readonly TreeNodeData[];
}

export interface TreeCheckInfo {
    checked: boolean;
    node: { key: string };
}

export interface TreeProps {
    checkable?: boolean;
    checkStrictly?: boolean;
    defaultExpandAll?: boolean;
    checkedKeys?: { checked: readonly string[]; halfChecked: readonly string[] };
    treeData: readonly TreeNodeData[];
    onCheck?: (checkedKeys: unknown, info: TreeCheckInfo) => void;
}

function TreeNode({
    node,
    depth,
    expanded,
    checkedSet,
    halfCheckedSet,
    onToggleExpand,
    onCheck,
}: {
    node: TreeNodeData;
    depth: number;
    expanded: Set<string>;
    checkedSet: Set<string>;
    halfCheckedSet: Set<string>;
    onToggleExpand: (key: string) => void;
    onCheck?: TreeProps["onCheck"];
}) {
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = expanded.has(node.key);
    const isChecked = checkedSet.has(node.key);
    const isHalfChecked = halfCheckedSet.has(node.key);

    return (
        <li className="ant-tree-treenode">
            <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: depth * 20 }}>
                {hasChildren ? (
                    <button type="button" aria-label={isExpanded ? "收起" : "展开"} onClick={() => onToggleExpand(node.key)} className="grid size-5 shrink-0 place-items-center text-[var(--gm-text-3)]">
                        <span className={cn("inline-block transition-transform", isExpanded ? "rotate-90" : "rotate-0")}>▶</span>
                    </button>
                ) : (
                    <span className="size-5 shrink-0" />
                )}
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={isHalfChecked ? "mixed" : isChecked}
                    onClick={() => onCheck?.(undefined, { checked: !isChecked, node: { key: node.key } })}
                    className={cn(
                        "ant-tree-checkbox grid size-4 shrink-0 place-items-center rounded-sm border",
                        isChecked ? "border-[var(--gm-accent)] bg-[var(--gm-accent)] text-white" : isHalfChecked ? "border-[var(--gm-accent)] bg-[var(--gm-accent)]/20" : "border-[var(--gm-border-strong)]",
                    )}
                >
                    {isChecked ? <Square className="size-2.5 fill-current" /> : isHalfChecked ? <Minus className="size-2.5" /> : null}
                </button>
                <span className="ant-tree-title text-sm">{node.title}</span>
            </div>
            {hasChildren && isExpanded ? (
                <ul className="ant-tree-child-tree">
                    {node.children?.map((child) => (
                        <TreeNode key={child.key} node={child} depth={depth + 1} expanded={expanded} checkedSet={checkedSet} halfCheckedSet={halfCheckedSet} onToggleExpand={onToggleExpand} onCheck={onCheck} />
                    ))}
                </ul>
            ) : null}
        </li>
    );
}

function collectKeys(nodes: readonly TreeNodeData[], into: Set<string>) {
    nodes.forEach((node) => {
        into.add(node.key);
        if (node.children?.length) collectKeys(node.children, into);
    });
}

export function Tree({ defaultExpandAll, checkedKeys, treeData, onCheck }: TreeProps) {
    const [expanded, setExpanded] = useState<Set<string>>(() => {
        if (!defaultExpandAll) return new Set();
        const all = new Set<string>();
        collectKeys(treeData, all);
        return all;
    });
    const checkedSet = new Set(checkedKeys?.checked ?? []);
    const halfCheckedSet = new Set(checkedKeys?.halfChecked ?? []);

    const toggleExpand = (key: string) =>
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    return (
        <ul className="ant-tree">
            {treeData.map((node) => (
                <TreeNode key={node.key} node={node} depth={0} expanded={expanded} checkedSet={checkedSet} halfCheckedSet={halfCheckedSet} onToggleExpand={toggleExpand} onCheck={onCheck} />
            ))}
        </ul>
    );
}
