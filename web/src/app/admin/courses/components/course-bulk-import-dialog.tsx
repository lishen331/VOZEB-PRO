"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, XCircle } from "lucide-react";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Modal } from "@/components/gamma-ui/gamma-ant-modal";
import { Upload } from "@/components/gamma-ui/gamma-ant-upload";
import { Button, Tag } from "@/components/gamma-ui/gamma-ant";
import { cleanBulkImportCell, courseBulkImportTemplateRows, planCourseBulkImport, type BulkImportPlan } from "@/lib/course-bulk-import";
import type { PlatformCourseDetail } from "@/lib/school-domain";
import { coursesApi } from "@/services/api/courses";

/*
 * 课件批量导入，两步：
 *   1. 一次选多个文件，逐个上传（走原有的单文件上传接口）；
 *   2. 下载预填好的映射表（章节名 / 课时名 / 文件名 / 资料标题），填好后传回来，预览无误再导入。
 * 章节 / 课时不存在会按名称新建。关闭时没挂到课时的已上传文件会被删除，不留孤儿文件。
 */

type UploadedFile = { fileName: string; storageKey: string; status: "uploading" | "done" | "error"; error?: string };
type Stage = "files" | "importing" | "finished";

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** 按计划逐行建章节 / 课时 / 资料；遇到第一处失败就停，返回已成功的行数和失败原因 */
async function importPlan(tree: PlatformCourseDetail, plan: BulkImportPlan, onRow: (done: number, storageKey: string) => void) {
    const chapterIds = new Map<string, string>();
    const lessonIds = new Map<string, string>();
    const lessonCounts = new Map<string, number>();
    const materialCounts = new Map<string, number>();
    for (const chapter of tree.chapters) {
        lessonCounts.set(chapter.id, chapter.lessons.length);
        for (const lesson of chapter.lessons) materialCounts.set(lesson.id, lesson.materials.length);
    }
    let chapterCount = tree.chapters.length;
    let done = 0;
    for (const row of plan.rows) {
        try {
            let chapterId = row.chapterId || chapterIds.get(row.chapterTitle) || "";
            if (!chapterId) {
                chapterId = (await coursesApi.createPlatformCourseChapter(tree.id, { title: row.chapterTitle, description: "", sortOrder: chapterCount++ })).id;
                chapterIds.set(row.chapterTitle, chapterId);
            }
            const lessonKey = `${chapterId}\u0000${cleanBulkImportCell(row.lessonTitle)}`;
            let lessonId = row.lessonId || lessonIds.get(lessonKey) || "";
            if (!lessonId) {
                const sortOrder = lessonCounts.get(chapterId) ?? 0;
                lessonId = (await coursesApi.createPlatformCourseLesson(chapterId, { title: row.lessonTitle, description: "", sortOrder })).id;
                lessonCounts.set(chapterId, sortOrder + 1);
                lessonIds.set(lessonKey, lessonId);
            }
            const sortOrder = materialCounts.get(lessonId) ?? 0;
            await coursesApi.createPlatformCourseMaterial(tree.id, { lessonId, title: row.title, storageKey: row.storageKey, sortOrder });
            materialCounts.set(lessonId, sortOrder + 1);
            done += 1;
            onRow(done, row.storageKey);
        } catch (error) {
            return { done, failed: `第 ${row.line} 行「${row.fileName}」导入失败：${errorText(error, "未知错误")}` };
        }
    }
    return { done, failed: "" };
}

