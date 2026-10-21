import type { MajorFlow } from "@/app/bluegamma/flow/flow-types";

/* 影像与叙事类：影视、数媒、动漫、游戏 */

export const FILM_FLOW: MajorFlow = {
    slug: "film",
    brief: "都市情感短片《未寄出的信》",
    deliverable: "一部短片前期全套：策划 → 剧本 → 分镜 → 筹备清单 → 声音 → 海报",
    steps: [
        { key: "plan", name: "项目策划", kind: "text", goal: "选题、题材定位、一句话梗概", presets: [{ name: "短片策划", prompt: "为「{课题}」做前期策划：片长 15 分钟以内，面向高校展映，输出选题价值、题材定位、目标观众、LOGLINE。" }], sample: ["LOGLINE：一封写了六年的信，终于在搬家那天被发现", "定位：都市情感 · 低成本 · 3 场景"] },
        { key: "script", name: "剧本创作", kind: "text", goal: "结构、冲突、情感基调", refs: ["plan"], presets: [{ name: "三幕剧本", prompt: "根据策划写「{课题}」三幕剧本，含场景标题、动作描述与对白。" }], sample: ["第一幕：出租屋，搬家", "第二幕：地铁站台，重逢", "第三幕：天台，寄出"] },
        { key: "board", name: "分镜设计", kind: "image", goal: "镜号、景别、运镜、画面", refs: ["script"], presets: [{ name: "电影分镜", prompt: "「{课题}」关键场景分镜故事板，2×3 宫格，标注镜号、景别、运镜，电影感" }, { name: "手绘分镜", prompt: "「{课题}」手绘分镜，铅笔线稿，箭头标注运镜" }] },
        { key: "prep", name: "筹备清单", kind: "text", goal: "场景、角色、道具、勘景", refs: ["script"], presets: [{ name: "拍摄筹备", prompt: "基于「{课题}」剧本生成拍摄筹备清单：场景资产、人物、道具、勘景与许可事项，表格式。" }], sample: ["场景：出租屋 / 地铁站台 / 天台", "道具：旧信封 × 6、搬家纸箱"] },
        { key: "sound", name: "声音设计", kind: "audio", goal: "旁白、配音、氛围音", refs: ["script"], presets: [{ name: "预告旁白", prompt: "电影预告风格男声旁白：「有些信，写了六年，却一直没有寄出。」语速 0.75x，低沉" }] },
        { key: "poster", name: "宣传海报", kind: "image", goal: "主视觉海报", refs: ["board"], presets: [{ name: "电影海报", prompt: "「{课题}」电影海报，天台黄昏剪影，一封信被风吹起，片名大字" }] },
    ],
};

export const DIGITAL_MEDIA_FLOW: MajorFlow = {
    slug: "digital-media",
    brief: "治愈系游戏 Demo《露亚的花坊》",
    deliverable: "一个数媒作品：策划 → 配图素材 → 脚本 → 交互流程 → 视频 → 配乐",
    steps: [
        { key: "plan", name: "前期策划", kind: "text", goal: "选题定位、受众、玩法亮点", presets: [{ name: "项目策划", prompt: "为「{课题}」写前期策划：选题定位、目标受众、核心玩法、视觉风格方向。" }], sample: ["定位：治愈系模拟经营", "风格：3D 像素卡通 · 春日暖光"] },
        { key: "art", name: "配图素材", kind: "image", goal: "概念图、氛围图、风格参考", refs: ["plan"], presets: [{ name: "概念氛围图", prompt: "「{课题}」概念氛围图，3D 像素卡通，花店与小镇，柔和春日阳光" }] },
        { key: "script", name: "脚本 / 叙事", kind: "text", goal: "剧情与角色台词", refs: ["plan"], presets: [{ name: "叙事脚本", prompt: "为「{课题}」写开场叙事脚本：主角、动机、第一章任务与 3 段台词。" }], sample: ["主角露亚继承了奶奶的花坊", "第一章：让枯萎的花园重新开花"] },
        { key: "flow", name: "交互流程", kind: "image", goal: "界面布局与操作流程", refs: ["script", "art"], presets: [{ name: "UI 原型", prompt: "「{课题}」交互流程示意图：主界面、种植、售卖、升级四屏，UI 原型" }] },
        { key: "video", name: "视频生成", kind: "video", goal: "Demo 预告片", refs: ["art"], presets: [{ name: "Demo 预告", prompt: "「{课题}」26 秒 Demo 预告，16:9，不间断长镜头穿过小镇来到花坊，温暖治愈" }] },
        { key: "music", name: "音乐生成", kind: "audio", goal: "主题配乐", refs: ["plan"], presets: [{ name: "主题曲", prompt: "为「{课题}」生成 3 分钟主题配乐，木管、竖琴、钢片琴，温暖轻快" }] },
    ],
};

