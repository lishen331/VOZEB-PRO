import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
const files = ["C:/Users/admin/Documents/WXWork/1688858164765345/Cache/File/2026-10/顺职大A班-账号密码已回填.xlsx", "C:/Users/admin/Documents/WXWork/1688858164765345/Cache/File/2026-10/顺职大B班-账号密码已回填.xlsx"];
const out = [];
for (const file of files) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    for (const ws of wb.worksheets) {
        ws.eachRow((row, n) => {
            if (n <= 2) return;
            const vals = row.values || [];
            const username = String(vals[6] ?? "").trim();
            const password = String(vals[7] ?? "").trim();
            if (username && password) out.push({ username, password, source: file });
        });
    }
}
const seen = new Set();
const accounts = out.filter((x) => !seen.has(x.username) && (seen.add(x.username), true));
console.log(JSON.stringify({ total: accounts.length, duplicates: out.length - accounts.length, samples: accounts.slice(0, 3).map((x) => x.username) }));
writeFileSync("C:/Users/admin/Downloads/VOZEB-capacity-20260919/production-class-accounts-20261010.json", JSON.stringify(accounts));
