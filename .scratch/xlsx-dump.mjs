import { readFileSync } from "node:fs";

const dir = process.argv[2];
const xml = readFileSync(`${dir}/xl/sharedStrings.xml`, "utf8");
const sheet = readFileSync(`${dir}/xl/worksheets/sheet1.xml`, "utf8");

const decode = (s) =>
    s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");

const strings = [];
for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const text = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join("");
    strings.push(text);
}

const mask = (v) => {
    if (v.length >= 24 && /^[A-Za-z0-9_\-.]+$/.test(v)) return `${v.slice(0, 5)}…${v.slice(-4)} (len=${v.length})`;
    if (/^sk-/i.test(v)) return `${v.slice(0, 5)}…${v.slice(-4)} (len=${v.length})`;
    return v;
};

const rows = new Map();
for (const rm of sheet.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNum = Number(rm[1]);
    const cells = [];
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
        const col = cm[1];
        const attrs = cm[2];
        const inner = cm[3];
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (!vMatch) continue;
        let value = vMatch[1];
        if (/t="s"/.test(attrs)) value = strings[Number(value)] ?? "";
        else if (/t="inlineStr"/.test(attrs)) value = decode(value);
        cells.push([col, mask(decode(String(value))).replace(/\s+/g, " ").slice(0, 70)]);
    }
    if (cells.length) rows.set(rowNum, cells);
}

const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]);
console.log("TOTAL_ROWS", sorted.length);
for (const [num, cells] of sorted.slice(0, 40)) {
    console.log(`R${num}: ` + cells.map(([c, v]) => `${c}=${v}`).join(" | "));
}
