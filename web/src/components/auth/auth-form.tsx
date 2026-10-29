"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Gift, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Button, Checkbox } from "@/components/gamma-ui/gamma-ant";

import { SiteLogo } from "@/components/layout/site-logo";
import { LoginThemeToggle } from "@/components/auth/login-theme-toggle";
import { DEFAULT_SITE_TITLE, resolveSiteTitle } from "@/lib/site-brand";
import type { PublicSiteSettings } from "@/stores/use-public-session-store";
import { resolveLoginDestination } from "@/lib/login-navigation";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { type LocalUser, useUserStore } from "@/stores/use-user-store";
import { cn } from "@/lib/utils";

type AuthFormProps = {
    mode: "login" | "register";
    nextPath?: string;
    initialSite?: PublicSiteSettings;
    initialFeatureModules?: { "creative-agent"?: boolean };
    registrationEnabled?: boolean;
    emailRegistrationEnabled?: boolean;
    firstUser?: boolean;
    installToken?: string;
    onInstallTokenChange?: (value: string) => void;
    variant?: "page" | "embedded";
    presentation?: "default" | "education-login";
    className?: string;
    headerSlot?: ReactNode;
    authError?: string;
    initialReferralCode?: string;
    referralSource?: string;
    inviteError?: string;
};

