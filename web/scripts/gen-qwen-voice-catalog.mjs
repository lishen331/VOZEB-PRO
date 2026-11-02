// Regenerates src/lib/qwen-voice-catalog.json from the official Qwen-Audio-TTS voice list page
// and its two "basic voice" Excel attachments. Run manually when Alibaba Cloud updates voices:
//   node scripts/gen-qwen-voice-catalog.mjs [--html page.html] [--flash flash.xlsx] [--plus plus.xlsx]
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { strFromU8, unzipSync } from "fflate";

const PAGE_URL = "https://help.aliyun.com/zh/model-studio/qwen-audio-tts-voice-list";
const MODELS = ["qwen-audio-3.1-tts-plus", "qwen-audio-3.1-tts-flash", "qwen-audio-3.0-tts-plus", "qwen-audio-3.0-tts-flash"];
const BASIC_MODELS = ["qwen-audio-3.0-tts-plus", "qwen-audio-3.0-tts-flash"];
const BASIC_HEADER = ["序号", "名称", "voice参数", "性别", "年龄", "特质", "适用场景", "语种", "预览音频文件名"];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDir, "../src/lib/qwen-voice-catalog.json");
const arg = (name) => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : undefined;
};

const html = arg("--html") ? await readFile(arg("--html"), "utf8") : await download(PAGE_URL).then((bytes) => bytes.toString("utf8"));
const models = parsePage(html);
const basic = await parseBasic(html);

const lines = ["{", `  "source": ${JSON.stringify(PAGE_URL)},`, `  "fetchedAt": ${JSON.stringify(new Date().toISOString().slice(0, 10))},`, '  "models": {'];
MODELS.forEach((model, modelIndex) => {
    lines.push(`    ${JSON.stringify(model)}: [`);
    models[model].forEach((group, groupIndex) => {
        lines.push(`      { "group": ${JSON.stringify(group.group)}, "voices": [`);
        group.voices.forEach((voice, index) => lines.push(`        ${JSON.stringify(voice)}${index < group.voices.length - 1 ? "," : ""}`));
        lines.push(`      ] }${groupIndex < models[model].length - 1 ? "," : ""}`);
    });
    lines.push(`    ]${modelIndex < MODELS.length - 1 ? "," : ""}`);
});
lines.push("  },", '  "basic": {', `    "models": ${JSON.stringify(BASIC_MODELS)},`, '    "voices": [');
basic.forEach((voice, index) => lines.push(`      ${JSON.stringify(voice)}${index < basic.length - 1 ? "," : ""}`));
lines.push("    ]", "  }", "}", "");
await writeFile(outputPath, lines.join("\n"));

for (const model of MODELS) {
    const count = models[model].reduce((sum, group) => sum + group.voices.length, 0);
    console.log(`${model}: ${count}${BASIC_MODELS.includes(model) ? ` + 基础音色 ${basic.length}` : ""}`);
}
console.log(`已写入 ${path.relative(process.cwd(), outputPath)}`);

function parsePage(source) {
    const body = source.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
    const start = body.indexOf("Qwen-Audio-TTS音色列表");
    if (start < 0) throw new Error("页面结构变了：找不到“Qwen-Audio-TTS音色列表”");
    const result = Object.fromEntries(MODELS.map((model) => [model, []]));
    let model;
    let heading;
    // Matching a whole <table> also consumes the dialect <h4> tabs nested in its preview cells.
    for (const match of body.slice(start).matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>|<table[\s\S]*?<\/table>/g)) {
        if (match[1]) {
            const title = clean(match[2]);
            if (match[1] === "2" && title === "基础音色") break;
            if (match[1] === "3") [model, heading] = [MODELS.includes(title) ? title : undefined, undefined];
            if (match[1] === "4") heading = title;
            continue;
        }
        if (!model) continue;
        for (const voice of parseTable(match[0])) {
            const group = heading || voice.scene;
            if (!heading) delete voice.scene;
            if (!group) throw new Error(`${model} 的 ${voice.id} 没有分组`);
            if (result[model].some((item) => item.voices.some((other) => other.id === voice.id))) throw new Error(`${model} 里 ${voice.id} 重复`);
            const target = result[model].find((item) => item.group === group) || result[model][result[model].push({ group, voices: [] }) - 1];
            target.voices.push(compact(voice));
        }
    }
    for (const name of MODELS) if (!result[name].length) throw new Error(`页面里没有找到 ${name} 的音色表`);
    return result;
}

function parseTable(table) {
    const rows = [...table.matchAll(/<tr[\s>][\s\S]*?<\/tr>/g)].map((row) => [...row[0].matchAll(/<(td|th)(\s[^>]*)?>([\s\S]*?)<\/\1>/g)]);
    const header = rows[0].map((cell) => clean(cell[3]));
    const carry = [];
    const voices = [];
    for (const row of rows.slice(1)) {
        const cells = [];
        let next = 0;
        for (let column = 0; column < header.length; column += 1) {
            if (carry[column]?.left > 0) {
                carry[column].left -= 1;
                cells.push(carry[column].html);
                continue;
            }
            const cell = row[next++];
            if (!cell) break;
            const span = Number(cell[2]?.match(/rowspan="(\d+)"/)?.[1] || 1);
            if (span > 1) carry[column] = { html: cell[3], left: span - 1 };
            cells.push(cell[3]);
        }
        const voice = parseRow(header, cells);
        if (voice) voices.push(voice);
    }
    return voices;
}

