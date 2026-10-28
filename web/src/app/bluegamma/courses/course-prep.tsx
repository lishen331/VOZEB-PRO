"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, ClipboardCheck, Download, FileText, Film, ListChecks, MessageSquareText, Paperclip, Pencil, Plus, Presentation, Send, Trash2 } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge, GammaInput } from "@/components/gamma-ui/gamma-controls";
import { GammaModal } from "@/components/gamma-ui/gamma-overlays";
import { GM_EASE } from "@/components/gamma-ui/gamma-motion";
import type { Course, Lesson } from "@/app/bluegamma/courses/course-data";
import { CourseSlide } from "@/app/bluegamma/courses/course-slide";
import { TEACH_CLASSES } from "@/app/bluegamma/courses/teach-data";
import { addAssignment, addLessonMaterial, downloadMaterial, materialsKey, removeLessonMaterial, renameLessonMaterial, useTeachingStore, type LessonMaterial } from "@/app/bluegamma/courses/teaching-store";
import type { TeachingAssignmentItem } from "@/app/bluegamma/courses/teaching-workflow-data";
import { cn } from "@/lib/utils";

type PanelTab = "plan" | "notes" | "task" | "files" | "tasks";
const PANEL_TABS: readonly { key: PanelTab; label: string; icon: typeof FileText }[] = [
    { key: "plan", label: "教案", icon: FileText },
    { key: "notes", label: "讲解备注", icon: MessageSquareText },
    { key: "task", label: "任务单", icon: ListChecks },
    { key: "files", label: "资源", icon: Paperclip },
    { key: "tasks", label: "作业", icon: ClipboardCheck },
];

