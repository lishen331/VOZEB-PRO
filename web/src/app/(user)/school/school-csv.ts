import Papa from "papaparse";

import type { SchoolMemberCreateInput, SchoolMemberRole } from "@/lib/school-domain";

const CSV_COLUMNS = ["username", "displayName", "password", "role"];

export type SchoolMemberCsvResult = { ok: true; rows: SchoolMemberCreateInput[] } | { ok: false; message: string };

export function parseSchoolMemberCsv(source: string): SchoolMemberCsvResult {
    const result = Papa.parse<Record<string, string> & { __parsed_extra?: string[] }>(source, { header: true, skipEmptyLines: true });
    const fields = result.meta.fields || [];
    if (fields.length !== CSV_COLUMNS.length || CSV_COLUMNS.some((column, index) => fields[index] !== column)) {
        return { ok: false, message: "CSV 列必须依次为 username、displayName、password、role" };
    }
    if (result.errors.length || result.data.some((row) => row.__parsed_extra?.length)) return { ok: false, message: "CSV 存在格式错误或额外列" };
    if (!result.data.length) return { ok: false, message: "CSV 中没有可导入的成员" };
    return {
        ok: true,
        rows: result.data.map((row) => ({ username: row.username || "", displayName: row.displayName || "", password: row.password || "", role: row.role as SchoolMemberRole })),
    };
}
