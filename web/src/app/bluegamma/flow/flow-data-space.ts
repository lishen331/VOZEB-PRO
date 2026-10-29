import type { MajorFlow } from "@/app/bluegamma/flow/flow-types";

/* 空间与造型类：室内、服装、产品、陶瓷、珠宝 */

export const INTERIOR_FLOW: MajorFlow = {
    slug: "interior",
    brief: "60㎡ LOFT 复式公寓",
    deliverable: "一套完整室内方案：调研报告 → 草图 → 户型 → 工艺 → 效果图 → 图纸 → A1 展板",
    steps: [
        {
            key: "research",
            name: "市场调研",
            kind: "text",
            goal: "弄清户型条件、使用者是谁、真实痛点，得出设计启示",
            presets: [
                { name: "户型现状调研", prompt: "你是资深室内设计师，帮我做「{课题}」的前期调研，只聚焦室内空间：原始户型条件、层高梁位开窗、目标使用者功能需求、真实居住痛点、成熟平面布局方案，最后输出设计启示，要点式。" },
                { name: "年度流行趋势", prompt: "生成「{课题}」相关的年度住宅流行趋势报告，包含主流风格、色彩与材质趋势、代表案例。" },
                { name: "商业空间调研", prompt: "针对「{课题}」做商业空间调研：目标客群、坪效、动线、竞品门店空间特点、可借鉴的设计策略。" },
            ],
            tip: "调研写得越具体，后面每一步的图越准。可以先让 AI 帮你写一份专业调研提示词。",
            sample: ["层高 4.8m，可做局部夹层，梁位集中在入口一侧", "使用者：独居设计师，在家办公 + 偶尔会客", "痛点：楼梯占面积、夹层压抑、收纳不足", "启示：楼梯与收纳一体化；挑空区留在采光面"],
        },
        {
            key: "sketch",
            name: "灵感草图",
            kind: "image",
            goal: "用手绘线稿把空间感觉先定下来，不上色、不加字",
            refs: ["research"],
            presets: [
                { name: "奶油风", prompt: "「{课题}」客餐厅一体化手绘草图，奶油风，圆弧造型，两层通高挑空，专业室内手绘线条，不要色彩和文字" },
                { name: "极简工业", prompt: "「{课题}」开放式客餐厅草图，极简工业风，钢架悬浮楼梯，长木餐桌，落地窗透视，素描笔触，不要色彩" },
                { name: "新中式", prompt: "「{课题}」新中式客厅草图，木格栅、圆窗框景、留白，钢笔淡彩线稿，不要文字" },
            ],
            tip: "草图阶段只看比例和空间关系，别急着要质感。",
        },
        {
            key: "plan",
            name: "户型设计",
            kind: "image",
            goal: "划分功能区，理顺动线，出平面 / 鸟瞰户型图",
            refs: ["sketch", "research"],
            presets: [
                { name: "2D 彩平", prompt: "「{课题}」2D 彩色平面户型图，一楼玄关、客餐厨一体、干湿分离公卫；二楼主卧与迷你衣帽间；原木地板、白墙，标注功能区" },
                { name: "等轴测鸟瞰", prompt: "「{课题}」等轴测鸟瞰户型图，剖开屋顶看两层空间，3D 室内渲染，柔和自然光，方案展示级" },
            ],
            tip: "连着上一步的草图生成，AI 会沿用草图里的空间关系。",
        },
        {
            key: "detail",
            name: "工艺细化",
            kind: "image",
            goal: "把墙、地、顶的构造与收口讲清楚，给图纸做依据",
            refs: ["plan"],
            presets: [
                { name: "无主灯吊顶", prompt: "室内设计构造节点：无主灯悬浮吊顶 + 灯槽，剖面示意，标注龙骨、石膏板、灯带位置" },
                { name: "墙地收口", prompt: "室内设计构造节点：实木地板铺设与踢脚线收口、乳胶漆墙面基层，剖面示意图" },
            ],
        },
        {
            key: "render",
            name: "材质 / 软装",
            kind: "image",
            goal: "从方案变成效果图：材质、灯光、软装一次定调",
            refs: ["plan", "sketch"],
            presets: [
                { name: "轻奢", prompt: "「{课题}」客餐厨效果图，轻奢配色，咖色艺术肌理墙面，石材通铺，金色细节，柔光质感，真实物理材质" },
                { name: "原木暖调", prompt: "「{课题}」效果图，原木 + 米白，棉麻布艺软装，午后斜光，真实材质纹理" },
                { name: "暗调高级", prompt: "「{课题}」效果图，深胡桃木饰面，深色大理石地面，无主灯线性照明，落地窗长影" },
            ],
        },
        {
            key: "drawing",
            name: "图纸设计",
            kind: "image",
            goal: "输出可落地的平面 / 立面 / 水电图纸",
            refs: ["plan"],
            presets: [
                { name: "水电专项图", prompt: "根据「{课题}」户型图生成专业水电点位图，标注插座、开关、给排水，CAD 线稿风格" },
                { name: "主要立面图", prompt: "「{课题}」客厅电视墙与沙发墙立面图，1:50，标注尺寸与材质，CAD 线稿" },
            ],
        },
        {
            key: "board",
            name: "海报展板",
            kind: "image",
            goal: "把前面所有成果排成一张 A1 竞赛 / 毕设展板",
            refs: ["render", "plan", "detail"],
            presets: [
                { name: "竞赛展板", prompt: "A1 竖版室内设计竞赛展板，标题「{课题}」，左侧设计概念与空间分析，中间主效果图大图，右侧平面图、动线分析、材质板，黑白灰低饱和，细金色分割线" },
                { name: "复古水墨排版", prompt: "3:4 竖版全案设计展板，米黄仿古纸底纹、水墨花卉装饰边，顶部竖排大标题「{课题}」，下方设计说明、业主分析、材质分析、细节特写、彩平图" },
            ],
            tip: "展板会自动带上效果图、户型图、工艺图三张参考。",
        },
    ],
};
export const FASHION_FLOW: MajorFlow = {
    slug: "fashion",
    brief: "法式茶歇连衣裙 · X 型",
    deliverable: "一套成衣方案：款式图 → 纸样 → 工艺图 → 面料方案 → 上身效果 → 大片",
    steps: [
        {
            key: "style",
            name: "灵感款式",
            kind: "image",
            goal: "定下廓形与款式，文生、图生、手稿成款都可以",
            presets: [
                { name: "法式茶歇", prompt: "「{课题}」款式图，V 领收腰，大摆裙摆，雪纺面料，柔美氛围，正背面平铺款式图" },
                { name: "新中式", prompt: "「{课题}」新中式款式图，立领盘扣，宋锦提花，H 型廓形，正背面款式图" },
                { name: "手稿成款", prompt: "参考我上传的手绘草图，生成「{课题}」的正式款式图，保留廓形与结构线" },
            ],
            tip: "有手稿就上传，AI 会按你的线条成款。",
        },
        {
            key: "pattern",
            name: "制版 / 纸样",
            kind: "image",
            goal: "按款式出符合专业规范的纸样线稿",
            refs: ["style"],
            presets: [
                { name: "女装 X 型", prompt: "根据款式图生成「{课题}」的纸样线稿，前片、后片、袖片、裙片分开，标注省位与布纹线，符合高校服装专业制版图样式" },
                { name: "女装 A 型", prompt: "A 型裙纸样线稿，标注腰省、侧缝、下摆弧度与缝份" },
            ],
        },
        {
            key: "craft",
            name: "工艺设计",
            kind: "image",
            goal: "收省、分割、缝制工艺讲清楚",
            refs: ["style", "pattern"],
            presets: [
                { name: "结构收省", prompt: "根据款式图生成「{课题}」的结构塑形工艺图：胸省、腰省、肩省、腋下省，标注位置与作用" },
                { name: "缝制细节", prompt: "「{课题}」缝制工艺细节图：法式缝、隐形拉链、卷边，局部放大示意" },
            ],
        },
        {
            key: "fabric",
            name: "色彩 / 面料",
            kind: "image",
            goal: "确定配色与面料，看清垂感和光泽",
            refs: ["craft"],
            presets: [
                { name: "醋酸缎面", prompt: "「{课题}」面料方案：醋酸缎面，垂坠光泽，奶咖 + 雾霾蓝配色，面料小样与配色卡" },
                { name: "棉麻", prompt: "「{课题}」面料方案：水洗棉麻，自然肌理，米白 + 橄榄绿" },
            ],
        },
        {
            key: "wear",
            name: "上身效果",
            kind: "image",
            goal: "穿到模特身上，看比例和动态",
            refs: ["fabric", "style"],
            presets: [{ name: "棚拍正侧背", prompt: "「{课题}」模特上身效果，棚拍白底，正面、侧面、背面三视图" }],
        },
        {
            key: "lookbook",
            name: "换模特 / 背景",
            kind: "image",
            goal: "换场景出系列大片，做作品集封面",
            refs: ["wear"],
            presets: [
                { name: "巴黎街拍", prompt: "保持服装不变，模特走在巴黎街头，午后逆光，时装大片质感" },
                { name: "极简展厅", prompt: "保持服装不变，置于极简白色展厅，柔和顶光，作品集封面构图" },
            ],
        },
    ],
};

