// 只读:解出 xlsx 的表头与结构,值一律打码,用于确认哪列是 Key
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const path = process.argv[2];
const buf = readFileSync(path);

// xlsx = zip;用 node 内置 zlib 手工解 zip 太繁琐,这里借 PowerShell 解压到临时目录
const tmp = process.argv[3];
execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${path}' -DestinationPath '${tmp}' -Force"`, { stdio: "inherit" });
console.log("EXTRACTED_OK", tmp, buf.length);
