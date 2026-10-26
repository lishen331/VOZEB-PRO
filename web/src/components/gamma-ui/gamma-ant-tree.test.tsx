import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Tree } from "./gamma-ant-tree";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const TREE_DATA = [
    {
        title: "分组一",
        key: "group-1",
        children: [
            { title: "叶子 A", key: "leaf-a" },
            { title: "叶子 B", key: "leaf-b" },
        ],
    },
];

describe("gamma-ant-tree：与 antd Tree 同 API（checkStrictly 子集）", () => {
    it("defaultExpandAll：展开所有节点，渲染全部 title", () => {
        const markup = html(<Tree checkable checkStrictly defaultExpandAll treeData={TREE_DATA} checkedKeys={{ checked: [], halfChecked: [] }} />);
        expect(markup).toContain("分组一");
        expect(markup).toContain("叶子 A");
        expect(markup).toContain("叶子 B");
    });

    it("checkedKeys.checked：命中的节点 aria-checked 为 true", () => {
        const markup = html(<Tree checkable checkStrictly defaultExpandAll treeData={TREE_DATA} checkedKeys={{ checked: ["leaf-a"], halfChecked: [] }} />);
        expect(markup).toMatch(/aria-checked="true"[^>]*>[\s\S]*?<\/button>/);
    });

    it("checkedKeys.halfChecked：半选节点 aria-checked 为 mixed", () => {
        const markup = html(<Tree checkable checkStrictly defaultExpandAll treeData={TREE_DATA} checkedKeys={{ checked: ["leaf-a"], halfChecked: ["group-1"] }} />);
        expect(markup).toContain('aria-checked="mixed"');
    });

    it("未展开（defaultExpandAll 为假）：不渲染子节点", () => {
        const markup = html(<Tree checkable checkStrictly treeData={TREE_DATA} checkedKeys={{ checked: [], halfChecked: [] }} />);
        expect(markup).toContain("分组一");
        expect(markup).not.toContain("叶子 A");
    });
});
