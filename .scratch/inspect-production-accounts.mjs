import * as XLSX from 'xlsx'; import {writeFileSync} from 'node:fs';
const files=process.argv.slice(2), rows=[]; for(const file of files){const wb=XLSX.readFile(file); for(const name of wb.SheetNames){const data=XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:''}); for(const row of data) rows.push({source:file.split(/[\\/]/).pop(),...row});}}
console.log(JSON.stringify({files,rows:rows.length,keys:[...new Set(rows.flatMap(r=>Object.keys(r)))]})); writeFileSync(process.env.OUT,JSON.stringify(rows));