export const PRODUCT_FLOW: MajorFlow = {
    slug: "product",
    brief: "便携式桌面加湿器",
    deliverable: "一套产品方案：功能定义 → 概念草图 → 细节迭代 → 渲染 / 三视图 → 展板",
    steps: [
        {
            key: "define",
            name: "功能梳理",
            kind: "text",
            goal: "用户是谁、在什么场景用、必须解决哪几个问题",
            presets: [{ name: "用户与场景", prompt: "为「{课题}」做产品定义：目标用户画像、使用场景、核心痛点、功能清单（必需 / 加分）、竞品对比，要点式输出。" }],
            sample: ["用户：办公室久坐人群，桌面空间小", "痛点：加水麻烦、夜间灯光刺眼、清洗难", "必需功能：上加水、静音、可拆洗", "加分：氛围灯 + 定时"],
        },
        {
            key: "concept",
            name: "概念草图",
            kind: "image",
            goal: "多方案发散，先比造型再比细节",
            refs: ["define"],
            presets: [
                { name: "马克笔草图", prompt: "「{课题}」产品概念草图，一页 6 个方案，马克笔 + 针管笔，标注功能点" },
                { name: "极简几何", prompt: "「{课题}」极简几何造型概念，圆柱与切面组合，线稿 + 淡彩" },
            ],
        },
        {
            key: "refine",
            name: "细节修改",
            kind: "image",
            goal: "选定方案，局部改按键、出雾口、CMF",
            refs: ["concept"],
            presets: [{ name: "CMF 方案", prompt: "选定方案的 CMF 设计：磨砂 PP 机身 + 透明水箱 + 金属旋钮，三套配色" }],
            tip: "只改不满意的局部，用局部重绘别整张重来。",
        },
        {
            key: "model",
            name: "三维建模 / 渲染",
            kind: "image",
            goal: "出渲染图与三视图，确认尺寸比例",
            refs: ["refine"],
            presets: [
                { name: "棚拍渲染", prompt: "「{课题}」产品渲染图，C4D + OC 质感，柔光棚拍，浅灰渐变背景" },
                { name: "三视图", prompt: "「{课题}」正视、侧视、顶视三视图，标注主要尺寸" },
            ],
        },
        {
            key: "board",
            name: "展板文案",
            kind: "image",
            goal: "设计说明 + 使用场景 + 爆炸图排成展板",
            refs: ["model", "define"],
            presets: [{ name: "产品展板", prompt: "A2 横版产品设计展板，标题「{课题}」，主渲染图、使用场景图、爆炸图、设计说明、尺寸图" }],
        },
    ],
};

