"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, X } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import type { SchoolContext } from "@/lib/school-domain";
import { buildOnboardingSteps, hasSeenOnboarding, markOnboardingSeen, type OnboardingContext } from "@/lib/onboarding-guide";
import { cn } from "@/lib/utils";

/*
 * 首页首次使用引导。三屏、可随时跳过、关掉后不再弹。
 * 步骤内容由 buildOnboardingSteps 按当前可见功能模块生成，后台关掉模块后不会指向不存在的入口。
 *
 * 呈现上不用蒙层聚光灯：侧栏在窄屏是抽屉、深浅主题各一套坐标，聚光灯容易错位；
 * 这里用一张居中的品牌卡片，与 GammaModal 的视觉语言一致（顶部光晕、描边、玻璃质感）。
 */

export function WelcomeGuide({ featureModules, menuPermissions, schoolContext }: { featureModules?: FeatureModuleSettings; menuPermissions?: readonly UserNavigationMenuPermission[]; schoolContext?: SchoolContext | null }) {
    const reduce = useReducedMotion();
    const context = useMemo<OnboardingContext>(() => ({ featureModules, menuPermissions, schoolContext }), [featureModules, menuPermissions, schoolContext]);
    const steps = useMemo(() => buildOnboardingSteps(context), [context]);
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);

    // 首帧不判定，等挂载后再读 localStorage：服务端没有 window，SSR 必须保持一致
    useEffect(() => {
        if (!steps.length) return;
        if (hasSeenOnboarding(context)) return;
        setOpen(true);
    }, [context, steps.length]);

    const finish = useCallback(() => {
        markOnboardingSeen(context);
        setOpen(false);
    }, [context]);

    const next = useCallback(() => {
        setIndex((current) => {
            if (current >= steps.length - 1) {
                markOnboardingSeen(context);
                setOpen(false);
                return current;
            }
            return current + 1;
        });
    }, [context, steps.length]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") finish();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [finish, open]);

    if (!steps.length) return null;
    const step = steps[Math.min(index, steps.length - 1)];
    const isLast = index >= steps.length - 1;

    return (
        <AnimatePresence>
            {open ? (
                <motion.div
                    key="welcome-guide"
                    className="fixed inset-0 z-[115] grid place-items-center bg-[var(--gm-scrim)] p-4 backdrop-blur-sm sm:p-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.2 }}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="welcome-guide-title"
                        initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.98 }}
                        transition={{ duration: reduce ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] }}
                        className="relative w-full max-w-lg overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] shadow-[var(--gm-shadow)] ring-1 ring-[var(--gm-border-strong)]"
                    >
                        {/* 顶部品牌光晕，与 GammaModal 同一套语言 */}
                        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-48 w-80 -translate-x-1/2 rounded-full bg-[var(--gm-blue)] opacity-20 blur-3xl" />

                        <button
                            type="button"
                            aria-label="跳过引导"
                            onClick={finish}
                            className="absolute top-4 right-4 z-10 grid size-8 place-items-center rounded-full text-[var(--gm-text-3)] transition-colors hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)] focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:outline-none"
                        >
                            <X className="size-4" aria-hidden />
                        </button>

                        <div className="relative px-6 pt-7 pb-6 sm:px-8">
                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div key={step.id} initial={{ opacity: 0, x: reduce ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduce ? 0 : -12 }} transition={{ duration: reduce ? 0 : 0.2 }}>
                                    <p className="text-xs font-medium tracking-wide text-[var(--gm-accent)]">
                                        {index + 1} / {steps.length}
                                    </p>
                                    <h2 id="welcome-guide-title" className="mt-2 text-xl font-semibold text-[var(--gm-text)]">
                                        {step.title}
                                    </h2>
                                    <p className="mt-1.5 text-sm leading-6 text-[var(--gm-text-2)]">{step.description}</p>

                                    <ul className="mt-5 flex flex-col gap-3">
                                        {step.bullets.map((bullet) => (
                                            <li key={bullet.label} className="flex gap-3 rounded-[var(--gm-radius)] bg-[var(--gm-wash)] px-3.5 py-3 ring-1 ring-[var(--gm-border)]">
                                                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--gm-accent)]" />
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-[var(--gm-text)]">{bullet.label}</div>
                                                    <p className="mt-0.5 text-[13px] leading-5 text-[var(--gm-text-3)]">{bullet.detail}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        <div className="relative flex items-center justify-between gap-3 border-t border-[var(--gm-border)] bg-[var(--gm-surface-2)] px-6 py-4 sm:px-8">
                            <div className="flex items-center gap-1.5" role="group" aria-label="引导进度">
                                {steps.map((item, itemIndex) => (
                                    <span key={item.id} aria-hidden className={cn("h-1.5 rounded-full transition-all duration-300", itemIndex === index ? "w-5 bg-[var(--gm-accent)]" : "w-1.5 bg-[var(--gm-border-strong)]")} />
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <GammaButton variant="ghost" size="sm" onClick={finish}>
                                    跳过
                                </GammaButton>
                                <GammaButton variant="primary" size="sm" onClick={next} trailingIcon={isLast ? undefined : <ArrowRight className="size-3.5" />}>
                                    {isLast ? "开始使用" : "下一步"}
                                </GammaButton>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
