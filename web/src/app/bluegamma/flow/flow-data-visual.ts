import type { MajorFlow } from "@/app/bluegamma/flow/flow-types";

/* 平面与商业类：广告、视传、电商 */

export const ADVERTISING_FLOW: MajorFlow = {
    slug: "advertising",
    brief: "夏日冰饮新品上市",
    deliverable: "一套广告 campaign：调研 → 文案脚本 → KV → 海报 → 视频广告",
    steps: [
        {
            key: "research",
            name: "市场调研",
            kind: "text",
            goal: "目标人群、竞品打法、核心卖点",
            presets: [{ name: "campaign 调研", prompt: "为「{课题}」做广告前期调研：目标人群画像、竞品广告策略、产品核心卖点、传播渠道建议，要点式输出。" }],
            sample: ["人群：18–28 岁学生与新白领", "竞品：主打清爽、颜值，少有情绪价值", "卖点：0 糖 + 真果肉 + 冰感", "渠道：小红书种草 + 校园地铁灯箱"],
        },
        {
            key: "copy",
            name: "文案脚本",
            kind: "text",
            goal: "slogan、主标题、15 秒脚本",
            refs: ["research"],
            presets: [{ name: "slogan + 脚本", prompt: "根据调研，为「{课题}」写 5 条 slogan、3 组海报主副标题、一条 15 秒视频广告分镜脚本。" }],
            sample: ["slogan：一口，夏天就停了", "主标：冰到心里的 0 糖", "15s 脚本：开瓶声 → 冰块慢镜 → 喝下 → 城市变凉"],
        },
        {
            key: "kv",
            name: "KV 视觉",
            kind: "image",
            goal: "定主视觉与主色，后面所有媒介都从这里延展",
            refs: ["copy"],
            presets: [
                { name: "清爽高饱和", prompt: "「{课题}」主 KV，冰块与水花飞溅，高饱和青绿，产品居中，商业摄影质感" },
                { name: "插画风", prompt: "「{课题}」扁平插画风 KV，夏日海边，产品作为主角，留出标题位" },
            ],
            tip: "KV 定了色，后面的海报和视频都会跟着这套颜色走。",
        },
        {
            key: "poster",
            name: "海报设计",
            kind: "image",
            goal: "按 KV 延展出多尺寸海报",
            refs: ["kv", "copy"],
            presets: [
                { name: "竖版主海报", prompt: "按 KV 延展 3:4 竖版海报，排入主标题与 slogan，品牌 logo 位" },
                { name: "地铁灯箱", prompt: "按 KV 延展 16:9 地铁灯箱，横向构图，大字标题" },
            ],
        },
        {
            key: "video",
            name: "视频广告",
            kind: "video",
            goal: "首尾帧生成 15 秒广告片",
            refs: ["kv", "copy"],
            presets: [{ name: "首尾帧", prompt: "以 KV 为首帧，产品特写为尾帧，冰块慢镜旋转，15 秒，清爽节奏" }],
        },
    ],
};

export const VISUAL_FLOW: MajorFlow = {
    slug: "visual-communication",
    brief: "新式茶饮品牌「青屿」",
    deliverable: "一套品牌 VI：调研 → 定位 → 字体色彩 → 图形 LOGO → 版式 → 海报",
    steps: [
        {
            key: "research",
            name: "市场调研",
            kind: "text",
            goal: "行业、竞品视觉、目标人群审美",
            presets: [{ name: "品牌调研", prompt: "我是视传学生，做课程品牌设计「{课题}」，请完成市场调研：行业现状、竞品视觉风格对比、目标人群审美偏好、差异化机会。" }],
            sample: ["竞品多用国潮红金，同质化严重", "人群偏好：留白、低饱和、东方但不老气", "机会：宋韵 + 极简，青瓷色系"],
        },
        {
            key: "position",
            name: "品牌定位",
            kind: "image",
            goal: "定调性：情绪板 + 关键词",
            refs: ["research"],
            presets: [{ name: "情绪板", prompt: "「{课题}」品牌情绪板，现代宋韵，水墨留白，青瓷蓝 + 暖米白，关键词标注" }],
        },
        {
            key: "type",
            name: "字体 / 色彩",
            kind: "image",
            goal: "标准字、辅助字、主辅色与比例",
            refs: ["position"],
            presets: [{ name: "字色规范", prompt: "「{课题}」标准字设计与色彩规范页，主色、辅色、点缀色色值与比例" }],
        },
        {
            key: "logo",
            name: "图形 / LOGO",
            kind: "image",
            goal: "标志、辅助图形、吉祥物",
            refs: ["type"],
            presets: [
                { name: "矢量 LOGO", prompt: "「{课题}」标志设计，SVG 矢量风格，扁平 2D，纯色平涂，正负形，附黑白稿" },
                { name: "辅助图形", prompt: "「{课题}」辅助图形，由标志拆解的几何纹样，可做包装底纹" },
            ],
        },
        {
            key: "layout",
            name: "版式 / 层级",
            kind: "image",
            goal: "画册内页、菜单、包装的版式系统",
            refs: ["logo", "type"],
            presets: [{ name: "画册跨页", prompt: "「{课题}」品牌画册跨页，网格布局，大图 + 文字块，二维正视，无透视" }],
        },
        {
            key: "poster",
            name: "海报设计",
            kind: "image",
            goal: "用整套 VI 出一张品牌海报",
            refs: ["logo", "layout"],
            presets: [{ name: "品牌海报", prompt: "「{课题}」新品海报，沿用品牌色与辅助图形，产品摄影 + 大字标题" }],
        },
    ],
};