export const CERAMICS_FLOW: MajorFlow = {
    slug: "ceramics",
    brief: "青花书卷仕女摆件",
    deliverable: "一件陶瓷作品方案：灵感 → 纹饰与釉色细化 → 立体造型 → 作品说明",
    steps: [
        {
            key: "idea",
            name: "灵感生成",
            kind: "image",
            goal: "定下器型、工艺类型、纹饰与釉色方向",
            presets: [
                { name: "青花", prompt: "「{课题}」青花陶瓷立体雕塑，蓝白配色，典雅气质，博物馆展陈光" },
                { name: "汝窑天青", prompt: "「{课题}」汝窑天青釉器型，开片纹理，极简东方，柔光" },
            ],
        },
        {
            key: "refine",
            name: "细节修改",
            kind: "image",
            goal: "局部调整纹饰、口沿、釉面效果",
            refs: ["idea"],
            presets: [{ name: "纹饰细化", prompt: "保持器型不变，细化表面纹饰为缠枝莲纹，釉面更透亮" }],
        },
        {
            key: "model",
            name: "三维建模",
            kind: "image",
            goal: "多角度看造型，为拉坯 / 注浆做参考",
            refs: ["refine"],
            presets: [{ name: "多角度", prompt: "「{课题}」正面、侧面、45° 三视角展示，白底，真实陶瓷材质" }],
        },
        {
            key: "copy",
            name: "作品说明",
            kind: "text",
            goal: "写创作理念、工艺说明、展签文案",
            refs: ["model"],
            presets: [{ name: "展签文案", prompt: "为陶瓷作品「{课题}」写作品说明：创作理念、文化来源、工艺流程（成型/施釉/烧成）、尺寸，150 字展签版。" }],
            sample: ["理念：以翻动的书页塑造仕女身形，书卷即人", "工艺：注浆成型 → 青花手绘 → 1300℃ 还原烧", "展签：《书中人》 高 32cm 青花瓷"],
        },
    ],
};