/** 左侧课程大纲：每节课一行，已备的打勾，当前高亮 */
export function CourseOutline({ course, lessonKey, prepared, onPick }: { course: Course; lessonKey: string; prepared: readonly string[]; onPick: (key: string) => void }) {
    const reduce = useReducedMotion();
    return (
        <nav aria-label="课程大纲" className="flex flex-col gap-1">
            {course.lessons.map((lesson) => {
                const active = lesson.key === lessonKey;
                const done = prepared.includes(lesson.key);
                return (
                    <button
                        key={lesson.key}
                        type="button"
                        onClick={() => onPick(lesson.key)}
                        aria-current={active ? "true" : undefined}
                        className={cn("relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors", active ? "text-[var(--gm-text)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash)]")}
                    >
                        {active ? (
                            <motion.span
                                layoutId="course-outline-active"
                                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                                className="absolute inset-0 rounded-[12px] bg-[var(--gm-accent-soft)] ring-1 ring-[var(--gm-accent-ring)]"
                            />
                        ) : null}
                        <span
                            className={cn(
                                "relative grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px]",
                                done ? "bg-[var(--gm-success)] text-white" : active ? "bg-[var(--gm-blue)] text-white" : "bg-[var(--gm-wash-strong)] text-[var(--gm-text-3)]",
                            )}
                        >
                            {done ? <Check className="size-3" /> : lesson.index + 1}
                        </span>
                        <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
                            <span className="truncate text-[13px] font-medium">{lesson.title}</span>
                            <span className="truncate text-[11px] text-[var(--gm-text-3)]">
                                {lesson.slides.length} 页课件 · 视频 {lesson.videoMinutes} 分钟
                            </span>
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}

/** 中间：课件预览（大图 + 缩略图条），左右键翻页 */
export function SlideViewer({ course, lesson, page, onPage, onPresent }: { course: Course; lesson: Lesson; page: number; onPage: (page: number) => void; onPresent: () => void }) {
    const reduce = useReducedMotion();
    const total = lesson.slides.length;
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if ((event.target as HTMLElement).closest("input,textarea")) return;
            if (event.key === "ArrowRight") onPage(Math.min(total - 1, page + 1));
            if (event.key === "ArrowLeft") onPage(Math.max(0, page - 1));
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [onPage, page, total]);

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="group relative overflow-hidden rounded-[var(--gm-radius-xl)] shadow-[var(--gm-shadow)] ring-1 ring-[var(--gm-border-strong)]">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={`${lesson.key}-${page}`} initial={reduce ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -16 }} transition={{ duration: 0.25, ease: GM_EASE }}>
                        <CourseSlide course={course} lesson={lesson} slide={lesson.slides[page]} page={page + 1} />
                    </motion.div>
                </AnimatePresence>
                {[
                    { side: "left-3", icon: ChevronLeft, label: "上一页", to: page - 1 },
                    { side: "right-3", icon: ChevronRight, label: "下一页", to: page + 1 },
                ].map((item) =>
                    item.to >= 0 && item.to < total ? (
                        <button
                            key={item.label}
                            type="button"
                            aria-label={item.label}
                            onClick={() => onPage(item.to)}
                            className={cn("gm-glass absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-[var(--gm-text)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100", item.side)}
                        >
                            <item.icon className="size-5" />
                        </button>
                    ) : null,
                )}
                <button
                    type="button"
                    onClick={onPresent}
                    className="gm-glass absolute top-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                    <Presentation className="size-3.5" />
                    放映
                </button>
            </div>
            <ol className="gm-scroll flex gap-2 overflow-x-auto pb-1" aria-label="课件页">
                {lesson.slides.map((slide, index) => (
                    <li key={`${lesson.key}-${slide.kind}`} className="w-[132px] shrink-0">
                        <button
                            type="button"
                            onClick={() => onPage(index)}
                            aria-label={`第 ${index + 1} 页：${slide.title}`}
                            aria-current={index === page ? "true" : undefined}
                            className={cn("block w-full overflow-hidden rounded-[10px] ring-2 transition-[box-shadow,opacity]", index === page ? "ring-[var(--gm-accent)]" : "opacity-70 ring-transparent hover:opacity-100")}
                        >
                            <CourseSlide course={course} lesson={lesson} slide={slide} page={index + 1} />
                        </button>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-[var(--gm-text-3)]">{title}</h4>
            {children}
        </section>
    );
}

function PlanPanel({ lesson }: { lesson: Lesson }) {
    const total = lesson.phases.reduce((sum, phase) => sum + phase.minutes, 0);
    return (
        <div className="flex flex-col gap-5">
            <Block title="教学目标">
                <ol className="flex flex-col gap-1.5 text-[13px] leading-relaxed">
                    {lesson.objectives.map((item, index) => (
                        <li key={item} className="flex gap-2">
                            <span className="font-mono text-[var(--gm-accent)]">{index + 1}.</span>
                            {item}
                        </li>
                    ))}
                </ol>
            </Block>
            <Block title="重点 / 难点">
                <p className="rounded-[10px] bg-[var(--gm-wash)] px-3 py-2 text-[13px] leading-relaxed">
                    <span className="mr-1.5 rounded bg-[var(--gm-accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--gm-accent)]">重点</span>
                    {lesson.keyPoints[0]}
                </p>
                <p className="rounded-[10px] bg-[var(--gm-wash)] px-3 py-2 text-[13px] leading-relaxed">
                    <span className="mr-1.5 rounded bg-[color-mix(in_srgb,var(--gm-warning)_10%,transparent)] px-1.5 py-0.5 text-[11px] text-[var(--gm-warning)]">难点</span>
                    {lesson.difficulty}
                </p>
            </Block>
            <Block title={`教学过程 · ${total} 分钟`}>
                {/* 时间轴：每段宽度按分钟数分配 */}
                <div className="flex h-2 overflow-hidden rounded-full">
                    {lesson.phases.map((phase, index) => (
                        <span key={phase.name} className="h-full" style={{ width: `${(phase.minutes / total) * 100}%`, background: `color-mix(in srgb, var(--gm-blue) ${100 - index * 16}%, var(--gm-cyan))` }} />
                    ))}
                </div>
                <ol className="mt-1 flex flex-col">
                    {lesson.phases.map((phase) => (
                        <li key={phase.name} className="flex gap-3 border-b border-[var(--gm-border)] py-2.5 last:border-0">
                            <span className="w-12 shrink-0 text-[13px] font-medium">{phase.name}</span>
                            <span className="flex-1 text-[13px] leading-relaxed text-[var(--gm-text-2)]">{phase.content}</span>
                            <span className="shrink-0 font-mono text-xs text-[var(--gm-text-3)]">{phase.minutes}′</span>
                        </li>
                    ))}
                </ol>
            </Block>
        </div>
    );
}

function NotesPanel({ lesson, page, onPage }: { lesson: Lesson; page: number; onPage: (page: number) => void }) {
    return (
        <ol className="flex flex-col gap-2">
            {lesson.slides.map((slide, index) => (
                <li key={slide.kind}>
                    <button
                        type="button"
                        onClick={() => onPage(index)}
                        className={cn("flex w-full gap-3 rounded-[12px] p-3 text-left ring-1 transition-colors", index === page ? "bg-[var(--gm-accent-soft)] ring-[var(--gm-accent-ring)]" : "ring-[var(--gm-border)] hover:bg-[var(--gm-wash)]")}
                    >
                        <span className="font-mono text-xs text-[var(--gm-text-3)]">P{index + 1}</span>
                        <span className="flex flex-col gap-0.5">
                            <span className="text-[13px] font-medium">{slide.title}</span>
                            <span className="text-xs leading-relaxed text-[var(--gm-text-2)]">{slide.note}</span>
                        </span>
                    </button>
                </li>
            ))}
        </ol>
    );
}

function TaskPanel({ lesson }: { lesson: Lesson }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-[14px] bg-[var(--gm-wash)] p-4 ring-1 ring-[var(--gm-border)]">
                <p className="text-xs text-[var(--gm-text-3)]">学生任务单 · 第 {lesson.index + 1} 课</p>
                <ul className="mt-2 flex flex-col gap-2 text-[13px] leading-relaxed">
                    {lesson.task.map((item) => (
                        <li key={item} className="flex gap-2">
                            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--gm-accent)]" />
                            {item}
                        </li>
                    ))}
                </ul>
            </div>
            <Block title="评分建议">
                {[
                    ["切题", 30],
                    ["完成度", 30],
                    ["设计说明", 20],
                    ["过程记录", 20],
                ].map(([name, score]) => (
                    <div key={name} className="flex items-center gap-3 text-[13px]">
                        <span className="w-16">{name}</span>
                        <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--gm-wash-strong)]">
                            <span className="absolute inset-y-0 left-0 rounded-full bg-[image:var(--gm-gradient)]" style={{ width: `${score}%` }} />
                        </span>
                        <span className="w-8 text-right font-mono text-xs text-[var(--gm-text-3)]">{score}</span>
                    </div>
                ))}
            </Block>
        </div>
    );
}

