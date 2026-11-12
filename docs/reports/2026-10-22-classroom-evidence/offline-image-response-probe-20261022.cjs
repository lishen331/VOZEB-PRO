// Offline diagnostic only. Reads immutable git blobs; no HTTP, SSH, environment or credentials.
const fs = require('node:fs');
const cp = require('node:child_process');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const repo = 'D:/Claude code programe/VOZEB-PRO/VOZEB-PRO';
const sha = '2b99976ffff6f6060fd06c07767e56d62eb5a402';
const ts = require(path.join(repo, 'web/node_modules/typescript/lib/typescript.js'));
const sources = {};
const modules = {};
const files = {
 support: 'web/src/app/api/image-tasks/image-task-support.ts',
 custom: 'web/src/app/api/image-tasks/image-task-custom.ts',
 types: 'web/src/app/api/image-tasks/image-task-types.ts',
 dedupe: 'web/src/lib/image-result-dedupe.ts',
 urls: 'web/src/lib/media-url.ts',
 provider: 'web/src/lib/server/provider-task-config.ts',
};
function load(name) {
 if (modules[name]) return modules[name].exports;
 const source = cp.execFileSync('git', ['show', `${sha}:${files[name]}`], { cwd: repo, encoding: 'utf8', maxBuffer: 5e6 });
 sources[name] = { file: files[name], sha256: crypto.createHash('sha256').update(source).digest('hex') };
 const module = { exports: {} }; modules[name] = module;
 const text = name === 'custom' ? source + '\nexport { configuredImageResult };\n' : source;
 const code = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }}).outputText;
 const map = { './image-task-support': 'support', './image-task-types': 'types', '@/lib/image-result-dedupe': 'dedupe', '@/lib/media-url': 'urls', '@/lib/server/provider-task-config': 'provider' };
 const localRequire = (id) => map[id] ? load(map[id]) : {};
 vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: files[name] })(localRequire, module, module.exports);
 return module.exports;
}
const support = load('support'); const custom = load('custom'); const provider = load('provider');
const rows = [];
const config = { baseUrl: '/api/ai/system/openai-image', model: 'gpt-image-2', apiFormat: 'openai', advancedConfig: {} };
(async () => {
 for (const n of [1024, 3_000_000, 4_500_000, 6_500_000, 9_000_000, 12_000_000]) {
  const b64 = 'iVBORw0KGgo' + 'Ab9+/0Zz'.repeat(Math.ceil(n / 8)).slice(0, n - 11);
  for (const shape of ['openai-b64', 'nested-base64', 'inline-dataurl', 'string-container']) {
   const payload = shape === 'openai-b64' ? { data: [{ b64_json: b64 }] } : shape === 'nested-base64' ? { result: { output: [{ image_base64: b64 }] } } : shape === 'inline-dataurl' ? { data: [{ url: 'data:image/png;base64,' + b64 }] } : { images: [b64] };
   const row = { base64Chars: b64.length, shape, fixture: 'synthetic non-user ASCII base64; image pixels not decoded', stage: '' };
   const start = performance.now();
   try {
    row.stage = 'json-roundtrip'; const parsed = JSON.parse(JSON.stringify(payload));
    row.stage = 'provider-business-check'; row.businessError = provider.isProviderBusinessError(parsed);
    row.stage = 'findImageResults'; const found = support.findImageResults(parsed, 'https://fixture.invalid/v1/images/generations', config);
    row.imageCount = found.length;
    row.stage = 'configuredImageResult'; const configured = custom.configuredImageResult(parsed, 'https://fixture.invalid/v1/images/generations', { config });
    row.configuredCount = configured?.results?.length || 0;
    row.stage = 'parseImagePayloadOrPoll'; const result = await support.parseImagePayloadOrPoll(config, parsed, 'https://fixture.invalid/v1/images/generations', '', undefined, true);
    row.parsedCount = result.results?.length || 0;
    row.ok = row.imageCount === 1 && row.configuredCount === 1 && row.parsedCount === 1;
   } catch (e) { row.ok = false; row.errorName = e.name; row.errorMessage = e.message; row.stack = String(e.stack).split('\n').slice(0, 10); }
   row.durationMs = +(performance.now() - start).toFixed(2); rows.push(row);
  }
 }
 const output = { at: new Date().toISOString(), offline: true, productionCommit: sha, localNode: process.version, limitations: ['No captured production response body or production stack trace.', 'External imports stubbed; excludes transport, billing, storage and result normalization.', 'Synthetic fixtures do not prove arbitrary provider response shapes.'], sources, rows };
 const dest = path.join(__dirname, 'offline-image-response-probe-20261022.json');
 fs.writeFileSync(dest, JSON.stringify(output, null, 2));
 console.log(JSON.stringify({ saved: dest, passed: rows.filter(x=>x.ok).length, total: rows.length, failures: rows.filter(x=>!x.ok), maxDurationMs: Math.max(...rows.map(x=>x.durationMs)) }, null, 2));
})();
