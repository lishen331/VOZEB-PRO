# 2026-10-21 隔离生产树依赖审计：最小修复清单（只读）

## 结论：目前不能宣称可全部patch后恢复门禁

已在隔离树web运行`pnpm audit --audit-level moderate --json`，退出1，stderr为空。元数据68项：2 critical、27 high、32 moderate、7 low；原始JSON包含61条advisory记录、15个受影响包名，统计口径不同，不相加。docs同命令退出1，元数据9项：1 critical、3 high、4 moderate、1 low。

**阻断：braces@3.0.3，高危GHSA-vfj7-8cjw-p6xm，受影响<=3.0.3，audit的patched_versions=null。2026-10-21 21:26:34对npm公开元数据复核：latest仍3.0.3，3.0.4请求404。没有已确认可升级的修复版本；不能编造braces@3.0.4、降级、ignore或移除audit来过门禁。** 路径包括eslint-config-next→@next/eslint-plugin-next→fast-glob→micromatch→braces，以及shadcn相关链。因此只删除shadcn不能解决所有braces来源。

其余14个包可定位到同major修复候选，但axios、undici 8、SDK、ip-address需要同major内minor升级，并非全是patch；不能承诺“无任何功能差异”。当前没有证据要求它们升major。braces需要等上游正式修复，或另案评审受维护fork/可验证补丁替代及兼容性；后者需要明确决策，不属于本次静默常规依赖更新。

## 直接依赖（web生产dependencies）

| 包 | 锁定版本 | 覆盖本次全部相关告警的最低候选 | 升级级别 | 必须注意 |
| --- | --- | --- | --- | --- |
| next | 16.3.4 | 16.3.8 | patch | 仅16.3.6不能覆盖后续5条告警；16.3.8包含本次六条Next告警修复范围 |
| sharp | 0.35.4 | 0.35.5 | patch | package精确锁定与workspace overrides.sharp都须同步；须验收Linux原生sharp |
| undici | 8.9.0 | 8.10.2 | minor，同major | ^8.9.0已容纳候选，但锁未更新；8.10.2要求Node>=22.19.0，CI/Docker需符合 |
| axios | 1.19.0 | 1.20.0 | minor，同major | ^1.19.0已容纳候选；还要确保follow-redirects锁到1.16.1，不能假设升axios自动解除所有子依赖告警 |

## 传递依赖与最小选择器范围（不是执行命令，也尚未改文件）

| 包 | 当前 | 最低候选 | 典型来源/最小修改位置 |
| --- | --- | --- | --- |
| undici 7 | 7.29.0 | 7.29.1 | shadcn/@dotenvx；workspace现有`undici@^7.0.0`覆盖精确旧版，应仅更新该selector，不与直接8.x强并 |
| fast-uri | 3.1.6 | 3.1.8 | shadcn→SDK/ajv；workspace已有global override。3.1.7不足覆盖第三条；另一个=3.1.6告警patched=null，但3.1.8已在其声明影响范围之外，必须新audit确认消除 |
| brace-expansion（旧分支） | 2.1.4 | 2.1.7 | workspace现有`minimatch@3.1.5>brace-expansion`selector，保留2.x不强并5.x |
| brace-expansion（新分支） | 5.0.9 | 5.0.12 | workspace现有global override；覆盖不同递归/资源消耗告警需取本次最高修复下界 |
| hono | 4.13.7 | 4.13.11 | workspace现有global override，SDK与@hono/node-server链 |
| ip-address | 10.3.1 | 10.7.1 | workspace现有global override，SDK→express-rate-limit；仅10.5.1不覆盖全部四条 |
| @modelcontextprotocol/sdk | 1.30.0 | 1.32.0 | shadcn传递；定向刷新或窄selector，不升shadcn全套latest |
| proxy-addr | 2.0.7 | 2.0.8 | SDK→express→proxy-addr；同分支patch |
| postcss-selector-parser | 7.1.5 | 7.1.6 | shadcn传递；同分支patch |
| source-map-js | 1.2.1 | 1.2.2 | postcss/tailwind/Next/vitest等多链；定向刷新同分支patch |
| follow-redirects | 1.16.0 | 1.16.1 | axios子依赖；axios1.20.0仍声明^1.16.0，需核对新锁实际解析 |
| vite | 8.1.4 | 8.1.6 | vitest/@vitest/mocker；仅刷新8.1分支patch，保留vitest4.x |
| braces | 3.0.3 | **暂无已确认修复版本** | eslint-config-next与shadcn均可引入；不能用修改audit策略规避 |

直接/传递及dev标记来自完整audit findings路径和锁；“在dev链”不等于可忽略：CI moderate门禁审计整个锁，生产构建阶段也安装dev依赖。是否进入standalone运行镜像需另做打包追踪，本报告不凭dev字段判断无风险。

## 不能只授权package.json+pnpm-lock.yaml

`web/pnpm-workspace.yaml`当前固定了sharp0.35.4、fast-uri3.1.6、brace-expansion5.0.9及2.1.4、hono4.13.7、ip-address10.3.1、undici7.29.0。只改package/lock，下一次frozen-lockfile可能覆盖配置不一致或重新解析回旧版。若后续授权修复，最小文件范围至少包含web/package.json、web/pnpm-workspace.yaml、web/pnpm-lock.yaml；没有执行更新，也没有修改这些文件。

最小过程：先确认braces可接受的真实修复来源；明确授权上述文件；仅选定版本/selector更新，禁止全库update --latest或无审查audit --fix；生成一致锁后运行完整pnpm audit moderate并检查JSON剩余；然后Linux冻结安装、typecheck、unit、原生Canvas E2E、build及sharp/native验证。审计无剩余moderate+之前，不以build-only成功声称发布通过。

## docs是否独立及其影响

`docs/package.json`名称vozeb-pro-docs，独立docs/pnpm-lock.yaml及docs/pnpm-workspace.yaml；Quality有独立docs job（working-directory:docs）。生产根Dockerfile仅COPY web及VERSION/CHANGELOG，不构建或复制docs应用，所以docs审计不是生产主应用依赖树的一部分，但仍是仓库Quality实际门禁，不能丢弃。

本次额外只读docs audit确认：next16.3.4（直接，候选16.3.8）、next传递sharp0.35.4（候选0.35.5）、source-map-js1.2.1（候选1.2.2）。docs workspace同样固定sharp0.35.4，若修复也需独立更新该override与其锁。docs没有本次web的braces告警，不代表web已解决。

## 证据和操作边界

- prod-dependency-audit.json：原始web审计JSON，退出1。
- docs-dependency-audit.json：独立docs只读审计JSON，退出1。
- audit-target-package-metadata.json：npm公开包元数据，记录目标版本存在性与engines；braces latest3.0.3/3.0.4缺失。
- 没有install/update、改依赖、改源码、push、部署或绕过审计。本机Node24.16.0、pnpm11.25.0；CI配置pnpm11.9.0，因此最终必须在Linux配置环境复核，当前JSON不冒充CI已通过。
