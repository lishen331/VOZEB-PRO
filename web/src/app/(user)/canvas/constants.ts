import { CanvasNodeType } from "./types";
import type { CanvasNodeMetadata } from "./types";
import { PANORAMA_NODE_SIZE } from "./utils/canvas-panorama";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const CANVAS_CONFIG_NODE_HEIGHT = {
    collapsed: 180,
    expanded: 226,
} as const;

/**
 * 画布右侧 Agent 面板总开关。为稳定性暂时关闭（2026-10-06 用户要求）。
 *
 * 关掉后：顶栏 Agent 按钮置灰并提示"敬请期待"，面板不会自动打开，
 * 也无法通过任何入口展开。恢复时把这里改回 true 即可，其余代码无需改动。
 *
 * 注意：只作用于源树 src/app/(user)/canvas/；镜像树 drama-canvas-runtime
 * 是同步脚本生成的副本，有自己的 constants.ts，不在此开关范围内。
 */
export const CANVAS_AGENT_ENABLED = false;

/** 功能未开放时统一给用户的提示文案。 */
export const CANVAS_AGENT_DISABLED_HINT = "敬请期待";

/**
 * Storyboard group geometry. `cell*` drives the thumbnail grid inside a Group
 * node; `restore*` is the size each member returns to when the group dissolves.
 */
export const CANVAS_GROUP_GRID = {
    cellWidth: 148,
    cellHeight: 110,
    gap: 4,
    padding: 8,
    headerHeight: 44,
    minWidth: 360,
    minHeight: 320,
    restoreWidth: 340,
    restoreHeight: 240,
    restoreGap: 24,
} as const;

/**
 * 生成组 (Container) geometry. Unlike CANVAS_GROUP_GRID this has no cell sizing:
 * a container never draws its members, it only frames them where they already sit.
 * `padding` is the breathing room left around the members' bounding box.
 */
export const CANVAS_CONTAINER = {
    headerHeight: 40,
    padding: 28,
    minWidth: 320,
    minHeight: 220,
} as const;

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 340, height: 240, title: "New Generation" },
    [CanvasNodeType.Panorama]: { ...PANORAMA_NODE_SIZE, title: "全景图" },
    [CanvasNodeType.Text]: { width: 340, height: 240, title: "Note" },
    [CanvasNodeType.Config]: { width: 340, height: CANVAS_CONFIG_NODE_HEIGHT.collapsed, title: "生成配置" },
    [CanvasNodeType.Video]: { width: 420, height: 236, title: "Video" },
    [CanvasNodeType.Audio]: { width: 340, height: 120, title: "Audio" },
    [CanvasNodeType.Brief]: { width: 380, height: 280, title: "创作简报" },
    [CanvasNodeType.Task]: { width: 340, height: 210, title: "Agent 任务" },
    [CanvasNodeType.BrandKit]: { width: 340, height: 240, title: "品牌规范" },
    [CanvasNodeType.Group]: { width: CANVAS_GROUP_GRID.minWidth, height: CANVAS_GROUP_GRID.minHeight, title: "分镜组" },
    [CanvasNodeType.Container]: { width: 520, height: 400, title: "生成组" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Image],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Panorama]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Panorama],
        metadata: { content: "", status: "idle", size: "2048x1024", panoramaProjection: "equirectangular" },
    },
    [CanvasNodeType.Text]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
        metadata: { content: "", status: "idle", fontSize: 14 },
    },
    [CanvasNodeType.Config]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Config],
        metadata: { content: "", status: "idle", generationMode: "image", configDetailsOpen: false },
    },
    [CanvasNodeType.Video]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Video],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Audio]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
        metadata: { content: "", status: "idle" },
    },
    [CanvasNodeType.Brief]: { ...NODE_DEFAULT_SIZE[CanvasNodeType.Brief], metadata: { status: "idle" } },
    [CanvasNodeType.Task]: { ...NODE_DEFAULT_SIZE[CanvasNodeType.Task], metadata: { status: "idle", agentTaskStatus: "pending", agentTaskAttempts: 0 } },
    [CanvasNodeType.BrandKit]: { ...NODE_DEFAULT_SIZE[CanvasNodeType.BrandKit], metadata: { status: "idle" } },
    [CanvasNodeType.Group]: { ...NODE_DEFAULT_SIZE[CanvasNodeType.Group], metadata: { status: "idle", groupMemberIds: [], groupMemberSnapshots: [] } },
    [CanvasNodeType.Container]: { ...NODE_DEFAULT_SIZE[CanvasNodeType.Container], metadata: { status: "idle", containerChildIds: [] } },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

export function getNodeSpec(type: CanvasNodeType) {
    return NODE_SPECS[type];
}
