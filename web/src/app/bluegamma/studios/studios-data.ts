export interface StudioGroupSpec {
    id: string;
    name: string;
    school: string;
    cover: string;
    members: { name: string }[];
    works: number;
}

const THUMB = "/style-thumbs";

export const STUDIO_GROUPS: readonly StudioGroupSpec[] = [
    { id: "s1", name: "新中式研究小组", school: "服装与服饰设计", cover: `${THUMB}/neo-chinese-guochao.jpg`, members: [{ name: "林汐" }, { name: "白芷" }, { name: "顾川" }], works: 42 },
    { id: "s2", name: "暗黑奇幻场景组", school: "游戏美术", cover: `${THUMB}/dark-fantasy.jpg`, members: [{ name: "顾川" }, { name: "沈星" }], works: 28 },
    { id: "s3", name: "侘寂空间小组", school: "环境设计", cover: `${THUMB}/minimalist.jpg`, members: [{ name: "陈默" }, { name: "林汐" }, { name: "许诺" }, { name: "苏砚" }], works: 19 },
    { id: "s4", name: "赛璐璐动画社", school: "动画", cover: `${THUMB}/anime.jpg`, members: [{ name: "白芷" }], works: 35 },
];