function parseRow(header, cells) {
    const voice = { id: "", name: "", gender: "", trait: "", lang: "", scene: "", preview: "" };
    header.forEach((title, index) => {
        const html = cells[index] || "";
        if (/名称|音色信息/.test(title)) {
            for (const paragraph of html.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)) {
                const [key, ...rest] = clean(paragraph[1]).split(/[:：]/);
                const value = rest.join(":").trim();
                const name = key.replace(/\s+/g, "");
                if (name === "名称" || name === "音色名称") voice.name = value.replace(/_v\d+(?:\.\d+)?$/, "");
                else if (name === "voice参数") voice.id = value;
                else if (name === "特质") voice.trait = value;
                else if (name === "性别") voice.gender = value;
                else if (name === "语言") voice.lang = value;
            }
        } else if (title === "性别") voice.gender = clean(html);
        else if (title === "声线特质" || title === "口音") voice.trait = clean(html);
        else if (title === "语种") voice.lang = clean(html);
        else if (title === "适用场景") voice.scene = clean(html);
        else if (title.includes("试听")) voice.preview = html.match(/<(?:audio|source)\s[^>]*?\b(?:data-)?src="(https:\/\/[^"]+)"/)?.[1] || "";
    });
    if (!voice.id) return null;
    if (!/^[A-Za-z0-9_.-]+$/.test(voice.id)) throw new Error(`音色 ID 格式异常：${voice.id}`);
    return voice;
}

async function parseBasic(source) {
    const tables = {};
    for (const [model, flag] of BASIC_MODELS.map((name) => [name, name.endsWith("plus") ? "--plus" : "--flash"])) {
        const url = [...source.matchAll(/https:\/\/[^"'\s]+\.xlsx/g)].map((match) => match[0]).find((href) => decodeURIComponent(href).includes(`${model}基础音色`));
        if (!arg(flag) && !url) throw new Error(`页面里找不到 ${model} 基础音色 Excel`);
        const rows = readXlsxRows(arg(flag) ? await readFile(arg(flag)) : await download(url));
        if (rows[0].join("|") !== BASIC_HEADER.join("|")) throw new Error(`${model} 基础音色表头变了：${rows[0].join("|")}`);
        tables[model] = rows.slice(1).map(([, name, id, gender, age, trait, scene, lang, file]) => {
            const slug = String(id).replace(`${model}-`, "");
            if (`${model}-${slug}` !== id || `${slug}.wav` !== file || !/^[a-z0-9_]+$/.test(slug)) throw new Error(`${model} 基础音色格式异常：${id} / ${file}`);
            return compact({ slug, name: String(name).trim(), gender: gender === "男" || gender === "女" ? gender : "", age: Number(age) || undefined, trait: String(trait).trim(), scene: String(scene).trim(), lang: String(lang).trim() });
        });
    }
    const [first, second] = BASIC_MODELS.map((model) => JSON.stringify(tables[model]));
    if (first !== second) throw new Error("plus 与 flash 的基础音色不一致，需要改成按模型分别存");
    return tables[BASIC_MODELS[0]];
}

// The official workbooks use an "x:" namespace prefix that ExcelJS cannot read, so parse the XML directly.
function readXlsxRows(bytes) {
    const files = unzipSync(new Uint8Array(bytes));
    const text = (name) => {
        if (!files[name]) throw new Error(`Excel 缺少 ${name}`);
        return strFromU8(files[name]).replace(/^﻿/, "");
    };
    const strings = files["xl/sharedStrings.xml"]
        ? [...text("xl/sharedStrings.xml").matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((item) => [...item[1].matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((part) => clean(part[1])).join(""))
        : [];
    return [...text("xl/worksheets/sheet1.xml").matchAll(/<(?:\w+:)?row[\s>][\s\S]*?<\/(?:\w+:)?row>/g)].map((row) => {
        const values = [];
        for (const cell of row[0].matchAll(/<(?:\w+:)?c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
            const column = cell[1].match(/r="([A-Z]+)\d+"/)?.[1];
            const index = column ? [...column].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1 : values.length;
            const type = cell[1].match(/t="(\w+)"/)?.[1];
            const inner = cell[2] || "";
            const raw = inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
            values[index] = type === "s" ? strings[Number(raw)] : type === "inlineStr" ? clean(inner) : raw === undefined ? "" : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : clean(raw);
        }
        return Array.from(values, (value) => value ?? "");
    });
}

function clean(value) {
    return value
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

function compact(record) {
    return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== "" && value !== undefined));
}

async function download(url) {
    const response = await fetch(url, { headers: { "User-Agent": "VOZEB-PRO voice catalog generator" }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`下载失败 HTTP ${response.status}：${url}`);
    return Buffer.from(await response.arrayBuffer());
}