const EMPTY_MATERIALS: LessonMaterial[] = [];

/** 平台自带资料：每节课四件套，只读但可下载 —— 真实项目里平台资料同样不允许老师删改 */
function platformMaterials(lesson: Lesson): LessonMaterial[] {
    return [
        { id: "platform-slides", name: `${lesson.title} · 课件`, meta: `${lesson.slides.length} 页 · PPTX`, scope: "platform", removable: false },
        { id: "platform-video", name: `${lesson.title} · 示范视频`, meta: `${lesson.videoMinutes} 分钟 · MP4`, scope: "platform", removable: false },
        { id: "platform-plan", name: `${lesson.title} · 教案`, meta: "DOCX", scope: "platform", removable: false },
        { id: "platform-task", name: `${lesson.title} · 任务单`, meta: "PDF", scope: "platform", removable: false },
    ];
}

const ROW_ICON_BTN = "grid size-8 shrink-0 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]";

/** 资料图标：按 meta 里的扩展名挑，避免为演示资料额外扩字段 */
function MaterialIcon({ meta }: { meta: string }) {
    const Icon = /MP4|MOV|AVI/.test(meta) ? Film : /PPTX|PPT/.test(meta) ? Presentation : /DOCX|DOC|PDF|TXT/.test(meta) ? FileText : ListChecks;
    return <Icon className="size-4" />;
}

