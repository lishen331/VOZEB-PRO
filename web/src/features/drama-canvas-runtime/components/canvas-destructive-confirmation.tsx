import React from "react";
import type { CanvasDestructivePreview, CanvasDestructiveProposal } from "@/lib/canvas-agent-destructive";
/** Bounded preview list; no operation is applied by rendering this component. */
export function CanvasDestructiveConfirmation({
    proposal,
    preview,
    busy,
    error,
    onCancel,
    onConfirm,
}: {
    proposal: CanvasDestructiveProposal;
    preview: CanvasDestructivePreview;
    busy: boolean;
    error?: string;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <section aria-label="操作影响预览">
            <p>{proposal.type === "delete_nodes" ? `将删除 ${preview.nodes.length} 个节点及 ${preview.connections.length} 条关联连线。` : `将断开 ${preview.connections.length} 条连线，不删除节点。`}</p>
            <p>只修改当前画布，不删除素材库文件。确认后可通过画布撤销恢复。</p>
            <div style={{ maxHeight: "40vh", overflowY: "auto", overflowWrap: "anywhere" }}>
                <ul>
                    {preview.nodes.map((node) => (
                        <li key={node.id}>
                            {node.title || node.id}（{node.type} / {node.id}）
                        </li>
                    ))}
                </ul>
                <ul>
                    {preview.connections.map((edge) => (
                        <li key={edge.id}>
                            {edge.fromNodeId} → {edge.toNodeId}（{edge.id}）
                        </li>
                    ))}
                </ul>
            </div>
            {error ? <p role="alert">{error}</p> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 16 }}>
                <button type="button" disabled={busy} onClick={onCancel}>
                    取消，不执行
                </button>
                <button type="button" disabled={busy || Boolean(error)} onClick={onConfirm}>
                    {busy ? "正在执行并保存…" : "确认执行"}
                </button>
            </div>
        </section>
    );
}
