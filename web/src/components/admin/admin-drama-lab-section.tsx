"use client";

import { Button, Tag } from "antd";
import { ArrowRight, Clapperboard, FileText, Image, PlugZap, Video } from "lucide-react";
import Link from "next/link";

const capabilities = [
    { label: "剧本与审核", detail: "文本模型、剧本生成和结构化拆解", icon: FileText },
    { label: "角色与场景", detail: "图片模型、参考图和资产一致性", icon: Image },
    { label: "分镜与镜头", detail: "生图、生视频和异步任务状态", icon: Video },
] as const;

export function AdminDramaLabSection() {
    return (
        <div className="space-y-5">
            <section className="border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 p-5 dark:border-zinc-800">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                            <Clapperboard className="size-4" />
                            LocalMiniDrama 适配配置
                        </div>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">短剧实验室拥有独立后台入口，但继续复用 VOZEB PRO 的模型渠道、逻辑模型、提示词和生成任务，不重复保存 API Key。</p>
                    </div>
                    <Tag color="blue">独立分区</Tag>
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-3">
                    {capabilities.map(({ label, detail, icon: Icon }) => (
                        <div key={label} className="border border-zinc-200 p-4 dark:border-zinc-800">
                            <Icon className="size-5 text-zinc-700 dark:text-zinc-300" />
                            <h3 className="mt-3 text-sm font-semibold text-zinc-950 dark:text-zinc-100">{label}</h3>
                            <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{detail}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
                <Link href="/admin?section=channels" className="group border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600">
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                            <PlugZap className="size-4" />
                            模型渠道
                        </span>
                        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">配置本地模型、OpenAI 兼容渠道、RunningHub 以及图片和视频能力。</p>
                </Link>
                <Link href="/admin?section=prompts" className="group border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600">
                    <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                            <FileText className="size-4" />
                            提示词管理
                        </span>
                        <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">复用现有公共提示词，后续在此增加短剧节点模板和版本管理。</p>
                </Link>
            </section>

            <div className="flex justify-end">
                <Link href="/drama-lab">
                    <Button type="primary" icon={<Clapperboard className="size-4" />}>
                        打开短剧实验室
                    </Button>
                </Link>
            </div>
        </div>
    );
}
