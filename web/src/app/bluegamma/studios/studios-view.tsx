"use client";

import Link from "next/link";
import { ChevronLeft, Users } from "lucide-react";

import { GammaAvatarGroup } from "@/components/gamma-ui/gamma-data";
import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { STUDIO_GROUPS } from "@/app/bluegamma/studios/studios-data";

/** 工作室：班级/小组协作空间，用户逛着挑，网格比首页宽松但不像素材库那么大（gap-6） */
export function StudiosView() {
    return (
        <GammaThemeProvider>
            <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]">
                <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8">
                    <Link href="/bluegamma/home" className="gm-glass mb-8 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-[var(--gm-text-2)] transition-colors hover:text-[var(--gm-text)]">
                        <ChevronLeft className="size-4" />
                        返回首页
                    </Link>

                    <header className="mb-10">
                        <h1 className="text-[28px] font-semibold tracking-tight">工作室</h1>
                        <p className="mt-2 text-sm text-[var(--gm-text-3)]">和同学一起协作创作，共享素材与作品进度</p>
                    </header>

                    <div className="grid gap-6 sm:grid-cols-2">
                        {STUDIO_GROUPS.map((group) => (
                            <article key={group.id} className="group relative overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)] transition-shadow hover:shadow-[var(--gm-shadow)]">
                                <div className="relative aspect-[16/9] overflow-hidden">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                                    <img src={group.cover} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
                                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                                </div>
                                <div className="flex flex-col gap-3 p-5">
                                    <div>
                                        <h3 className="text-base font-semibold text-[var(--gm-text)]">{group.name}</h3>
                                        <p className="mt-1 text-xs text-[var(--gm-text-3)]">{group.school}</p>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <GammaAvatarGroup people={group.members} size={26} />
                                        <span className="inline-flex items-center gap-1 text-xs text-[var(--gm-text-3)]">
                                            <Users className="size-3.5" />
                                            {group.members.length} 人 · {group.works} 件作品
                                        </span>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </main>
        </GammaThemeProvider>
    );
}