export function AuthForm({
    mode,
    nextPath,
    initialSite,
    initialFeatureModules,
    registrationEnabled = true,
    emailRegistrationEnabled = false,
    firstUser = false,
    installToken = "",
    onInstallTokenChange,
    variant = "page",
    presentation = "default",
    className,
    headerSlot,
    authError,
    initialReferralCode = "",
    referralSource = "registration-form",
    inviteError,
}: AuthFormProps) {
    const { message } = App.useApp();
    const publicSite = usePublicSessionStore((state) => state.payload?.settings?.site);
    const site = publicSite || initialSite || { title: DEFAULT_SITE_TITLE, logoUrl: "/logo.svg" };
    const siteTitle = resolveSiteTitle(site.title);
    const setUser = useUserStore((state) => state.setUser);
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [emailCode, setEmailCode] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [totpCode, setTotpCode] = useState("");
    const [mfaRequired, setMfaRequired] = useState(false);
    const [referralCode, setReferralCode] = useState(initialReferralCode);
    const [policyAccepted, setPolicyAccepted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [sendingCode, setSendingCode] = useState(false);
    const [heroVideoReady, setHeroVideoReady] = useState(false);
    const [heroMotionEnabled, setHeroMotionEnabled] = useState(false);
    const isRegister = mode === "register";
    const disabled = isRegister && !registrationEnabled;
    const installTokenReady = !firstUser || installToken.trim().length >= 32;
    const educationLogin = presentation === "education-login" && !isRegister && !firstUser;
    const loginPage = site.loginPage || {
        heroVideoUrl: "/login/hero.mp4",
        heroPosterUrl: "/login/hero-poster.webp",
        jointBrandUrl: "/login/joint-brand.webp",
        slogan: "以热爱，燃未来",
        platformName: "AIGC 智能影像教学平台",
        footerOrganization: "",
        servicePhone: "",
        serviceHours: "",
    };

    useEffect(() => {
        if (!educationLogin) return;
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const syncMotion = () => setHeroMotionEnabled(!media.matches);
        syncMotion();
        media.addEventListener("change", syncMotion);
        return () => media.removeEventListener("change", syncMotion);
    }, [educationLogin]);

    // 登录页明暗两套配色都支持，跟随用户主题，不再强制浅色

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (disabled) return;
        setSubmitting(true);
        try {
            const response = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username,
                    email,
                    emailCode,
                    displayName,
                    password,
                    totpCode: !isRegister && mfaRequired ? totpCode : undefined,
                    referralCode: isRegister && !firstUser ? referralCode : undefined,
                    referralSource,
                    policyAccepted: isRegister && !firstUser ? policyAccepted : undefined,
                    installToken: firstUser ? installToken.trim() : undefined,
                }),
            });
            const payload = (await response.json()) as { user?: LocalUser; error?: string; mfaRequired?: boolean; securityNotice?: { networkChanged: boolean; deviceChanged: boolean } };
            if (!isRegister && payload.mfaRequired) {
                setMfaRequired(true);
                message.info("请输入身份验证器动态码");
                return;
            }
            if (!response.ok || !payload.user) throw new Error(payload.error || (isRegister ? "注册失败" : "登录失败"));
            setUser(payload.user);
            if (!isRegister && payload.securityNotice) {
                const changed = [payload.securityNotice.deviceChanged ? "设备" : "", payload.securityNotice.networkChanged ? "网络" : ""].filter(Boolean).join("和");
                message.warning(`检测到登录${changed}发生变化，请在账户与安全中核对登录记录`);
            } else {
                message.success(isRegister ? "注册成功" : "登录成功");
            }
            const featureModules = usePublicSessionStore.getState().payload?.settings?.featureModules || initialFeatureModules;
            const destination = resolveLoginDestination(payload.user, nextPath, featureModules);
            if (!isRegister && nextPath && destination !== nextPath) message.warning("当前账号无权访问原目标，已进入默认工作区");
            window.location.replace(destination);
        } catch (error) {
            message.error(error instanceof Error ? error.message : isRegister ? "注册失败" : "登录失败");
        } finally {
            setSubmitting(false);
        }
    };

    const sendEmailCode = async () => {
        setSendingCode(true);
        try {
            const response = await fetch("/api/auth/email-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ purpose: "register", email }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(payload.error || "验证码发送失败");
            message.success("验证码已发送，请查看邮箱");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "验证码发送失败");
        } finally {
            setSendingCode(false);
        }
    };

    const form = (
        <section className={cn("auth-panel flex min-h-full items-center", educationLogin ? "auth-education-form-panel" : variant === "embedded" ? "p-6 sm:p-7" : "p-8 sm:p-10", className)}>
            <form onSubmit={submit} className={cn("auth-form-body w-full", educationLogin ? "auth-education-form-body" : variant === "embedded" ? "space-y-4" : "space-y-6")}>
                {headerSlot}
                {educationLogin ? (
                    <div className="auth-education-card-head">
                        <p className="auth-education-card-kicker">ACCOUNT SIGN IN</p>
                        <h2 className="auth-education-card-title">登录账号</h2>
                    </div>
                ) : (
                    <div className="auth-form-header">
                        <p className="auth-form-kicker text-sm font-medium">{firstUser ? "首次初始化" : isRegister ? "创建创作账号" : "欢迎回来"}</p>
                        <h2 className={cn("mt-2 font-semibold tracking-normal text-[var(--gm-text)]", variant === "embedded" ? "text-2xl" : "text-3xl")}>{firstUser ? "创建首个管理员" : isRegister ? `注册 ${siteTitle}` : `登录 ${siteTitle}`}</h2>
                        <p className="auth-form-description mt-3 text-sm leading-6 text-[var(--gm-text-2)]">{isRegister ? "保存创作项目、提示词和常用风格，从同一个入口继续。" : "继续你的电商、短剧、美颜与画布创作。"}</p>
                    </div>
                )}

                {authError ? <div className="rounded-md border border-[color-mix(in_srgb,var(--gm-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--gm-danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--gm-danger)]">{authError}</div> : null}

                {isRegister && inviteError ? <div className="rounded-md border border-[color-mix(in_srgb,var(--gm-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--gm-warning)_10%,transparent)] px-4 py-3 text-sm text-[var(--gm-warning)]">{inviteError}</div> : null}

                {disabled ? <div className="rounded-md border border-[color-mix(in_srgb,var(--gm-accent)_40%,transparent)] bg-[var(--gm-accent-soft)] px-4 py-3 text-sm text-[var(--gm-accent)]">当前站点已关闭注册，请联系管理员开通账号。</div> : null}

                {firstUser ? (
                    <label className="block space-y-3">
                        <span className="text-sm font-medium text-[var(--gm-text-2)]">一次性安装令牌</span>
                        <Input.Password
                            size="large"
                            prefix={<LockKeyhole className="size-4 text-[var(--gm-text-3)]" />}
                            value={installToken}
                            onChange={(event) => onInstallTokenChange?.(event.target.value)}
                            placeholder="从服务器 .env 中粘贴 VOZEB_PRO_INSTALL_TOKEN"
                            autoComplete="off"
                            disabled={submitting}
                            required
                        />
                        <span className="block text-xs leading-5 text-[var(--gm-text-3)]">令牌只保存在当前页面内存中，不会写入浏览器存储。</span>
                    </label>
                ) : null}

                <label className="block space-y-3">
                    <span className={educationLogin ? "sr-only" : "text-sm font-medium text-[var(--gm-text-2)]"}>{isRegister ? "用户名" : "用户名或邮箱"}</span>
                    <Input
                        size="large"
                        prefix={<UserRound className="size-4 text-[var(--gm-text-3)]" />}
                        value={username}
                        onChange={(event) => {
                            setUsername(event.target.value);
                            setMfaRequired(false);
                            setTotpCode("");
                        }}
                        placeholder={isRegister ? "设置登录用户名" : educationLogin ? "请输入用户名或邮箱" : "输入用户名或已绑定邮箱"}
                        autoComplete="username"
                        name="username"
                        disabled={submitting || disabled}
                        required
                    />
                    {isRegister ? <span className="block text-xs leading-5 text-[var(--gm-text-3)]">用于登录，注册后不可修改；创作昵称可随时调整。</span> : null}
                </label>

                {isRegister && emailRegistrationEnabled ? (
                    <div className="space-y-3">
                        <label className="block space-y-3">
                            <span className="text-sm font-medium text-[var(--gm-text-2)]">邮箱</span>
                            <Input
                                size="large"
                                prefix={<Mail className="size-4 text-[var(--gm-text-3)]" />}
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="csyqlz@gmail.com"
                                autoComplete="email"
                                type="email"
                                disabled={submitting || disabled}
                                required
                            />
                        </label>
                        <label className="block space-y-3">
                            <span className="text-sm font-medium text-[var(--gm-text-2)]">邮箱验证码</span>
                            <Input.Search
                                size="large"
                                value={emailCode}
                                onChange={(event) => setEmailCode(event.target.value)}
                                placeholder="6 位验证码"
                                enterButton={sendingCode ? "发送中" : "获取验证码"}
                                loading={sendingCode}
                                disabled={submitting || disabled}
                                onSearch={() => void sendEmailCode()}
                                required
                            />
                        </label>
                    </div>
                ) : null}

                {isRegister ? (
                    <label className="block space-y-3">
                        <span className="text-sm font-medium text-[var(--gm-text-2)]">创作昵称</span>
                        <Input size="large" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="显示在账号菜单，可留空" autoComplete="name" disabled={submitting || disabled} />
                    </label>
                ) : null}

                {isRegister && !firstUser ? (
                    <label className="block space-y-3">
                        <span className="text-sm font-medium text-[var(--gm-text-2)]">邀请码（选填）</span>
                        <Input
                            size="large"
                            prefix={<Gift className="size-4 text-[var(--gm-text-3)]" />}
                            value={referralCode}
                            onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
                            placeholder="通过邀请链接进入时会自动填写"
                            autoComplete="off"
                            maxLength={24}
                            disabled={submitting || disabled}
                        />
                    </label>
                ) : null}

                <label className="block space-y-3">
                    <span className={educationLogin ? "sr-only" : "text-sm font-medium text-[var(--gm-text-2)]"}>密码</span>
                    <Input.Password
                        size="large"
                        prefix={<LockKeyhole className="size-4 text-[var(--gm-text-3)]" />}
                        value={password}
                        onChange={(event) => {
                            setPassword(event.target.value);
                            setMfaRequired(false);
                            setTotpCode("");
                        }}
                        placeholder={isRegister ? "至少 8 位" : "请输入密码"}
                        autoComplete={isRegister ? "new-password" : "current-password"}
                        name="password"
                        disabled={submitting || disabled}
                        required
                    />
                </label>

                {!isRegister && mfaRequired ? (
                    <label className="block space-y-3">
                        <span className="text-sm font-medium text-[var(--gm-text-2)]">动态验证码</span>
                        <Input
                            size="large"
                            prefix={<ShieldCheck className="size-4 text-[var(--gm-text-3)]" />}
                            value={totpCode}
                            autoFocus
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            placeholder="输入身份验证器动态码"
                            disabled={submitting}
                            onChange={(event) => setTotpCode(event.target.value)}
                            required
                        />
                    </label>
                ) : null}

                <Button
                    className="auth-submit-button"
                    type="primary"
                    htmlType="submit"
                    size="large"
                    block
                    loading={submitting}
                    disabled={disabled || !installTokenReady || ((educationLogin || (isRegister && !firstUser)) && !policyAccepted)}
                    icon={educationLogin ? undefined : <ArrowRight className="size-4" />}
                    iconPlacement="end"
                >
                    {firstUser ? "创建管理员并进入后台" : isRegister ? "注册并开始创作" : mfaRequired ? "验证并登录" : educationLogin ? "登录" : "登录并继续"}
                </Button>

                {educationLogin || (isRegister && !firstUser) ? (
                    <Checkbox className={educationLogin ? "auth-education-policy" : undefined} checked={policyAccepted} disabled={submitting || disabled} onChange={(event) => setPolicyAccepted(event.target.checked)}>
                        <span className="text-sm leading-6 text-[var(--gm-text-2)]">
                            我已阅读并同意
                            <a className="mx-1 font-medium text-[var(--gm-text)] hover:underline" href={site.termsUrl || "/terms"} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                                服务条款
                            </a>
                            和
                            <a className="ml-1 font-medium text-[var(--gm-text)] hover:underline" href={site.privacyUrl || "/privacy"} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                                隐私政策
                            </a>
                        </span>
                    </Checkbox>
                ) : null}

                {isRegister ? (
                    <div className="auth-switch-link pt-2 text-center text-sm text-[var(--gm-text-2)]">
                        已有账号？{" "}
                        <Link href="/login" className="font-medium text-[var(--gm-text)] hover:underline">
                            直接登录
                        </Link>
                    </div>
                ) : null}
            </form>
        </section>
    );

    if (variant === "embedded") return form;

    if (educationLogin) {
        return (
            <main className="auth-education-shell">
                {/* 背景：压暗并半透明播放的宣传片，静态海报作为兜底 */}
                <div className="auth-education-media" aria-hidden="true">
                    <img src={loginPage.heroPosterUrl} alt="" />
                    {heroMotionEnabled ? (
                        <video className={heroVideoReady ? "is-ready" : ""} muted autoPlay loop playsInline poster={loginPage.heroPosterUrl} onCanPlay={() => setHeroVideoReady(true)} onError={() => setHeroVideoReady(false)}>
                            <source src={loginPage.heroVideoUrl} type="video/mp4" />
                        </video>
                    ) : null}
                    <div className="auth-education-scrim" />
                    <div className="auth-education-aurora" />
                </div>

                <LoginThemeToggle />

                <header className="auth-education-topbar">
                    <Link href="/" className="auth-education-wordmark">
                        <span className="auth-education-wordmark-text">
                            <span className="auth-education-wordmark-name">BLUEGAMMA</span>
                            {/* 联合品牌抠图后置于字标下方，随主题换色 */}
                            <span className="auth-education-partner-logos">
                                {/* 同一张原图服务明暗两套：暗色下由 CSS 提亮，不再维护专用变体 */}
                                <img className="auth-education-partner-cacg" src="/login/brand-cacg.png" alt="中国动漫集团" />
                                <span className="auth-education-partner-divider" aria-hidden="true" />
                                <img className="auth-education-partner-bluegamma" src="/login/brand-bluegamma.png" alt="蓝色伽马 BLUEGAMMA" />
                                <span className="auth-education-partner-divider" aria-hidden="true" />
                                <span className="auth-education-partner-desc">
                                    <span>广东AIGC培训产教融合基地</span>
                                    <span>以智能开创影像创作新生态</span>
                                </span>
                            </span>
                        </span>
                    </Link>
                </header>

                <div className="auth-education-stage">
                    <div className="auth-education-copy">
                        <p className="auth-education-eyebrow">AIGC 智能影像 · 教学与创作平台</p>
                        <h1 className="auth-education-slogan">无限生成，无限畅通</h1>
                        <p className="auth-education-slogan-sub">{loginPage.slogan}</p>
                        <p className="auth-education-platform">{loginPage.platformName}</p>
                        <div className="auth-education-rule" />
                        <ul className="auth-education-features">
                            <li>开源模型不限算力，练习不再限量</li>
                            <li>闭源模型对齐商单标准，接单交付更有把握</li>
                            <li>影像、短剧与画布，一套账号贯通</li>
                            <li>课程作业与练习项目，随时续做</li>
                            <li>IP 资产与提示词，沉淀团队知识</li>
                        </ul>
                    </div>
                    <div className="auth-education-card">
                        <div className="auth-education-content">{form}</div>
                    </div>
                </div>

                <footer className="auth-education-footer">
                    <p>{site.footerCopyright || "© 2026 VOZEB PRO. All rights reserved."}</p>
                    {loginPage.footerOrganization ? <p>运营单位：{loginPage.footerOrganization}</p> : null}
                    {loginPage.servicePhone || loginPage.serviceHours ? <p>{[loginPage.servicePhone ? `客服电话 ${loginPage.servicePhone}` : "", loginPage.serviceHours].filter(Boolean).join(" · ")}</p> : null}
                </footer>
            </main>
        );
    }

    return (
        <main className="auth-page-bg app-scroll-page flex items-center justify-center px-4 py-6 text-[var(--gm-text)] sm:px-6 sm:py-10">
            <div className="auth-page-card grid w-full max-w-5xl overflow-hidden border backdrop-blur md:grid-cols-[0.9fr_1fr]">
                <section className="auth-page-brand-panel flex min-h-[220px] flex-col justify-between gap-5 border-b p-5 text-[var(--gm-text)] sm:min-h-[360px] sm:gap-8 sm:p-8 md:border-b-0 md:border-r">
                    <div className="flex items-start justify-between gap-4">
                        <Link href="/" className="inline-flex items-center gap-4 text-base font-semibold">
                            <SiteLogo logoUrl={site.logoUrl} className="size-16 sm:size-20" />
                            <span className="text-3xl">{site.title}</span>
                        </Link>
                        <Link
                            href="/"
                            className="auth-back-home inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--gm-border)] bg-[color-mix(in_srgb,var(--gm-surface)_70%,transparent)] px-3 text-sm font-medium text-[var(--gm-text-2)] transition hover:border-[var(--gm-border-strong)] hover:text-[var(--gm-text)]"
                        >
                            <ArrowLeft className="size-4" />
                            <span>返回首页</span>
                        </Link>
                    </div>
                    <div className="auth-page-brand-copy">
                        <h1 className="text-balance text-2xl font-semibold tracking-normal sm:text-3xl">{firstUser ? "创建首个管理员" : isRegister ? "从一个入口开始视觉创作" : "回到你的视觉创作台"}</h1>
                    </div>
                    <div className="auth-page-feature-list grid gap-2 text-sm text-[var(--gm-text-2)]">
                        {["电商、短剧与美颜创作", "画布项目与提示词复用", "图片、视频与音频统一创作"].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                                <span className="auth-feature-dot size-1.5 rounded-full" />
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                    <p className="auth-page-brand-description max-w-sm text-sm leading-6 text-[var(--gm-text-2)]">登录后从首页场景入口继续创作，项目、提示词和常用风格都能随时接着使用。</p>
                </section>
                {form}
            </div>
        </main>
    );
}
