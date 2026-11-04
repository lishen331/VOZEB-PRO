/*
 * 课件批量导入（平台课程）的映射规则：前端先把文件逐个传上去，再用一张 Excel 说明每个文件挂到哪一章哪一课。
 * Excel 列：章节名 | 课时名 | 文件名 | 资料标题（可空，默认用文件名）
 * 章节 / 课时按名称匹配（去掉首尾空格、连续空白合成一个后完全一致）；不存在的会新建，顺序按 Excel 里第一次出现的顺序。
 * 本文件是纯函数，Excel 的读写在调用方完成，这里只处理表格行。
 */

export const BULK_IMPORT_COLUMNS = ["章节名", "课时名", "文件名", "资料标题"] as const;
export const BULK_IMPORT_MAX_ROWS = 500;

export type BulkImportTree = { chapters: readonly { id: string; title: string; lessons: readonly { id: string; title: string }[] }[] };
export type BulkImportFile = { fileName: string; storageKey: string };

export type BulkImportRow = {
    /** Excel 里的行号（含表头，从 1 开始），给错误提示用 */
    line: number;
    chapterTitle: string;
    lessonTitle: string;
    fileName: string;
    title: string;
    storageKey: string;
    /** 已存在时给 id；为空表示要新建 */
    chapterId: string;
    lessonId: string;
};

export type BulkImportPlan = {
    rows: BulkImportRow[];
    errors: string[];
    newChapters: string[];
    /** 「章节名 / 课时名」 */
    newLessons: string[];
    /** 传了但 Excel 里没提到的文件 */
    unusedFiles: string[];
    /** 每一行解析出来的内容，含出错的行，供导入前预览 */
    preview: BulkImportPreviewRow[];
};

/** 预览行：line 为 Excel 行号；problem 为空表示这行没问题 */
export type BulkImportPreviewRow = {
    line: number;
    chapterTitle: string;
    lessonTitle: string;
    fileName: string;
    title: string;
    problem: string;
};

export const cleanBulkImportCell = (value: unknown) => (value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim());

function failed(message: string, files: readonly BulkImportFile[]): BulkImportPlan {
    return { rows: [], errors: [message], newChapters: [], newLessons: [], unusedFiles: files.map((file) => file.fileName), preview: [] };
}

/** table[0] 是表头；整行为空的跳过 */
export function planCourseBulkImport(table: readonly (readonly unknown[])[], tree: BulkImportTree, files: readonly BulkImportFile[]): BulkImportPlan {
    const header = (table[0] ?? []).map(cleanBulkImportCell);
    const missingColumns = BULK_IMPORT_COLUMNS.slice(0, 3).filter((column) => !header.includes(column));
    if (missingColumns.length) return failed(`表头缺少列：${missingColumns.join("、")}（请用「下载模板」生成的表格）`, files);
    if (table.length - 1 > BULK_IMPORT_MAX_ROWS) return failed(`一次最多导入 ${BULK_IMPORT_MAX_ROWS} 行`, files);

    const chapterByTitle = new Map(tree.chapters.map((chapter) => [cleanBulkImportCell(chapter.title), chapter]));
    // 读回的单元格会被 cleanBulkImportCell 规整，文件名也按同一规则建索引，否则含连续 / 全角空白的文件永远匹配不上
    const filesByName = new Map<string, BulkImportFile>();
    const errors: string[] = [];
    for (const file of files) {
        const key = cleanBulkImportCell(file.fileName);
        const existing = filesByName.get(key);
        if (existing) errors.push(`文件「${existing.fileName}」和「${file.fileName}」去掉多余空格后同名，请改名后重新上传其中一个`);
        else filesByName.set(key, file);
    }
    const used = new Set<string>();
    const newChapters: string[] = [];
    const newLessons: string[] = [];
    const rows: BulkImportRow[] = [];
    const preview: BulkImportPreviewRow[] = [];

    table.slice(1).forEach((cells, index) => {
        const line = index + 2;
        const value = (name: string) => (header.indexOf(name) >= 0 ? cleanBulkImportCell(cells[header.indexOf(name)]) : "");
        const chapterTitle = value("章节名");
        const lessonTitle = value("课时名");
        const fileName = value("文件名");
        if (!chapterTitle && !lessonTitle && !fileName) return;
        const pushPreview = (problem: string) => preview.push({ line, chapterTitle, lessonTitle, fileName, title: value("资料标题") || fileName, problem });
        if (!chapterTitle || !lessonTitle || !fileName) {
            const missing = [!chapterTitle && "章节名", !lessonTitle && "课时名", !fileName && "文件名"].filter(Boolean).join("、");
            const problem = `缺少「${missing}」`;
            errors.push(`第 ${line} 行：${problem}`);
            pushPreview(problem);
            return;
        }
        const file = filesByName.get(fileName);
        if (!file) {
            const problem = `「文件名」列的「${fileName}」不在已上传列表里`;
            errors.push(`第 ${line} 行：${problem}，请核对文件名（含扩展名）或重新上传该文件`);
            pushPreview(problem);
            return;
        }
        if (used.has(fileName)) {
            const problem = `文件「${fileName}」在表里出现了不止一次`;
            errors.push(`第 ${line} 行：${problem}`);
            pushPreview(problem);
            return;
        }
        used.add(fileName);
        const chapter = chapterByTitle.get(chapterTitle);
        const lesson = chapter?.lessons.find((item) => cleanBulkImportCell(item.title) === lessonTitle);
        if (!chapter && !newChapters.includes(chapterTitle)) newChapters.push(chapterTitle);
        const lessonLabel = `${chapterTitle} / ${lessonTitle}`;
        if (!lesson && !newLessons.includes(lessonLabel)) newLessons.push(lessonLabel);
        rows.push({ line, chapterTitle, lessonTitle, fileName, title: value("资料标题") || fileName, storageKey: file.storageKey, chapterId: chapter?.id ?? "", lessonId: lesson?.id ?? "" });
        pushPreview("");
    });

    if (!rows.length && !errors.length) errors.push("表格里没有数据行");
    return { rows, errors, newChapters, newLessons, unusedFiles: files.filter((file) => !used.has(cleanBulkImportCell(file.fileName))).map((file) => file.fileName), preview };
}

