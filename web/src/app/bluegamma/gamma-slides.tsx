import { GammaButton } from "@/components/gamma-ui/gamma-button";
import type { GammaBannerSlide } from "@/components/gamma-ui/gamma-hero";

/** 首页轮播内容；按钮直接跳到对应专业的生成输入 */
export function buildHomeSlides(pickSubject: (slug: string) => void): GammaBannerSlide[] {
    return [
        {
            key: "launch",
            eyebrow: "BlueGamma 2.0",
            title: (
                <>
                    12 个设计专业，<span className="gm-gradient-text">一个创作台</span>
                </>
            ),
            description: "从效果图到成片，服装、室内、影视、游戏一站生成",
            cover: "/style-thumbs/cinematic.jpg",
            action: (
                <GammaButton size="sm" variant="cyan" onClick={() => pickSubject("film")}>
                    试试影视概念镜头
                </GammaButton>
            ),
        },
        {
            key: "fashion",
            eyebrow: "服装设计 · 系列效果图",
            title: "一句话出一整个系列",
            description: "面料、廓形、配色一次推演，正侧背三视图同步出",
            cover: "/style-thumbs/realistic.jpg",
            action: (
                <GammaButton size="sm" variant="glass" onClick={() => pickSubject("fashion")}>
                    生成系列效果图
                </GammaButton>
            ),
        },
        {
            key: "game-art",
            eyebrow: "游戏艺术 · 场景概念",
            title: "把世界观画出来",
            description: "场景概念、角色原画、图标套组，风格统一",
            cover: "/style-thumbs/dark-fantasy.jpg",
            action: (
                <GammaButton size="sm" variant="glass" onClick={() => pickSubject("game-art")}>
                    开始画场景
                </GammaButton>
            ),
        },
    ];
}
