import type { CanvasProject } from "@/lib/canvas-project-contract";
import type { CanvasAssistantSession } from "../types";
import type { CanvasProjectSaveState } from "../stores/use-canvas-store";
import type { CanvasAgentSnapshot } from "./canvas-agent-ops";
type ResultStore = {
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId">>) => void;
    flushProjectSave: (id: string) => Promise<void>;
    saveStateByProject: Record<string, CanvasProjectSaveState>;
};
/** Store flush absorbs request errors: only its acknowledgement state proves persistence. */
export async function persistCanvasAgentResult(snapshot: CanvasAgentSnapshot, chatSessions: CanvasAssistantSession[], activeChatId: string | null, getStore: () => ResultStore): Promise<CanvasProjectSaveState> {
    getStore().updateProject(snapshot.projectId, { nodes: snapshot.nodes, connections: snapshot.connections, chatSessions, activeChatId });
    await getStore().flushProjectSave(snapshot.projectId);
    return getStore().saveStateByProject[snapshot.projectId] || { status: "error", message: "画布尚未加载，无法确认保存" };
}