export function CourseBulkImportDialog({ tree, open, accept, onClose, onImported }: { tree: PlatformCourseDetail | null; open: boolean; accept: string; onClose: () => void; onImported: () => Promise<void> | void }) {
    const { message } = App.useApp();
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [plan, setPlan] = useState<BulkImportPlan | null>(null);
    const [stage, setStage] = useState<Stage>("files");
    const [result, setResult] = useState({ done: 0, failed: "" });
    const bound = useRef(new Set<string>());
    const uploading = files.some((file) => file.status === "uploading");
    const ready = files.filter((file) => file.status === "done");

    const close = () => {
        if (uploading || stage === "importing") return;
        const orphans = files.filter((file) => file.status === "done" && !bound.current.has(file.storageKey)).map((file) => file.storageKey);
        if (orphans.length) void coursesApi.deletePlatformCourseAttachments(orphans).catch(() => undefined);
        setFiles([]);
        setPlan(null);
        setStage("files");
        setResult({ done: 0, failed: "" });
        bound.current = new Set();
        onClose();
    };

    const addFile = async (file: File) => {
        // 映射表按去掉多余空白后的名字匹配，这里也按同一规则判重
        if (files.some((item) => cleanBulkImportCell(item.fileName) === cleanBulkImportCell(file.name))) {
            message.warning(`「${file.name}」已在列表里，同名文件只能传一份`);
            return false;
        }
        // 文件列表变了，之前读的映射表作废，要重新上传
        setPlan(null);
        setFiles((current) => [...current, { fileName: file.name, storageKey: "", status: "uploading" }]);
        const patch = (value: Partial<UploadedFile>) => setFiles((current) => current.map((item) => (item.fileName === file.name ? { ...item, ...value } : item)));
        try {
            patch({ storageKey: (await coursesApi.uploadPlatformCourseAttachment(file)).storageKey, status: "done" });
        } catch (error) {
            patch({ status: "error", error: errorText(error, "上传失败") });
        }
        return false;
    };

    const downloadTemplate = async () => {
        if (!tree) return;
        try {
            const { buildCourseBulkImportXlsx } = await import("@/lib/course-bulk-import-xlsx");
            const bytes = await buildCourseBulkImportXlsx(courseBulkImportTemplateRows(tree, ready));
            const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
            Object.assign(document.createElement("a"), { href: url, download: `${tree.title}-课件映射.xlsx` }).click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            message.error(errorText(error, "映射表生成失败"));
        }
    };

    const readMapping = async (file: File) => {
        if (!tree) return false;
        try {
            const { readCourseBulkImportXlsx } = await import("@/lib/course-bulk-import-xlsx");
            setPlan(planCourseBulkImport(await readCourseBulkImportXlsx(await file.arrayBuffer()), tree, ready));
        } catch {
            message.error("映射表读取失败，请上传 .xlsx 格式（用「下载映射表」生成）");
        }
        return false;
    };

    const runImport = async () => {
        if (!tree || !plan || plan.errors.length || !plan.rows.length) return;
        setStage("importing");
        const outcome = await importPlan(tree, plan, (done, storageKey) => {
            bound.current.add(storageKey);
            setResult({ done, failed: "" });
        });
        setResult(outcome);
        setStage("finished");
        await onImported();
    };

    const blocked = !plan || Boolean(plan.errors.length) || !plan.rows.length;
    return (
        <Modal
            title={tree ? `批量导入课件 · ${tree.title}` : "批量导入课件"}
            open={open}
            width="min(720px, calc(100vw - 24px))"
            centered
            destroyOnHidden
            maskClosable={false}
            onCancel={close}
            footer={
                stage === "finished" ? (
                    <Button type="primary" onClick={close}>
                        完成
                    </Button>
                ) : (
                    <div className="flex justify-end gap-2">
                        <Button onClick={close} disabled={uploading || stage === "importing"}>
                            取消
                        </Button>
                        <Button type="primary" loading={stage === "importing"} disabled={blocked || uploading} onClick={() => void runImport()}>
                            {plan?.rows.length ? `导入 ${plan.rows.length} 份资料` : "导入"}
                        </Button>
                    </div>
                )
            }
        >
            {stage === "files" ? (
                <BulkImportSteps files={files} plan={plan} accept={accept} uploading={uploading} readyCount={ready.length} onAddFile={addFile} onDownloadTemplate={() => void downloadTemplate()} onReadMapping={readMapping} />
            ) : (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                    {stage === "importing" ? <Loader2 className="size-8 animate-spin text-[var(--gm-accent)]" /> : result.failed ? <XCircle className="size-8 text-[var(--gm-danger)]" /> : <CheckCircle2 className="size-8 text-[var(--gm-success)]" />}
                    <p className="text-sm">
                        已导入 {result.done} / {plan?.rows.length ?? 0} 份资料
                    </p>
                    {result.failed ? <p className="max-w-md text-xs text-[var(--gm-danger)]">{result.failed}。已导入的会保留，剩下的文件关闭后会删除，修正后重新导入即可。</p> : null}
                </div>
            )}
        </Modal>
    );
}

