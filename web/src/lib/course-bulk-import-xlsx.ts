import ExcelJS from "exceljs";

/*
 * 课件批量导入的 Excel 读写（只在浏览器里按需 import，避免把 exceljs 打进首屏）。
 * 规则在 course-bulk-import.ts，这里只负责 表格 <-> 二维字符串。
 */

const SHEET_NAME = "课件映射";

export async function buildCourseBulkImportXlsx(rows: readonly (readonly string[])[]): Promise<Uint8Array<ArrayBuffer>> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(SHEET_NAME);
    rows.forEach((row) => sheet.addRow([...row]));
    sheet.columns.forEach((column, index) => {
        column.width = index === 2 ? 40 : 24;
    });
    sheet.getRow(1).font = { bold: true };
    return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function cellText(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
        if ("richText" in value) return value.richText.map((item) => item.text).join("");
        if ("text" in value && typeof value.text === "string") return value.text;
        if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
        return "";
    }
    return String(value);
}

/** 读第一个工作表，返回二维字符串（第一行是表头）；不是 xlsx 时抛错 */
export async function readCourseBulkImportXlsx(data: ArrayBuffer): Promise<string[][]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const rows: string[][] = [];
    const width = Math.max(4, sheet.columnCount);
    for (let index = 1; index <= sheet.rowCount; index += 1) {
        const row = sheet.getRow(index);
        rows.push(Array.from({ length: width }, (_, column) => cellText(row.getCell(column + 1).value)));
    }
    return rows;
}