export const JEWELRY_FLOW: MajorFlow = {
    slug: "jewelry",
    brief: "银杏主题胸针",
    deliverable: "一件珠宝方案：灵感 → 结构与镶嵌细化 → 三维模型 → 系列文案",
    steps: [
        {
            key: "idea",
            name: "灵感生成",
            kind: "image",
            goal: "确定主题、材质与工艺方向",
            presets: [
                { name: "自然仿生", prompt: "「{课题}」珠宝设计手绘效果图，18K 金 + 珐琅，自然仿生，黑底高光" },
                { name: "东方意象", prompt: "「{课题}」东方意象珠宝，花丝镶嵌 + 点翠质感，国风" },
            ],
        },
        {
            key: "refine",
            name: "细节修改",
            kind: "image",
            goal: "调整镶口、配石、结构连接",
            refs: ["idea"],
            presets: [{ name: "镶嵌结构", prompt: "保持造型，细化镶嵌：主石爪镶、副石密钉镶，展示背面结构与别针" }],
        },
        {
            key: "model",
            name: "三维建模",
            kind: "image",
            goal: "渲染多角度，确认可加工",
            refs: ["refine"],
            presets: [{ name: "珠宝渲染", prompt: "「{课题}」珠宝 3D 渲染，正面与 45° 视角，黑色丝绒背景，金属与宝石反射真实" }],
        },
        {
            key: "copy",
            name: "系列文案",
            kind: "text",
            goal: "写设计灵感、材质工艺、系列命名",
            refs: ["model"],
            presets: [{ name: "系列文案", prompt: "为珠宝作品「{课题}」写设计说明：灵感来源、材质与工艺、佩戴场景、系列命名 3 个备选。" }],
            sample: ["灵感：深秋银杏叶脉的扇形节奏", "材质：18K 黄金 + 黄色蓝宝石", "命名：「秋扇」「叶语」「金阙」"],
        },
    ],
};