export const ANIMATION_FLOW: MajorFlow = {
    slug: "animation",
    brief: "国漫短片《少年林琅》",
    deliverable: "一部动画短片：剧本 → 角色设定 → 分镜 → 镜头动画 → 配音 → 剪辑",
    steps: [
        { key: "script", name: "剧本创作", kind: "text", goal: "世界观、人物、分场", presets: [{ name: "短篇剧本", prompt: "为「{课题}」写 3 分钟动画剧本：世界观一句话、主角动机、分场与关键对白。" }], sample: ["少年林琅被逐出神殿，誓要证明自己", "分场：神殿 → 边陲村庄 → 修士对决"] },
        { key: "char", name: "角色设定", kind: "image", goal: "三视图、表情、配色", refs: ["script"], presets: [{ name: "角色三视图", prompt: "「{课题}」主角三视图与表情集，热血国漫风，白底" }] },
        { key: "board", name: "分镜配图", kind: "image", goal: "关键镜头画面", refs: ["char", "script"], presets: [{ name: "动漫分镜", prompt: "少年冲出神殿，背后青龙图腾大门，愤怒表情，远景镜头拉远，国漫立绘风" }] },
        { key: "motion", name: "镜头动画", kind: "video", goal: "分镜转动态", refs: ["board"], presets: [{ name: "图生视频", prompt: "按分镜生成 5 秒动画，镜头慢慢拉远，衣摆与发丝随风" }] },
        { key: "voice", name: "音效配音", kind: "audio", goal: "角色配音与音效", refs: ["script"], presets: [{ name: "少年配音", prompt: "少年男声，愤怒但克制：「我会回来的。」" }] },
        { key: "edit", name: "动画剪辑", kind: "video", goal: "合成成片", refs: ["motion", "voice"], presets: [{ name: "成片", prompt: "把所有镜头按分场顺序合成，加配音与转场" }] },
    ],
};

export const GAME_FLOW: MajorFlow = {
    slug: "game-art",
    brief: "暗黑奇幻 RPG《灰烬王座》",
    deliverable: "一套游戏美术：剧情设定 → 角色 → 场景 → 图标 → 宣传物料",
    steps: [
        { key: "lore", name: "剧情设定", kind: "text", goal: "世界观、阵营、主线", presets: [{ name: "世界观", prompt: "为「{课题}」写世界观设定：时代背景、三大阵营、主线冲突、美术关键词。" }], sample: ["王座崩塌后的灰烬纪元", "阵营：余烬骑士 / 灰教团 / 流民", "美术关键词：哥特、余烬、冷暖对比"] },
        { key: "char", name: "形象设计", kind: "image", goal: "主角与阵营代表", refs: ["lore"], presets: [{ name: "角色原画", prompt: "「{课题}」余烬骑士角色原画，破损铠甲，余烬光效，暗黑奇幻" }] },
        { key: "scene", name: "场景生成", kind: "image", goal: "关卡概念与氛围", refs: ["lore"], presets: [{ name: "场景概念", prompt: "「{课题}」废弃王座大厅场景概念，冷光从穹顶裂缝落下，余烬漂浮" }] },
        { key: "icon", name: "图标素材", kind: "image", goal: "技能 / 道具图标统一风格", refs: ["char"], presets: [{ name: "技能图标", prompt: "「{课题}」技能图标一组 9 个，统一描边与光效，暗黑奇幻" }] },
        { key: "promo", name: "宣传物料", kind: "image", goal: "主视觉与商店图", refs: ["char", "scene"], presets: [{ name: "游戏 KV", prompt: "「{课题}」游戏主视觉，骑士立于王座废墟前，标题 logo 位" }] },
    ],
};
