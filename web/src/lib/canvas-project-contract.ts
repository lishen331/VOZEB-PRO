import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "@/app/(user)/canvas/types";
import type { PracticeExecutionProfile, PracticeSource } from "@/lib/practice-domain";

export type CanvasProject = {
    id: string;
    sourceHandoffId?: string;
    creativeConversationId?: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    executionProfile?: PracticeExecutionProfile;
    practiceSource?: PracticeSource;
};

export type CanvasProjectSummary = Pick<CanvasProject, "id" | "sourceHandoffId" | "creativeConversationId" | "title" | "createdAt" | "updatedAt"> & {
    nodeCount: number;
    connectionCount: number;
    executionProfile?: PracticeExecutionProfile;
    practiceSource?: PracticeSource;
};

export type CanvasProjectSummaryPage = { projects: CanvasProjectSummary[]; total: number; page: number; pageSize: number };

export type CanvasProjectMutation = {
    mutationId: string;
    baseUpdatedAt: string;
    title?: string;
    creativeConversationId?: string;
    activeChatId?: string | null;
    backgroundMode?: CanvasBackgroundMode;
    showImageInfo?: boolean;
    viewport?: ViewportTransform;
    nodeUpserts?: CanvasNodeData[];
    nodeDeletes?: string[];
    connectionUpserts?: CanvasConnection[];
    connectionDeletes?: string[];
    chatSessionUpserts?: CanvasAssistantSession[];
    chatSessionDeletes?: string[];
};

export type CanvasProjectSaveAck = {
    projectId: string;
    updatedAt: string;
    mutationId: string;
};

export type CreateCanvasProjectInput = {
    title?: string;
    sourceHandoffId?: string;
    project?: Partial<CanvasProject>;
};
