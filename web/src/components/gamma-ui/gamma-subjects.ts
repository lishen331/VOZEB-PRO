import { Amphora, Box, Cast, Cat, Clapperboard, Eye, Gamepad2, Gem, House, Megaphone, Shirt, ShoppingBag } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/*
 * 专业方向：布鲁伽马服务设计与艺术类院校的 12 个专业方向，替代原「Agent / 工具」入口。
 * 每个方向自带常用产出形态、代表性风格标签和示例提示词。
 * accent 统一在品牌蓝青区间取色，避免首页变成调色盘。
 */

export type SubjectAccent = "blue" | "cyan" | "indigo" | "teal" | "violet" | "sky";

export interface GammaSubject {
    slug: string;
    name: string;
    /** 英文名：卡片副标题与等宽装饰 */
    nameEn: string;
    tagline: string;
    /** 该方向常用的产出形态 */
    outputs: readonly string[];
    /** 代表性风格标签 */
    styles: readonly string[];
    icon: LucideIcon;
    accent: SubjectAccent;
    cover: string;
    badge?: "new" | "hot";
    /** 单次生成基础消耗积分 */
    cost: number;
    /** 「帮我写」示例提示词 */
    example: string;
}

export const SUBJECT_ACCENT: Record<SubjectAccent, { glow: string; chip: string; text: string }> = {
    blue: { glow: "rgba(0,80,245,0.42)", chip: "bg-[rgba(0,80,245,0.16)]", text: "text-[var(--gm-blue-text)]" },
    cyan: { glow: "rgba(40,235,250,0.34)", chip: "bg-[var(--gm-accent-soft)]", text: "text-[var(--gm-accent)]" },
    indigo: { glow: "rgba(99,102,241,0.38)", chip: "bg-[rgba(99,102,241,0.16)]", text: "text-[#7c83f5]" },
    teal: { glow: "rgba(45,212,191,0.32)", chip: "bg-[rgba(45,212,191,0.14)]", text: "text-[#14b8a6]" },
    violet: { glow: "rgba(139,92,246,0.34)", chip: "bg-[rgba(139,92,246,0.16)]", text: "text-[#9b7cf6]" },
    sky: { glow: "rgba(56,189,248,0.34)", chip: "bg-[rgba(56,189,248,0.14)]", text: "text-[#38a5e0]" },
};

const THUMB = "/style-thumbs";