/** 资源标签：平台资料只读可下载，本校资料可上传 / 改名 / 删除 */
function FilesPanel({ course, lesson }: { course: Course; lesson: Lesson }) {
    const state = useTeachingStore();
    const school = state.materials[materialsKey(course.slug, lesson.key)] ?? EMPTY_MATERIALS;
    const all = [...school, ...platformMaterials(lesson)];
    const [renaming, setRenaming] = useState<LessonMaterial | null>(null);
    const [draftName, setDraftName] = useState("");

    const upload = (file: File) => {
        const ext = (file.name.split(".").pop() ?? "").toUpperCase();
        addLessonMaterial(course.slug, lesson.key, {
            id: `m-${Date.now()}`,
            name: file.name.replace(/\.[^.]+$/, ""),
            meta: `${ext || "文件"} · ${(file.size / 1024 / 1024).toFixed(1)} MB`,
            scope: "school",
            removable: true,
        });
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-[var(--gm-text-3)]">课时资料 · {all.length}</p>
                <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-[var(--gm-accent-soft)] px-2.5 text-xs font-medium text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)] hover:brightness-110">
                    <Plus className="size-3.5" />
                    添加资料
                    <input
                        type="file"
                        className="sr-only"
                        aria-label="添加本校资料"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) upload(file);
                        }}
                    />
                </label>
            </div>
            <ul className="flex flex-col gap-2">
                {all.map((material) => (
                    <li key={material.id} className="flex items-center gap-2 rounded-[12px] p-2.5 ring-1 ring-[var(--gm-border)]">
                        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]">
                            <MaterialIcon meta={material.meta} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                            <span className="truncate text-[13px]">{material.name}</span>
                            <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--gm-text-3)]">
                                <GammaBadge tone={material.scope === "school" ? "cyan" : "neutral"}>{material.scope === "school" ? "本校" : "平台"}</GammaBadge>
                                {material.meta}
                            </span>
                        </span>
                        <button type="button" aria-label={`下载 ${material.name}`} onClick={() => downloadMaterial(material, course.title, lesson.title)} className={ROW_ICON_BTN}>
                            <Download className="size-3.5" />
                        </button>
                        {material.removable ? (
                            <>
                                <button
                                    type="button"
                                    aria-label={`重命名 ${material.name}`}
                                    onClick={() => {
                                        setRenaming(material);
                                        setDraftName(material.name);
                                    }}
                                    className={ROW_ICON_BTN}
                                >
                                    <Pencil className="size-3.5" />
                                </button>
                                <button type="button" aria-label={`删除 ${material.name}`} onClick={() => removeLessonMaterial(course.slug, lesson.key, material.id)} className={cn(ROW_ICON_BTN, "hover:text-[var(--gm-danger)]")}>
                                    <Trash2 className="size-3.5" />
                                </button>
                            </>
                        ) : null}
                    </li>
                ))}
            </ul>
            <p className="text-[11px] text-[var(--gm-text-3)]">本校补充资料对所有使用此课程的班级可见；平台资料只读，可下载。</p>

            <GammaModal
                open={Boolean(renaming)}
                title="重命名资料"
                onClose={() => setRenaming(null)}
                footer={
                    <>
                        <GammaButton variant="ghost" onClick={() => setRenaming(null)}>
                            取消
                        </GammaButton>
                        <GammaButton
                            disabled={!draftName.trim()}
                            onClick={() => {
                                if (renaming && draftName.trim()) renameLessonMaterial(course.slug, lesson.key, renaming.id, draftName.trim());
                                setRenaming(null);
                            }}
                        >
                            保存
                        </GammaButton>
                    </>
                }
            >
                <GammaInput label="资料名称" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
            </GammaModal>
        </div>
    );
}