type StepsProps = {
    files: readonly UploadedFile[];
    plan: BulkImportPlan | null;
    accept: string;
    uploading: boolean;
    readyCount: number;
    onAddFile: (file: File) => Promise<boolean>;
    onDownloadTemplate: () => void;
    onReadMapping: (file: File) => Promise<boolean>;
};

function FileStatusIcon({ status }: { status: UploadedFile["status"] }) {
    if (status === "uploading") return <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--gm-text-3)]" />;
    if (status === "done") return <CheckCircle2 className="size-3.5 shrink-0 text-[var(--gm-success)]" />;
    return <XCircle className="size-3.5 shrink-0 text-[var(--gm-danger)]" />;
}

function BulkImportSteps({ files, plan, accept, uploading, readyCount, onAddFile, onDownloadTemplate, onReadMapping }: StepsProps) {
    const mappingDisabled = !readyCount || uploading;
    return (
        <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">1. 上传课件文件</h4>
                <Upload.Dragger accept={accept} multiple showUploadList={false} beforeUpload={onAddFile}>
                    <div className="flex flex-col items-center gap-1.5 py-5 text-[var(--gm-text-2)]">
                        <UploadCloud className="size-7 text-[var(--gm-accent)]" />
                        <span className="text-sm">点击或拖入多个文件</span>
                        <span className="text-xs text-[var(--gm-text-3)]">支持 PDF / PPTX / DOCX / XLSX / 图片 / 视频 / ZIP，同名文件只能传一份</span>
                    </div>
                </Upload.Dragger>
                {files.length ? (
                    <ul aria-label="已选文件" className="gm-scroll flex max-h-48 flex-col gap-1 overflow-y-auto text-[13px]">
                        {files.map((file) => (
                            <li key={file.fileName} className="flex items-center gap-2">
                                <FileStatusIcon status={file.status} />
                                <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
                                {file.error ? <span className="shrink-0 text-xs text-[var(--gm-danger)]">{file.error}</span> : null}
                            </li>
                        ))}
                    </ul>
                ) : null}
            </section>
            <section className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-medium">2. 填写映射表：每个文件挂到哪一章哪一课</h4>
                    <Button size="small" icon={<FileSpreadsheet className="size-3.5" />} disabled={mappingDisabled} onClick={onDownloadTemplate}>
                        下载映射表
                    </Button>
                </div>
                <p className="text-xs text-[var(--gm-text-3)]">映射表已列出现有章节课时和已上传的文件，文件名以课时名开头的会自动对上；章节 / 课时名写新的会自动新建。</p>
                <Upload accept=".xlsx" showUploadList={false} disabled={mappingDisabled} beforeUpload={onReadMapping}>
                    <Button disabled={mappingDisabled}>上传填好的映射表</Button>
                </Upload>
                {plan ? <PlanPreview plan={plan} /> : null}
            </section>
        </div>
    );
}

function TagLine({ label, items }: { label: string; items: readonly string[] }) {
    if (!items.length) return null;
    return (
        <p className="flex flex-wrap items-center gap-1 text-xs">
            {label}
            {items.map((item) => (
                <Tag key={item}>{item}</Tag>
            ))}
        </p>
    );
}

function PlanPreview({ plan }: { plan: BulkImportPlan }) {
    return (
        <div className="flex flex-col gap-2 rounded-[12px] bg-[var(--gm-wash)] p-3 text-[13px]">
            {plan.errors.length ? (
                <div className="flex flex-col gap-1 text-[var(--gm-danger)]">
                    <p className="font-medium">有 {plan.errors.length} 处要改，改好后重新上传映射表：</p>
                    <ul className="gm-scroll max-h-32 list-disc overflow-y-auto pl-5 text-xs">
                        {plan.errors.map((error) => (
                            <li key={error}>{error}</li>
                        ))}
                    </ul>
                </div>
            ) : (
                <p>将导入 {plan.rows.length} 份资料。</p>
            )}
            <TagLine label="新建章节：" items={plan.newChapters} />
            <TagLine label="新建课时：" items={plan.newLessons} />
            {plan.unusedFiles.length ? <p className="text-xs text-[var(--gm-warning)]">表里没有用到的文件（关闭后会删除）：{plan.unusedFiles.join("、")}</p> : null}
        </div>
    );
}
