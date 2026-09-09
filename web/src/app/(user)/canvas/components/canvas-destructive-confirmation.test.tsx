import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CanvasDestructiveConfirmation } from "./canvas-destructive-confirmation";
import { CanvasNodeType } from "../types";
describe("Canvas destructive preview", () => {
    it("shows targets, linked edge count, scroll container and explicit buttons without executing", () => {
        const confirm = vi.fn();
        const html = renderToStaticMarkup(
            <CanvasDestructiveConfirmation
                proposal={{ id: "p", runId: "r", type: "delete_nodes", ids: ["a"] }}
                preview={{ nodes: [{ id: "a", title: "<unsafe>", type: CanvasNodeType.Text, position: { x: 0, y: 0 }, width: 300, height: 200 }], connections: [{ id: "ab", fromNodeId: "a", toNodeId: "b" }] }}
                busy={false}
                onConfirm={confirm}
                onCancel={() => {}}
            />,
        );
        expect(html).toContain("1 个节点及 1 条关联连线");
        expect(html).toContain("&lt;unsafe&gt;");
        expect(html).toContain("overflow-y:auto");
        expect(html).toContain("确认执行");
        expect(html).toContain("取消，不执行");
        expect(confirm).not.toHaveBeenCalled();
    });
});