export const GAMMA_SUBJECTS: readonly GammaSubject[] = [
    {
        slug: "fashion",
        name: "服装设计",
        nameEn: "Fashion",
        tagline: "款式效果图、面料花型、秀场造型",
        outputs: ["效果图", "面料花型", "走秀视频"],
        styles: ["高定", "街头", "新中式"],
        icon: Shirt,
        accent: "violet",
        cover: `${THUMB}/realistic.jpg`,
        badge: "hot",
        cost: 24,
        example: "新中式女装系列效果图，宋锦提花面料，立领盘扣，莫兰迪色系，正面与侧面三视图",
    },
    {
        slug: "interior",
        name: "室内设计",
        nameEn: "Interior",
        tagline: "空间效果图、软装方案、户型漫游",
        outputs: ["空间效果图", "软装方案", "漫游动画"],
        styles: ["侘寂", "中古", "现代极简"],
        icon: House,
        accent: "teal",
        cover: `${THUMB}/minimalist.jpg`,
        cost: 26,
        example: "120㎡ 侘寂风客厅效果图，微水泥墙面，原木家具，午后侧光，24mm 广角",
    },
    {
        slug: "advertising",
        name: "广告设计",
        nameEn: "Advertising",
        tagline: "主视觉、海报系列、品牌 TVC 分镜",
        outputs: ["主视觉", "海报系列", "TVC 分镜"],
        styles: ["大字报", "C4D", "胶片感"],
        icon: Megaphone,
        accent: "blue",
        cover: `${THUMB}/cyberpunk.jpg`,
        cost: 22,
        example: "运动饮料夏季主视觉，冰块飞溅，高饱和撞色，中心构图，留出主标题位置",
    },
    {
        slug: "digital-media",
        name: "数字媒体",
        nameEn: "Digital Media",
        tagline: "动态海报、交互界面、新媒体装置",
        outputs: ["动态海报", "界面概念", "装置视觉"],
        styles: ["故障艺术", "粒子", "全息"],
        icon: Cast,
        accent: "cyan",
        cover: `${THUMB}/sci-fi.jpg`,
        badge: "new",
        cost: 26,
        example: "沉浸式展厅投影装置概念，流体粒子随观众移动扩散，深蓝到青色渐变",
    },
    {
        slug: "film",
        name: "影视制作",
        nameEn: "Film",
        tagline: "分镜脚本、概念镜头、短片成片",
        outputs: ["分镜", "概念镜头", "短片"],
        styles: ["电影感", "纪实", "黑色电影"],
        icon: Clapperboard,
        accent: "indigo",
        cover: `${THUMB}/cinematic.jpg`,
        badge: "hot",
        cost: 32,
        example: "雨夜霓虹街头，女主撑伞回眸，变焦推近，浅景深，2.39:1 宽银幕",
    },
    {
        slug: "ecommerce",
        name: "电子商务",
        nameEn: "E-commerce",
        tagline: "商品主图、详情页长图、直播背景",
        outputs: ["商品主图", "详情长图", "场景图"],
        styles: ["棚拍", "生活场景", "国潮"],
        icon: ShoppingBag,
        accent: "sky",
        cover: `${THUMB}/3d-render.jpg`,
        cost: 18,
        example: "香氛蜡烛商品主图，大理石台面，柔光棚拍，背景留白，800×800",
    },
    {
        slug: "visual-communication",
        name: "视觉传达",
        nameEn: "Visual Comm.",
        tagline: "品牌 VI、字体设计、信息图表",
        outputs: ["VI 延展", "字体设计", "信息图"],
        styles: ["瑞士风格", "孟菲斯", "新丑风"],
        icon: Eye,
        accent: "blue",
        cover: `${THUMB}/comic.jpg`,
        cost: 20,
        example: "咖啡品牌 VI 延展：杯套、纸袋、门头，瑞士网格，主色克莱因蓝",
    },
    {
        slug: "product",
        name: "产品设计",
        nameEn: "Product",
        tagline: "工业设计渲染、爆炸图、CMF 方案",
        outputs: ["产品渲染", "爆炸图", "CMF 方案"],
        styles: ["工业风", "柔和圆角", "透明科技"],
        icon: Box,
        accent: "teal",
        cover: `${THUMB}/low-poly.jpg`,
        cost: 26,
        example: "便携蓝牙音箱产品渲染，半透明外壳露出内部结构，45° 视角，纯色背景",
    },
    {
        slug: "animation",
        name: "动漫制作",
        nameEn: "Animation",
        tagline: "角色设定、场景原画、动画短片",
        outputs: ["角色设定", "场景原画", "动画片段"],
        styles: ["日系", "国漫", "美式卡通"],
        icon: Cat,
        accent: "violet",
        cover: `${THUMB}/anime.jpg`,
        cost: 28,
        example: "国漫少年剑客角色设定，三视图 + 表情表，青衫长发，赛璐璐上色",
    },
    {
        slug: "game-art",
        name: "游戏艺术",
        nameEn: "Game Art",
        tagline: "角色原画、场景概念、UI 图标",
        outputs: ["角色原画", "场景概念", "图标套组"],
        styles: ["写实奇幻", "像素", "低多边形"],
        icon: Gamepad2,
        accent: "indigo",
        cover: `${THUMB}/dark-fantasy.jpg`,
        badge: "new",
        cost: 30,
        example: "暗黑奇幻游戏场景概念，废弃神殿，红月当空，体积光，横版 16:9",
    },
    {
        slug: "ceramics",
        name: "陶瓷艺术",
        nameEn: "Ceramics",
        tagline: "器型推演、釉色方案、纹样设计",
        outputs: ["器型推演", "釉色方案", "纹样"],
        styles: ["宋瓷", "柴烧", "当代雕塑"],
        icon: Amphora,
        accent: "sky",
        cover: `${THUMB}/chinese.jpg`,
        cost: 22,
        example: "宋代汝窑天青釉梅瓶器型推演，三种口沿变体，开片细节特写",
    },
    {
        slug: "jewelry",
        name: "珠宝设计",
        nameEn: "Jewelry",
        tagline: "首饰手绘、三维渲染、佩戴效果",
        outputs: ["手绘稿", "三维渲染", "佩戴效果"],
        styles: ["高级珠宝", "极简", "东方意象"],
        icon: Gem,
        accent: "cyan",
        cover: `${THUMB}/dreamy.jpg`,
        cost: 28,
        example: "东方意象高级珠宝胸针，银杏叶造型，祖母绿主石，微镶钻边，黑丝绒背景",
    },
];

export function gammaSubjectBySlug(slug: string) {
    return GAMMA_SUBJECTS.find((subject) => subject.slug === slug) ?? GAMMA_SUBJECTS[0];
}

/** 画面比例：设计类产出的常用比例 */
export const GAMMA_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"] as const;
export type GammaRatio = (typeof GAMMA_RATIOS)[number];
