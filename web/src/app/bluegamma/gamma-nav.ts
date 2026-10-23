import type { GammaRailItem } from "@/components/gamma-ui/gamma-shell";

/*
 * 布鲁伽马导航：面向设计与艺术类院校。Agent 已下线，原工具入口改为「专业方向」。
 * 图标用自绘的 GammaNavIcon（选中时镂空 + 笔画点亮）。
 * 「设计系统」挂在社区分组下，便于验收整套组件。
 */
export const GAMMA_RAIL_ITEMS: readonly GammaRailItem[] = [
    { key: "home", label: "首页", icon: "home", href: "/bluegamma", group: "create" },
    { key: "majors", label: "专业", icon: "subjects", group: "create" },
    { key: "studio", label: "工作台", icon: "courseware", href: "/bluegamma/studio", group: "create" },
    { key: "courses", label: "课程", icon: "lessons", href: "/bluegamma/courses", group: "create" },
    { key: "practice", label: "无限练习", icon: "practice", href: "/bluegamma/practice", group: "create" },
    { key: "assets", label: "素材", icon: "assets", href: "/bluegamma/assets", group: "assets" },
    { key: "prompts", label: "提示词", icon: "prompts", group: "assets" },
    { key: "plaza", label: "作品广场", icon: "plaza", group: "community" },
    { key: "studios", label: "工作室", icon: "classes", group: "community" },
    { key: "design", label: "设计系统", icon: "design", href: "/bluegamma/design", group: "community" },
    { key: "all", label: "全部", icon: "all", group: "more" },
    // 侧边栏最底部：按可灵版式排布的新首页，供替换时与 /bluegamma 二选一
    { key: "kling-home", label: "新首页", icon: "home", href: "/bluegamma/home", group: "preview" },
];

const THUMB = "/style-thumbs";

export interface GammaGalleryItem {
    id: string;
    title: string;
    author: string;
    /** 作者所在专业 */
    school: string;
    subject: string;
    subjectSlug: string;
    cover: string;
    likes: number;
    kind: "image" | "video";
    tall?: boolean;
    prompt: string;
}

export const GAMMA_GALLERY: readonly GammaGalleryItem[] = [
    {
        id: "g1",
        title: "宋锦·新中式成衣系列",
        author: "林汐",
        school: "服装与服饰设计",
        subject: "服装设计",
        subjectSlug: "fashion",
        cover: `${THUMB}/neo-chinese-guochao.jpg`,
        likes: 2318,
        kind: "image",
        tall: true,
        prompt: "新中式女装系列效果图，宋锦提花面料，立领盘扣，莫兰迪色系，正面与侧面三视图",
    },
    {
        id: "g2",
        title: "雨夜霓虹 · 概念短片",
        author: "周屿",
        school: "影视摄影与制作",
        subject: "影视制作",
        subjectSlug: "film",
        cover: `${THUMB}/cinematic.jpg`,
        likes: 3056,
        kind: "video",
        prompt: "雨夜霓虹街头，女主撑伞回眸，变焦推近，浅景深，2.39:1 宽银幕",
    },
    {
        id: "g3",
        title: "侘寂客厅 · 午后",
        author: "陈默",
        school: "环境设计",
        subject: "室内设计",
        subjectSlug: "interior",
        cover: `${THUMB}/minimalist.jpg`,
        likes: 1876,
        kind: "image",
        tall: true,
        prompt: "120㎡ 侘寂风客厅效果图，微水泥墙面，原木家具，午后侧光，24mm 广角",
    },
    {
        id: "g4",
        title: "透明科技 · 蓝牙音箱",
        author: "许诺",
        school: "工业设计",
        subject: "产品设计",
        subjectSlug: "product",
        cover: `${THUMB}/low-poly.jpg`,
        likes: 987,
        kind: "image",
        prompt: "便携蓝牙音箱产品渲染，半透明外壳露出内部结构，45° 视角，纯色背景",
    },
    {
        id: "g5",
        title: "废弃神殿 · 场景概念",
        author: "顾川",
        school: "游戏美术",
        subject: "游戏艺术",
        subjectSlug: "game-art",
        cover: `${THUMB}/dark-fantasy.jpg`,
        likes: 2204,
        kind: "image",
        tall: true,
        prompt: "暗黑奇幻游戏场景概念，废弃神殿，红月当空，体积光，横版 16:9",
    },
    {
        id: "g6",
        title: "沉浸式粒子展厅",
        author: "沈星",
        school: "数字媒体艺术",
        subject: "数字媒体",
        subjectSlug: "digital-media",
        cover: `${THUMB}/sci-fi.jpg`,
        likes: 1642,
        kind: "video",
        prompt: "沉浸式展厅投影装置概念，流体粒子随观众移动扩散，深蓝到青色渐变",
    },
    { id: "g7", title: "少年剑客 · 角色设定", author: "白芷", school: "动画", subject: "动漫制作", subjectSlug: "animation", cover: `${THUMB}/anime.jpg`, likes: 2530, kind: "image", prompt: "国漫少年剑客角色设定，三视图 + 表情表，青衫长发，赛璐璐上色" },
    {
        id: "g8",
        title: "天青釉梅瓶推演",
        author: "苏砚",
        school: "陶瓷艺术设计",
        subject: "陶瓷艺术",
        subjectSlug: "ceramics",
        cover: `${THUMB}/chinese.jpg`,
        likes: 890,
        kind: "image",
        tall: true,
        prompt: "宋代汝窑天青釉梅瓶器型推演，三种口沿变体，开片细节特写",
    },
    {
        id: "g9",
        title: "夏日冰饮主视觉",
        author: "Studio K",
        school: "广告学",
        subject: "广告设计",
        subjectSlug: "advertising",
        cover: `${THUMB}/cyberpunk.jpg`,
        likes: 1733,
        kind: "image",
        prompt: "运动饮料夏季主视觉，冰块飞溅，高饱和撞色，中心构图，留出主标题位置",
    },
    {
        id: "g10",
        title: "银杏胸针 · 高级珠宝",
        author: "叶蓁",
        school: "首饰设计",
        subject: "珠宝设计",
        subjectSlug: "jewelry",
        cover: `${THUMB}/dreamy.jpg`,
        likes: 1411,
        kind: "image",
        tall: true,
        prompt: "东方意象高级珠宝胸针，银杏叶造型，祖母绿主石，微镶钻边，黑丝绒背景",
    },
    {
        id: "g11",
        title: "咖啡品牌 VI 延展",
        author: "江南",
        school: "视觉传达设计",
        subject: "视觉传达",
        subjectSlug: "visual-communication",
        cover: `${THUMB}/comic.jpg`,
        likes: 1212,
        kind: "image",
        prompt: "咖啡品牌 VI 延展：杯套、纸袋、门头，瑞士网格，主色克莱因蓝",
    },
    {
        id: "g12",
        title: "香氛蜡烛 · 详情页",
        author: "温言",
        school: "电子商务",
        subject: "电子商务",
        subjectSlug: "ecommerce",
        cover: `${THUMB}/3d-render.jpg`,
        likes: 768,
        kind: "image",
        prompt: "香氛蜡烛商品主图，大理石台面，柔光棚拍，背景留白，800×800",
    },
];