export const ECOMMERCE_FLOW: MajorFlow = {
    slug: "ecommerce",
    brief: "原创香氛蜡烛店铺",
    deliverable: "一家店铺从 0 到 1：趋势 → 选品 → 店铺视觉 → 商品图 → 文案 → 运营 → 推广",
    steps: [
        {
            key: "trend",
            name: "趋势调研",
            kind: "text",
            goal: "市场规模、竞争格局、消费人群",
            presets: [{ name: "行业调研", prompt: "为「{课题}」做行业趋势调研：市场规模、竞争格局、消费人群、价格带、机会点。" }],
            sample: ["价格带 59–129 元最拥挤", "机会：疗愈 + 送礼场景", "人群：25–35 岁女性"],
        },
        {
            key: "sku",
            name: "选品规划",
            kind: "text",
            goal: "SKU 金字塔与供应链",
            refs: ["trend"],
            presets: [{ name: "SKU 矩阵", prompt: "根据趋势，为「{课题}」规划 4 款 SKU 金字塔（引流/利润/形象/礼盒）和供应商筛选标准。" }],
            sample: ["引流款：39 元迷你罐", "利润款：99 元标准罐", "形象款：联名限定", "礼盒：3 香组合"],
        },
        { key: "store", name: "店铺视觉", kind: "image", goal: "VI、首页、详情页风格统一", refs: ["sku"], presets: [{ name: "店铺首页", prompt: "「{课题}」店铺首页视觉，奶油色 + 莫兰迪，温柔疗愈氛围" }] },
        {
            key: "photo",
            name: "商品图",
            kind: "image",
            goal: "主图、场景图、细节图",
            refs: ["store"],
            presets: [
                { name: "场景主图", prompt: "「{课题}」商品场景图，窗边木桌，烛光与干花，柔光，电商主图构图" },
                { name: "白底图", prompt: "「{课题}」白底主图，居中，柔和投影" },
            ],
        },
        {
            key: "copy",
            name: "商品文案",
            kind: "text",
            goal: "标题、卖点、直播话术",
            refs: ["photo", "sku"],
            presets: [{ name: "多平台文案", prompt: "为「{课题}」写淘宝标题、小红书笔记、抖音直播话术各一套，前 8 个字要抓人。" }],
            sample: ["标题：下班点一盏，焦虑就熄了", "卖点：大豆蜡 · 45h 燃烧 · 无烟"],
        },
        {
            key: "content",
            name: "内容运营",
            kind: "text",
            goal: "30 天内容日历",
            refs: ["copy"],
            presets: [{ name: "内容日历", prompt: "为「{课题}」制定 30 天内容日历：每周主题、发布节奏、爆款选题与合规提醒。" }],
            sample: ["周一：开箱", "周三：香调科普", "周五：用户晒单"],
        },
        {
            key: "ads",
            name: "推广策略",
            kind: "text",
            goal: "投放渠道、人群包、促销组合",
            refs: ["content"],
            presets: [{ name: "投放矩阵", prompt: "为「{课题}」设计 4 渠道投放矩阵、3 层人群包、5 种促销组合，标注预算占比。" }],
            sample: ["小红书 40% · 抖音 30%", "人群：送礼 / 疗愈 / 家居"],
        },
    ],
};
