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
};

export const cleanBulkImportCell = (value: unknown) => (value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim());

function failed(message: string, files: readonly BulkImportFile[]): BulkImportPlan {
    return { rows: [], errors: [message], newChapters: [], newLessons: [], unusedFiles: files.map((file) => file.fileName) };
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

    table.slice(1).forEach((cells, index) => {
        const line = index + 2;
        const value = (name: string) => (header.indexOf(name) >= 0 ? cleanBulkImportCell(cells[header.indexOf(name)]) : "");
        const chapterTitle = value("章节名");
        const lessonTitle = value("课时名");
        const fileName = value("文件名");
        if (!chapterTitle && !lessonTitle && !fileName) return;
        if (!chapterTitle || !lessonTitle || !fileName) {
            errors.push(`第 ${line} 行：章节名、课时名、文件名都要填`);
            return;
        }
        const file = filesByName.get(fileName);
        if (!file) {
            errors.push(`第 ${line} 行：没有找到已上传的文件「${fileName}」`);
            return;
        }
        if (used.has(fileName)) {
            errors.push(`第 ${line} 行：文件「${fileName}」在表里出现了不止一次`);
            return;
        }
        used.add(fileName);
        const chapter = chapterByTitle.get(chapterTitle);
        const lesson = chapter?.lessons.find((item) => cleanBulkImportCell(item.title) === lessonTitle);
        if (!chapter && !newChapters.includes(chapterTitle)) newChapters.push(chapterTitle);
        const lessonLabel = `${chapterTitle} / ${lessonTitle}`;
        if (!lesson && !newLessons.includes(lessonLabel)) newLessons.push(lessonLabel);
        rows.push({ line, chapterTitle, lessonTitle, fileName, title: value("资料标题") || fileName, storageKey: file.storageKey, chapterId: chapter?.id ?? "", lessonId: lesson?.id ?? "" });
    });

    if (!rows.length && !errors.length) errors.push("表格里没有数据行");
    return { rows, errors, newChapters, newLessons, unusedFiles: files.filter((file) => !used.has(cleanBulkImportCell(file.fileName))).map((file) => file.fileName) };
}

/** 模板内容：已有课时各占一行；文件名以课时名开头的直接填上，剩下的文件放在最后让管理员补章节 / 课时 */
export function courseBulkImportTemplateRows(tree: BulkImportTree, files: readonly BulkImportFile[]): string[][] {
    const rows: string[][] = [[...BULK_IMPORT_COLUMNS]];
    let remaining = files.map((file) => file.fileName);
    for (const chapter of tree.chapters) {
        for (const lesson of chapter.lessons) {
            const title = cleanBulkImportCell(lesson.title);
            const matched = title ? remaining.filter((name) => name.startsWith(title)) : [];
            remaining = remaining.filter((name) => !matched.includes(name));
            if (!matched.length) rows.push([chapter.title, lesson.title, "", ""]);
            for (const name of matched) rows.push([chapter.title, lesson.title, name, ""]);
        }
    }
    for (const name of remaining) rows.push(["", "", name, ""]);
    return rows;
}
