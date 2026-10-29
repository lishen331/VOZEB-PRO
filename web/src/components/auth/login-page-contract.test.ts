import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("unified education login page contract", () => {
    it("uses a dedicated split login presentation with safe media fallback", async () => {
        const page = await readFile(resolve(process.cwd(), "src/app/login/page.tsx"), "utf8");
        const form = await readFile(resolve(process.cwd(), "src/components/auth/auth-form.tsx"), "utf8");
        const css = await readFile(resolve(process.cwd(), "src/app/styles/global-auth.css"), "utf8");

        expect(page).toContain('presentation="education-login"');
        expect(form).toContain("auth-education-shell");
        expect(form).toContain("muted autoPlay loop playsInline");
        expect(css).toContain("prefers-reduced-motion: reduce");
        expect(form).toContain("jointBrandUrl");
        expect(form).toContain("policyAccepted");
        expect(form).toContain('mfaRequired ? "验证并登录"');
        expect(form).toContain('educationLogin ? "sr-only"');
        expect(form).toContain('educationLogin ? "auth-education-policy"');
        expect(form).toContain("{isRegister ? (");
        // 全屏影像 + 毛玻璃：背景是半透明播放的宣传片，卡片与输入框都坐在玻璃层上
        expect(form).toContain("auth-education-media");
        expect(form).toContain("auth-education-scrim");
        expect(form).toContain("auth-education-card");
        expect(form).toContain("auth-education-topbar");
        expect(css).toContain("background: #04070f");
        expect(css).toContain("backdrop-filter: blur(30px)");
        expect(css).toContain("border-radius: 28px");
        expect(form).toContain("mfaRequired");
        expect(form).not.toContain("图形验证码");
        expect(css).toContain("grid-template-columns: minmax(0, 1.08fr) minmax(340px, 448px)");
        expect(css).toContain("@media (max-width: 640px)");
    });

    it("keeps both themes on the same brand strip and exposes a draggable theme toggle", async () => {
        const form = await readFile(resolve(process.cwd(), "src/components/auth/auth-form.tsx"), "utf8");
        const toggle = await readFile(resolve(process.cwd(), "src/components/auth/login-theme-toggle.tsx"), "utf8");
        const css = await readFile(resolve(process.cwd(), "src/app/styles/global-auth.css"), "utf8");

        // 联合品牌条：中国动漫集团 → BLUEGAMMA → 两行说明文字，顺序固定
        expect(form.indexOf("brand-cacg.png")).toBeLessThan(form.indexOf("brand-bluegamma.png"));
        expect(form.indexOf("brand-bluegamma.png")).toBeLessThan(form.indexOf("auth-education-partner-desc"));
        expect(form).toContain("广东AIGC培训产教融合基地");
        expect(form).toContain("以智能开创影像创作新生态");
        // 同一张原图同时服务明暗两套，不能有暗色专用变体
        expect(form).toContain('className="auth-education-partner-cacg"');
        expect(form).not.toContain("brand-cacg-dark.png");
        expect(css).toContain(".dark .auth-education-partner-cacg");
        expect(css).not.toContain("auth-education-partner-cacg-dark");

        // 登录页明暗切换：可拖动、与站内共用同一个主题存储键
        expect(form).toContain("<LoginThemeToggle />");
        expect(toggle).toContain("useThemeStore");
        expect(toggle).toContain("setTheme");
        expect(toggle).toContain("POSITION_KEY");
        expect(css).toContain(".auth-education-theme-toggle");
        expect(css).toContain("cursor: grab");

        // 特征条目不再是刻度框：形状游走动画 + 减少动效时关闭
        expect(form).toContain("开源模型不限算力，练习不再限量");
        expect(css).toContain("@keyframes ae-blob-morph");
        expect(css).toContain("animation: ae-blob-morph");
        expect(css).toContain("li:nth-child(5)::before");
        // 动画声明只能有一份基础定义，否则后面的会覆盖掉形状游走
        expect(css.match(/animation: ae-blob-morph/g)?.length).toBe(1);
    });
});
