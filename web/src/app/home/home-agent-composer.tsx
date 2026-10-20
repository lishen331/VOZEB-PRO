"use client";

import { useRef, useState } from "react";
import { ArrowUp, AtSign, ImagePlus, Sparkles, WandSparkles } from "lucide-react";

import { Button } from "@/components/gamma-ui/gamma-ant";
import { Tooltip } from "@/components/gamma-ui/gamma-ant-overlay";
import { creativeComposerToolButtonClass } from "@/components/creative-composer-styles";
import { GammaMajorTabs } from "@/components/gamma-ui/gamma-major-tabs";
import { gammaSubjectBySlug } from "@/components/gamma-ui/gamma-subjects";
import { cn } from "@/lib/utils";

/*
 * 首页创作输入框：视觉与交互对齐 /create 页面真正的 Agent 输入框（CreativeComposer）——
 * 白卡片、圆角、左侧参考图、文本域、底部工具条占位、右下角圆形发送箭头。
 * 这里不接 useCreateAgent 状态机（对话历史/任务轮询属于 /create 整页），
 * 提交时把文本带去 /create，由那边的真实 Agent 继续处理，和原逻辑一致，只换外观。
 * 专业胶囊（服装设计/室内设计…）仍在上方，点击只切换占位符与「帮我写」示例，
 * 不再提供产出形态/风格/比例这些 Agent 组件里不存在的次级标签。
 */
export function GammaHomeAgentComposer({ subjectSlug, onSubjectChange, onSubmit }: { subjectSlug: string; onSubjectChange: (slug: string) => void; onSubmit: (prompt: string) => void }) {
    const [value, setValue] = useState("");
    const [focused, setFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const subject = gammaSubjectBySlug(subjectSlug);
    const trimmed = value.trim();

    const submit = () => {
        if (!trimmed) {
            textareaRef.current?.focus();
            return;
        }
        onSubmit(trimmed);
        setValue("");
    };

    return (
        <div className="flex flex-col gap-3">
            <GammaMajorTabs value={subjectSlug} onChange={onSubjectChange} />
            <div className="mx-auto w-full max-w-[1080px]">
                <div
                    className={cn(
                        "creative-composer rounded-[22px] border border-[#e3e6eb] bg-white p-3 shadow-[0_10px_32px_rgba(32,36,42,0.06)] transition-shadow duration-200 sm:p-4 dark:border-[#2e3544] dark:bg-[#111724] dark:shadow-black/24",
                        focused && "!border-transparent !shadow-[0_0_0_4px_var(--gm-accent-soft),0_20px_50px_rgba(0,80,245,0.16)]",
                    )}
                >
                    <div className="flex min-h-[112px] items-start gap-2 sm:gap-3">
                        <button
                            type="button"
                            onClick={() => onSubmit("")}
                            aria-label="添加参考图（进入创作页上传）"
                            title="添加参考图"
                            className="mt-0.5 grid size-12 shrink-0 place-items-center rounded-xl border border-[#e6e9ee] bg-[#f4f7fc] text-[#8690a5] transition-colors hover:border-[#d3d9e7] hover:bg-[#eef1f6] hover:text-[#384153] sm:size-14 dark:border-[#323948] dark:bg-[#1f2634] dark:text-[#9fa5b2] dark:hover:border-[#475063] dark:hover:bg-[#2a3140] dark:hover:text-white"
                        >
                            <ImagePlus className="size-5" />
                        </button>
                        <label htmlFor="gm-home-agent-prompt" className="sr-only">
                            描述你想创作的{subject.name}内容
                        </label>
                        <textarea
                            ref={textareaRef}
                            id="gm-home-agent-prompt"
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    submit();
                                }
                            }}
                            rows={4}
                            placeholder={`描述你的${subject.name}作品，例如：${subject.example}`}
                            className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-[15px] leading-7 text-[#1b212f] outline-none placeholder:text-[#8993a9] sm:px-2 dark:text-[#f2f5fa] dark:placeholder:text-[#7e889d]"
                        />
                    </div>
                    <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden px-0.5 pb-0.5 pt-2">
                        <div className="hide-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:gap-2">
                            <Tooltip title="进入创作页选择 Agent 模式">
                                <Button type="text" className={cn(creativeComposerToolButtonClass(false))} icon={<Sparkles className="size-4" />} onClick={() => onSubmit("")}>
                                    Agent 模式
                                </Button>
                            </Tooltip>
                            <Tooltip title="进入创作页使用 Skill">
                                <Button type="text" className={cn(creativeComposerToolButtonClass(false), "hidden sm:inline-flex")} icon={<WandSparkles className="size-4" />} onClick={() => onSubmit("")}>
                                    使用 Skill
                                </Button>
                            </Tooltip>
                        </div>
                        <Tooltip title="引用素材（进入创作页）">
                            <Button
                                type="text"
                                className="!size-11 !min-w-11 !rounded-xl !text-[#667084] hover:!bg-[#f1f4f9] hover:!text-[#1b212f] dark:!text-[#a5abb8] dark:hover:!bg-[#272e3c] dark:hover:!text-white"
                                icon={<AtSign className="size-4" />}
                                onClick={() => onSubmit("")}
                                aria-label="引用素材"
                            />
                        </Tooltip>
                        <Tooltip title="发送">
                            <Button
                                type="primary"
                                shape="circle"
                                className="!size-11 !min-w-11 !border-0 !bg-[linear-gradient(135deg,#2b72ff,#0860ff)] !text-white !shadow-[0_6px_16px_rgba(89,104,255,0.22)] hover:!bg-[linear-gradient(135deg,#256bf3,#0458f1)] disabled:!bg-none disabled:!bg-[#e2e5ea] disabled:!text-[#aeb4c1] disabled:!shadow-none dark:disabled:!bg-[#2e3543] dark:disabled:!text-[#667085]"
                                icon={<ArrowUp className="size-4" />}
                                disabled={!trimmed}
                                onClick={submit}
                                aria-label="开始创作"
                            />
                        </Tooltip>
                    </div>
                </div>
            </div>
        </div>
    );
}