/**
 * 从文件名猜出章节名 / 课时名，减少手填。
 * 依次尝试：
 *   1. 文件名以某个已有课时名开头  → 章节名、课时名都填已有值
 *   2. 文件名以某个已有章节名开头  → 只填章节名，课时名留空待填
 *   3. 文件名带分隔符（- _ 空格 / ／）→ 取分隔符前一段当章节名，后一段当课时名
 *   4. 都不命中 → 留空
 * 猜错只是填错位置，管理员在表格里改掉即可，不会丢文件。
 */
export function inferBulkImportTarget(fileName: string, tree: BulkImportTree): { chapterTitle: string; lessonTitle: string } {
    const name = cleanBulkImportCell(fileName);
    const base = name.replace(/\.[^.]+$/, "");
    for (const chapter of tree.chapters) {
        for (const lesson of chapter.lessons) {
            const lessonTitle = cleanBulkImportCell(lesson.title);
            if (lessonTitle && base.startsWith(lessonTitle)) return { chapterTitle: chapter.title, lessonTitle: lesson.title };
        }
    }
    for (const chapter of tree.chapters) {
        const chapterTitle = cleanBulkImportCell(chapter.title);
        if (chapterTitle && base.startsWith(chapterTitle)) return { chapterTitle: chapter.title, lessonTitle: "" };
    }
    const parts = base.split(/\s*[-_/／\s]\s*/).filter(Boolean);
    if (parts.length >= 2) return { chapterTitle: parts[0], lessonTitle: parts[1] };
    return { chapterTitle: "", lessonTitle: "" };
}

/**
 * 模板内容：把每个上传的文件先按 inferBulkImportTarget 猜好章节 / 课时填进表格，
 * 已有课时的行排前面，需要新建的排后面。管理员只需改猜错的行，不用从空白开始填。
 */
export function courseBulkImportTemplateRows(tree: BulkImportTree, files: readonly BulkImportFile[]): string[][] {
    const rows: string[][] = [[...BULK_IMPORT_COLUMNS]];
    const matchedRows: string[][] = [];
    const unmatched: { chapterTitle: string; lessonTitle: string; fileName: string }[] = [];
    for (const file of files) {
        const target = inferBulkImportTarget(file.fileName, tree);
        if (target.chapterTitle && target.lessonTitle) matchedRows.push([target.chapterTitle, target.lessonTitle, file.fileName, ""]);
        else unmatched.push({ ...target, fileName: file.fileName });
    }
    for (const chapter of tree.chapters) {
        for (const lesson of chapter.lessons) {
            const alreadyListed = matchedRows.some((row) => cleanBulkImportCell(row[0]) === cleanBulkImportCell(chapter.title) && cleanBulkImportCell(row[1]) === cleanBulkImportCell(lesson.title));
            if (!alreadyListed) matchedRows.push([chapter.title, lesson.title, "", ""]);
        }
    }
    rows.push(...matchedRows);
    for (const item of unmatched) rows.push([item.chapterTitle, item.lessonTitle, item.fileName, ""]);
    return rows;
}