/** 作业标签：本课时作业 + 布置入口；新建后立刻出现在「作业」标签里（走共享 store） */
function TasksPanel({ course, lesson, assignments, onOpenAssignments }: { course: Course; lesson: Lesson; assignments: readonly TeachingAssignmentItem[]; onOpenAssignments: () => void }) {
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState("");
    const [instructions, setInstructions] = useState("");
    const [className, setClassName] = useState(TEACH_CLASSES[0]?.name ?? "");
    const [dueDate, setDueDate] = useState("");

    const open = () => {
        setTitle(`第 ${lesson.index + 1} 课随堂练习：${lesson.title}`);
        setInstructions(lesson.task[1] ?? "");
        setClassName(TEACH_CLASSES[0]?.name ?? "");
        setDueDate("");
        setCreating(true);
    };

    const create = () => {
        if (!title.trim()) return;
        const group = TEACH_CLASSES.find((item) => item.name === className);
        addAssignment({
            id: `a-${Date.now()}`,
            title: title.trim(),
            instructions: instructions.trim() || "按课件要求完成并提交成果。",
            kind: "lesson",
            status: "draft",
            courseTitle: course.title,
            className,
            submittedCount: 0,
            totalStudents: group?.students.length ?? 0,
            courseSlug: course.slug,
            lessonKey: lesson.key,
            dueDate: dueDate || undefined,
        });
        setCreating(false);
    };

    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
                <h4 className="text-xs font-medium text-[var(--gm-text-3)]">本课时作业 · {assignments.length}</h4>
                {assignments.length ? (
                    <ul className="flex flex-col gap-2">
                        {assignments.map((item) => (
                            <li key={item.id} className="rounded-[12px] p-3 ring-1 ring-[var(--gm-border)]">
                                <div className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.title}</span>
                                    <GammaBadge tone={item.status === "draft" ? "warning" : item.status === "published" ? "blue" : "neutral"}>{item.status === "draft" ? "草稿" : item.status === "published" ? "进行中" : "已关闭"}</GammaBadge>
                                </div>
                                <p className="mt-1 truncate text-[11px] text-[var(--gm-text-3)]">
                                    {item.className} · 已交 {item.submittedCount}/{item.totalStudents}
                                    {item.dueDate ? ` · 截止 ${item.dueDate}` : ""}
                                </p>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="rounded-[12px] border border-dashed border-[var(--gm-border-strong)] px-3 py-6 text-center text-xs text-[var(--gm-text-3)]">这节课还没有布置作业</p>
                )}
            </section>
            <div className="flex flex-wrap gap-2">
                <GammaButton size="sm" icon={<Plus className="size-4" />} onClick={open}>
                    布置作业
                </GammaButton>
                <GammaButton size="sm" variant="ghost" trailingIcon={<ArrowRight className="size-3.5" />} onClick={onOpenAssignments}>
                    去作业管理
                </GammaButton>
            </div>

            <GammaModal
                open={creating}
                title="布置作业"
                description={`${course.title} · 第 ${lesson.index + 1} 课 ${lesson.title}`}
                onClose={() => setCreating(false)}
                footer={
                    <>
                        <GammaButton variant="ghost" onClick={() => setCreating(false)}>
                            取消
                        </GammaButton>
                        <GammaButton disabled={!title.trim()} icon={<Send className="size-3.5" />} onClick={create}>
                            保存为草稿
                        </GammaButton>
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    <GammaInput label="作业标题" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第 3 课随堂练习" />
                    <label className="flex flex-col gap-1.5 text-sm text-[var(--gm-text-2)]">
                        班级
                        <select value={className} onChange={(event) => setClassName(event.target.value)} className="h-9 rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] px-3 text-sm text-[var(--gm-text)] ring-1 ring-[var(--gm-border)]">
                            {TEACH_CLASSES.map((item) => (
                                <option key={item.id} value={item.name}>
                                    {item.name}（{item.students.length} 人）
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm text-[var(--gm-text-2)]">
                        截止日期
                        <GammaInput type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm text-[var(--gm-text-2)]">
                        作业说明
                        <textarea
                            value={instructions}
                            onChange={(event) => setInstructions(event.target.value)}
                            rows={3}
                            className="rounded-[var(--gm-radius)] bg-[var(--gm-surface-2)] p-3 text-sm text-[var(--gm-text)] ring-1 ring-[var(--gm-border)] outline-none focus:ring-[var(--gm-accent)]"
                        />
                    </label>
                </div>
            </GammaModal>
        </div>
    );
}

/** 右侧：教案 / 讲解备注 / 任务单 / 资源 / 作业 */
export function PrepPanel({ course, lesson, page, onPage, onOpenAssignments }: { course: Course; lesson: Lesson; page: number; onPage: (page: number) => void; onOpenAssignments: () => void }) {
    const [tab, setTab] = useState<PanelTab>("plan");
    const reduce = useReducedMotion();
    const state = useTeachingStore();
    const lessonAssignments = state.assignments.filter((item) => item.courseSlug === course.slug && item.lessonKey === lesson.key);
    const schoolMaterialCount = (state.materials[materialsKey(course.slug, lesson.key)] ?? []).length;
    return (
        <div className="flex min-h-0 flex-col">
            <div role="tablist" aria-label="备课资料" className="flex shrink-0 gap-1 border-b border-[var(--gm-border)] px-4">
                {PANEL_TABS.map((item) => {
                    const count = item.key === "tasks" ? lessonAssignments.length : item.key === "files" ? schoolMaterialCount : 0;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            role="tab"
                            aria-selected={tab === item.key}
                            onClick={() => setTab(item.key)}
                            className={cn("relative inline-flex h-11 items-center gap-1.5 px-2.5 text-[13px] transition-colors", tab === item.key ? "text-[var(--gm-text)]" : "text-[var(--gm-text-3)] hover:text-[var(--gm-text-2)]")}
                        >
                            <item.icon className="size-3.5" />
                            {item.label}
                            {count ? <span className="text-[11px] tabular-nums opacity-60">{count}</span> : null}
                            {tab === item.key ? (
                                <motion.span layoutId="prep-tab-line" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 38 }} className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-[image:var(--gm-gradient)]" />
                            ) : null}
                        </button>
                    );
                })}
            </div>
            <div className="gm-scroll min-h-0 flex-1 overflow-y-auto p-4">
                {tab === "plan" ? (
                    <PlanPanel lesson={lesson} />
                ) : tab === "notes" ? (
                    <NotesPanel lesson={lesson} page={page} onPage={onPage} />
                ) : tab === "task" ? (
                    <TaskPanel lesson={lesson} />
                ) : tab === "files" ? (
                    <FilesPanel course={course} lesson={lesson} />
                ) : (
                    <TasksPanel course={course} lesson={lesson} assignments={lessonAssignments} onOpenAssignments={onOpenAssignments} />
                )}
            </div>
        </div>
    );
}
