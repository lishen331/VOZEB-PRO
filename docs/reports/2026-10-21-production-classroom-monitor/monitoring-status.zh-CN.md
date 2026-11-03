# 2026-10-21 生产现场监控记录（课堂已收口，课后发布观察中）

<!-- BEGIN LIVE SUCCESS TABLES -->
## 实时成功率总览（2026-10-23 09:57:44，北京时间）

统计窗口：2026-10-21 14:30:00起；配置revision=97。**这是14:30起持续现场任务（含课后提交），不混入上午扩样；课堂冻结口径另见production-classroom-final-report.zh-CN.md。任务成功代表后台任务终态成功，不冒充已逐个浏览器验图通过。**

### 整体成功率

| 已建任务 | 成功 | 失败 | 取消 | 处理中 | 成功率：成功/全部任务 | 已终态成功率：成功/终态任务 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1524 | 955 | 568 | 0 | 1 | **62.66%** | **62.71%** |

处理中不按失败计算；它只进入“全部任务”分母，不进入“已终态”分母。没有任务ID且无法唯一归属的HTTP400/503拒绝另列，**不能将此表称为包含所有提交的端到端成功率**。

| 能力类型 | 已建任务 | 成功 | 失败 | 处理中 | 全部任务成功率 | 已终态成功率 | 成功耗时均值/P95秒 | 完整成功耗时覆盖 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| text | 181 | 174 | 7 | 0 | 96.13% | 96.13% | 2.62 / 6.21 | 174/174 |
| image | 883 | 546 | 336 | 1 | 61.83% | 61.90% | 104.68 / 261.32 | 539/546 |
| video | 460 | 235 | 225 | 0 | 51.09% | 51.09% | 430.24 / 935.00 | 235/235 |
| audio | 0 | 0 | 0 | 0 | 未观察任务 | — | — / — | 0/0 |

### 逐账号成功率（账号脱敏，固定别名）

| 账号别名 | 脱敏账号 | 任务数 | 成功 | 失败 | 取消 | 处理中 | 全部任务成功率 | 已终态成功率 | 成功耗时均值/P95秒 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ACC-b73dc7e7f0 | 25***0014 | 215 | 85 | 130 | 0 | 0 | 39.53% | 39.53% | 215.70 / 486.53 |
| ACC-54877f92c5 | 25***0032 | 184 | 64 | 120 | 0 | 0 | 34.78% | 34.78% | 156.98 / 374.48 |
| ACC-9420cfcf0a | 25***0059 | 110 | 74 | 36 | 0 | 0 | 67.27% | 67.27% | 353.05 / 911.85 |
| ACC-53691bfdec | 25***0047 | 109 | 43 | 65 | 0 | 1 | 39.45% | 39.81% | 217.49 / 688.94 |
| ACC-abde476c11 | 25***0007 | 104 | 60 | 44 | 0 | 0 | 57.69% | 57.69% | 245.12 / 870.29 |
| ACC-d5606c4f7f | 25***0153 | 77 | 44 | 33 | 0 | 0 | 57.14% | 57.14% | 159.86 / 356.87 |
| ACC-6822c546ae | 25***0165 | 71 | 46 | 25 | 0 | 0 | 64.79% | 64.79% | 254.19 / 760.72 |
| ACC-13a0fb3771 | 25***0042 | 58 | 29 | 29 | 0 | 0 | 50.00% | 50.00% | 195.23 / 527.62 |
| ACC-929c993d05 | 25***0192 | 55 | 31 | 24 | 0 | 0 | 56.36% | 56.36% | 308.07 / 935.00 |
| ACC-3e25979637 | 25***0173 | 50 | 44 | 6 | 0 | 0 | 88.00% | 88.00% | 189.93 / 458.58 |
| ACC-3cb807d27d | 25***0168 | 49 | 36 | 13 | 0 | 0 | 73.47% | 73.47% | 188.94 / 469.34 |
| ACC-10ff57beb5 | 25***0027 | 43 | 33 | 10 | 0 | 0 | 76.74% | 76.74% | 186.05 / 425.18 |
| ACC-e344f0e0fe | 25***0003 | 30 | 22 | 8 | 0 | 0 | 73.33% | 73.33% | 209.89 / 359.34 |
| ACC-eef057078f | a***n | 29 | 18 | 11 | 0 | 0 | 62.07% | 62.07% | 115.48 / 544.75 |
| ACC-f778b2788d | cl***0_02 | 28 | 27 | 1 | 0 | 0 | 96.43% | 96.43% | 56.02 / 325.45 |
| ACC-6d3d221c13 | cl***0_04 | 23 | 21 | 2 | 0 | 0 | 91.30% | 91.30% | 38.26 / 209.59 |
| ACC-0e84bfdcb6 | cl***0_03 | 22 | 21 | 1 | 0 | 0 | 95.45% | 95.45% | 46.51 / 305.13 |
| ACC-15a1bb3f35 | cl***0_05 | 22 | 22 | 0 | 0 | 0 | 100.00% | 100.00% | 39.83 / 224.76 |
| ACC-1cbfe16eb3 | cl***0_06 | 22 | 22 | 0 | 0 | 0 | 100.00% | 100.00% | 41.65 / 224.81 |
| ACC-1e970cbf72 | cl***0_09 | 22 | 20 | 2 | 0 | 0 | 90.91% | 90.91% | 53.50 / 320.25 |
| ACC-4f36809ffd | cl***0_07 | 22 | 22 | 0 | 0 | 0 | 100.00% | 100.00% | 42.55 / 181.53 |
| ACC-ee0ee16ac7 | cl***0_01 | 22 | 21 | 1 | 0 | 0 | 95.45% | 95.45% | 41.04 / 153.84 |
| ACC-992c434add | cl***0_08 | 21 | 21 | 0 | 0 | 0 | 100.00% | 100.00% | 31.98 / 182.94 |
| ACC-c450b6582e | 25***0029 | 21 | 19 | 2 | 0 | 0 | 90.48% | 90.48% | 261.64 / 928.19 |
| ACC-9f8748c5d7 | cl***0_10 | 20 | 20 | 0 | 0 | 0 | 100.00% | 100.00% | 30.66 / 156.83 |
| ACC-153bdff5e0 | cl***0_15 | 18 | 16 | 2 | 0 | 0 | 88.89% | 88.89% | 28.23 / 156.28 |
| ACC-4641ae0ef4 | cl***0_11 | 18 | 17 | 1 | 0 | 0 | 94.44% | 94.44% | 25.88 / 158.06 |
| ACC-8729ae81f7 | cl***0_14 | 18 | 17 | 1 | 0 | 0 | 94.44% | 94.44% | 31.38 / 155.64 |
| ACC-b5f4702d19 | cl***0_12 | 18 | 18 | 0 | 0 | 0 | 100.00% | 100.00% | 24.66 / 156.93 |
| ACC-dbb55557f9 | cl***0_13 | 18 | 17 | 1 | 0 | 0 | 94.44% | 94.44% | 31.03 / 183.90 |
| ACC-06847b9778 | y***s | 5 | 5 | 0 | 0 | 0 | 100.00% | 100.00% | 229.71 / 426.53 |

共31个有已建任务的账号，不代表课堂在线人数；只有拒绝请求且未建任务的账号不在本表，不能据此视为未使用或无失败。脱敏账号可能碰撞，以固定别名为准。不输出口令或真实userId。

### 逐原始选择模型成功率

| 类型 | 用户原始选择模型 | 账号数 | 任务数 | 成功 | 失败 | 取消 | 处理中 | 全部任务成功率 | 已终态成功率 | 成功耗时均值/P95秒 | 失败耗时均值/P95秒 | 成功耗时覆盖 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| image | gpt-image-2-c | 26 | 239 | 159 | 80 | 0 | 0 | 66.53% | 66.53% | 126.91 / 261.32 | 197.48 / 366.52 | 159/159 |
| image | gpt-image-2-all | 25 | 232 | 140 | 92 | 0 | 0 | 60.34% | 60.34% | 122.95 / 290.54 | 173.81 / 346.57 | 140/140 |
| image | gpt-image-2 | 28 | 225 | 180 | 44 | 0 | 1 | 80.00% | 80.36% | 87.68 / 254.54 | 131.27 / 601.01 | 180/180 |
| video | doubao-seedance-2-0 | 22 | 205 | 132 | 73 | 0 | 0 | 64.39% | 64.39% | 534.82 / 1054.79 | 27.66 / 70.25 | 132/132 |
| image | gpt-image-2-5-sunburst | 18 | 80 | 13 | 67 | 0 | 0 | 16.25% | 16.25% | 16.01 / 19.17 | 10.05 / 31.85 | 13/13 |
| video | official/seedance-2 | 16 | 73 | 27 | 46 | 0 | 0 | 36.99% | 36.99% | 354.78 / 603.97 | 70.81 / 122.35 | 27/27 |
| video | 天翼云 Seedance 2.0 | 18 | 69 | 39 | 30 | 0 | 0 | 56.52% | 56.52% | 339.76 / 509.66 | 64.02 / 550.96 | 39/39 |
| image | gpt-image-2-5-flare | 20 | 51 | 13 | 38 | 0 | 0 | 25.49% | 25.49% | 16.20 / 19.50 | 10.49 / 32.21 | 13/13 |
| video | doubao-seedance-2-0-260128 | 16 | 41 | 14 | 27 | 0 | 0 | 34.15% | 34.15% | 239.27 / 371.47 | 40.58 / 75.68 | 14/14 |
| image | gpt-image-2.5-sunburst | 20 | 36 | 27 | 9 | 0 | 0 | 75.00% | 75.00% | 77.60 / 341.96 | 57.68 / 81.97 | 27/27 |
| video | official/seedance-2-5 | 11 | 25 | 9 | 16 | 0 | 0 | 36.00% | 36.00% | 265.23 / 588.09 | 22.11 / 68.05 | 9/9 |
| video | 天翼云 Seedance 2.0 Fast | 11 | 21 | 7 | 14 | 0 | 0 | 33.33% | 33.33% | 136.31 / 227.73 | 53.31 / 605.88 | 7/7 |
| text | gpt-5.6-luna | 15 | 21 | 21 | 0 | 0 | 0 | 100.00% | 100.00% | 2.25 / 2.46 | — / — | 21/21 |
| video | doubao-seedance-2-5-260628 | 10 | 19 | 6 | 13 | 0 | 0 | 31.58% | 31.58% | 149.22 / 183.90 | 226.78 / 1800.09 | 6/6 |
| text | gpt-5.2 | 15 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 1.64 / 2.08 | — / — | 17/17 |
| text | gpt-5.6-terra | 15 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 1.81 / 5.69 | — / — | 17/17 |
| text | gpt-5.1 | 15 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 1.23 / 2.00 | — / — | 17/17 |
| text | gpt-5-mini | 15 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 3.75 / 4.65 | — / — | 17/17 |
| text | gpt-5.4-mini | 15 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 1.39 / 2.14 | — / — | 17/17 |
| text | gpt-5.4 | 15 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 1.93 / 6.21 | — / — | 17/17 |
| text | gpt-5 | 15 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 6.31 / 13.13 | — / — | 17/17 |
| text | gpt-5.5 | 15 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 3.21 / 10.35 | — / — | 17/17 |
| text | gpt-5.6-sol | 15 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 2.80 / 15.99 | — / — | 17/17 |
| image | gpt-image-2-text-to-image | 15 | 17 | 14 | 3 | 0 | 0 | 82.35% | 82.35% | 104.81 / 129.33 | 0.90 / 1.34 | 7/14 |
| video | 天翼云 Seedance 2.0 Mini | 3 | 7 | 1 | 6 | 0 | 0 | 14.29% | 14.29% | 94.79 / 94.79 | 120.72 / 615.98 | 1/1 |
| image | gpt-image-2-image-to-image | 2 | 3 | 0 | 3 | 0 | 0 | 0.00% | 0.00% | — / — | 2.47 / 3.78 | 0/0 |
| text | gpt-5-pro | 1 | 2 | 0 | 2 | 0 | 0 | 0.00% | 0.00% | — / — | 2.60 / 2.60 | 0/0 |
| text | gpt-5.4-pro | 1 | 2 | 0 | 2 | 0 | 0 | 0.00% | 0.00% | — / — | 22.86 / 40.78 | 0/0 |
| text | gpt-6-astra | 1 | 1 | 0 | 1 | 0 | 0 | 0.00% | 0.00% | — / — | 1.31 / 1.31 | 0/0 |
| text | gpt-5.5-pro | 1 | 1 | 0 | 1 | 0 | 0 | 0.00% | 0.00% | — / — | 1.63 / 1.63 | 0/0 |
| text | codex-auto-review | 1 | 1 | 0 | 1 | 0 | 0 | 0.00% | 0.00% | — / — | 1.45 / 1.45 | 0/0 |

模型按任务config.logicalModel分组，未用最终溢出后的上游名称偷换原始选择。缺该字段时明确降为诊断/当前模型回退证据；本轮此类样本0个。未实际使用的前端模型不列为0%失败，也不因此自动开关模型。

### 真实渠道×上游模型执行成功率（attempt口径）

| 类型 | 实际渠道 | 实际上游模型 | 执行次数 | 成功 | 失败 | 取消 | 执行中 | 执行成功率 | 已终态执行成功率 | 成功执行耗时均值/P95秒 | 诊断模型覆盖 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| image | 模汇X中漫 API 渠道 | gpt-image-2-all | 264 | 146 | 118 | 0 | 0 | 55.30% | 55.30% | 120.78 / 290.52 | 264/264 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-c | 256 | 156 | 100 | 0 | 0 | 60.94% | 60.94% | 119.27 / 251.51 | 256/256 |
| image | 兔子 API 渠道 | gpt-image-2 | 254 | 180 | 73 | 0 | 1 | 70.87% | 71.15% | 83.36 / 205.43 | 254/254 |
| video | 模汇X中漫 API 渠道 | [未证实] attempt记录:doubao-seedance-2-0 | 130 | 129 | 1 | 0 | 0 | 99.23% | 99.23% | 536.75 / 1052.85 | 0/130 |
| image | modelbay API 渠道 | gpt-image-2-5-sunburst | 97 | 15 | 82 | 0 | 0 | 15.46% | 15.46% | 15.95 / 19.10 | 97/97 |
| image | modelbay API 渠道 | gpt-image-2-5-flare | 77 | 16 | 61 | 0 | 0 | 20.78% | 20.78% | 17.33 / 25.75 | 77/77 |
| video | 模汇X中漫 API 渠道 | doubao-seedance-2-0 | 75 | 3 | 72 | 0 | 0 | 4.00% | 4.00% | 394.22 / 445.38 | 75/75 |
| video | modelbay API 渠道 | [未证实] attempt记录:official/seedance-2 | 57 | 25 | 32 | 0 | 0 | 43.86% | 43.86% | 359.08 / 598.89 | 0/57 |
| image | 兔子 API 渠道 | gpt-image-2.5-sunburst | 46 | 13 | 33 | 0 | 0 | 28.26% | 28.26% | 52.99 / 81.36 | 46/46 |
| video | 天翼云星辰 TokenHub 视频渠道 | [未证实] attempt记录:cdance2.0-0807 | 43 | 39 | 4 | 0 | 0 | 90.70% | 90.70% | 338.23 / 509.06 | 0/43 |
| video | 兔子 API 渠道 | doubao-seedance-2-0-260128 | 28 | 1 | 27 | 0 | 0 | 3.57% | 3.57% | 366.70 / 366.70 | 28/28 |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-0807 | 26 | 0 | 26 | 0 | 0 | 0.00% | 0.00% | — / — | 26/26 |
| video | modelbay API 渠道 | [未证实] attempt记录:official/seedance-2-5 | 24 | 9 | 15 | 0 | 0 | 37.50% | 37.50% | 264.30 / 587.40 | 0/24 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5.6-luna | 21 | 21 | 0 | 0 | 0 | 100.00% | 100.00% | 2.22 / 2.42 | 0/21 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5.2 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 1.61 / 2.04 | 0/17 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5.6-terra | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 1.78 / 5.67 | 0/17 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5.1 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 1.20 / 1.97 | 0/17 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5-mini | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 3.72 / 4.61 | 0/17 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5.4-mini | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 1.32 / 2.11 | 0/17 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5.4 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 1.89 / 6.18 | 0/17 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 6.28 / 13.09 | 0/17 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5.5 | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 3.18 / 10.32 | 0/17 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5.6-sol | 17 | 17 | 0 | 0 | 0 | 100.00% | 100.00% | 2.77 / 15.96 | 0/17 |
| video | modelbay API 渠道 | official/seedance-2 | 16 | 2 | 14 | 0 | 0 | 12.50% | 12.50% | 284.73 / 286.28 | 16/16 |
| image | modelbay API 渠道 | [未证实] attempt记录:gpt-image-2-text-to-image | 15 | 13 | 2 | 0 | 0 | 86.67% | 86.67% | 100.24 / 131.36 | 0/15 |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-fast-0807 | 14 | 1 | 13 | 0 | 0 | 7.14% | 7.14% | 84.32 / 84.32 | 14/14 |
| video | 兔子 API 渠道 | [未证实] attempt记录:doubao-seedance-2-0-260128 | 13 | 13 | 0 | 0 | 0 | 100.00% | 100.00% | 226.45 / 311.20 | 0/13 |
| video | 兔子 API 渠道 | doubao-seedance-2-5-260628 | 12 | 0 | 12 | 0 | 0 | 0.00% | 0.00% | — / — | 12/12 |
| image | 兔子 API 渠道 | [未证实] attempt记录:gpt-image-2.5-sunburst | 11 | 6 | 5 | 0 | 0 | 54.55% | 54.55% | 212.31 / 346.78 | 0/11 |
| image | modelbay API 渠道 | gpt-image-2-text-to-image | 9 | 1 | 8 | 0 | 0 | 11.11% | 11.11% | 96.29 / 96.29 | 9/9 |
| image | modelbay API 渠道 | gpt-image-2-image-to-image | 8 | 0 | 8 | 0 | 0 | 0.00% | 0.00% | — / — | 8/8 |
| video | 兔子 API 渠道 | [未证实] attempt记录:doubao-seedance-2-5-260628 | 7 | 6 | 1 | 0 | 0 | 85.71% | 85.71% | 145.86 / 183.45 | 0/7 |
| video | 天翼云星辰 TokenHub 视频渠道 | [未证实] attempt记录:cdance2.0-fast-0807 | 7 | 6 | 1 | 0 | 0 | 85.71% | 85.71% | 144.00 / 226.77 | 0/7 |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-mini-0807 | 5 | 0 | 5 | 0 | 0 | 0.00% | 0.00% | — / — | 5/5 |
| image | 模汇X中漫 API 渠道 | [未证实] attempt记录:gpt-image-2-c | 3 | 0 | 3 | 0 | 0 | 0.00% | 0.00% | — / — | 0/3 |
| image | 兔子 API 渠道 | [未证实] attempt记录:gpt-image-2 | 3 | 0 | 3 | 0 | 0 | 0.00% | 0.00% | — / — | 0/3 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5-pro | 2 | 0 | 2 | 0 | 0 | 0.00% | 0.00% | — / — | 0/2 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5.4-pro | 2 | 0 | 2 | 0 | 0 | 0.00% | 0.00% | — / — | 0/2 |
| image | modelbay API 渠道 | [未证实] attempt记录:gpt-image-2 | 2 | 0 | 2 | 0 | 0 | 0.00% | 0.00% | — / — | 0/2 |
| image | modelbay API 渠道 | [未证实] attempt记录:gpt-image-2-image-to-image | 2 | 0 | 2 | 0 | 0 | 0.00% | 0.00% | — / — | 0/2 |
| video | 天翼云星辰 TokenHub 视频渠道 | [未证实] attempt记录:cdance2.0-mini-0807 | 2 | 1 | 1 | 0 | 0 | 50.00% | 50.00% | 94.13 / 94.13 | 0/2 |
| text | 昱梦渠道 gpt | [未证实] attempt记录:gpt-6-astra | 1 | 0 | 1 | 0 | 0 | 0.00% | 0.00% | — / — | 0/1 |
| text | 模汇x中漫 API gpt文本 | [未证实] attempt记录:gpt-5.5-pro | 1 | 0 | 1 | 0 | 0 | 0.00% | 0.00% | — / — | 0/1 |
| text | 昱梦渠道 gpt | [未证实] attempt记录:codex-auto-review | 1 | 0 | 1 | 0 | 0 | 0.00% | 0.00% | — / — | 0/1 |
| image | modelbay API 渠道 | [未证实] attempt记录:gpt-image-2-all | 1 | 0 | 1 | 0 | 0 | 0.00% | 0.00% | — / — | 0/1 |
| video | modelbay API 渠道 | official/seedance-2-5 | 1 | 0 | 1 | 0 | 0 | 0.00% | 0.00% | — / — | 1/1 |

共1689次attempt；一个任务失败后尝试备用渠道会有多次attempt，不能与1524个任务分母混用。优先按同channelId且在attempt时间范围内的provider_start/上游或内部传输诊断确定模型；缺失时明确标“未证实”并保留attempt记录与modelBasis，不把不可靠的记录模型冒充真实上游。这是平台执行尝试，包括内部403拒绝，**不是全部已发送上游的HTTP请求**。

### 全窗口失败原因分组（任务口径）

| 证据分组 | 失败任务数 | 占失败比例 | 代表任务ID |
| --- | ---: | ---: | --- |
| 其他后台失败，见任务证据 | 261 | 45.95% | 4bc588ae-91a6-42d0-91ba-f65b13f5f5dc、c4bf0774-0adc-4ff0-9976-da6f200a4f1b |
| 上游不接受response_format参数 | 114 | 20.07% | 93949b07-9274-48b8-8ef5-ca073e1ec89e、877db1e8-b237-4400-bb5c-07891789f65f |
| 最终403，具体链路待确认 | 64 | 11.27% | 3281dccb-6054-49ea-b959-1f47d3eb497c、d4289417-63ef-4e78-bb12-29d0623d1611 |
| 模汇异步URL格式契约不匹配 | 55 | 9.68% | 3969f8fa-6174-44a4-b96f-8060e51c40d0、9bf27f74-5ed2-4622-8203-294c7ba6151a |
| 上游504后备用请求403 | 43 | 7.57% | f7992a52-1ab9-40de-8bdf-5cba6b1eccce、9454de8f-9c7d-46a5-bfce-4b92c50cb39b |
| 上游模型拒绝参考视频输入 | 11 | 1.94% | c0ee98d1-57dd-4550-85f6-5f5484a3b67f、1781e2e9-203f-42aa-af97-643e1c389afc |
| 上游连接超时后备用请求失败 | 7 | 1.23% | a5195906-c5b4-4c1c-b3ab-d7b30ffe683e、b466e7ac-7cd9-4215-991e-21bd07a397e6 |
| 平台图片比例校验拒绝 | 4 | 0.70% | 4565b219-aeca-4e56-a4a3-e89f5a44251f、af53f7fb-b90f-40e5-a3a5-5fbbfcd82e25 |
| 平台参考图大小保护拒绝 | 3 | 0.53% | c7f8f4a1-dc87-4444-beb1-ab7c267c156a、79048b25-72b6-4be4-b97f-bdf0c23bceb9 |
| 响应正文读取超时 | 3 | 0.53% | da3a25fa-ee9b-48c9-b8d3-34c4a0e1677d、27e81657-072d-4ada-b0f4-c76ad311ef74 |
| 上游内容拒绝 | 2 | 0.35% | ece864d7-ac25-48b6-aa64-fbfa604fdb66、1af10e67-93dc-465e-a7bf-737cd17b4469 |
| 响应正文中断后备用请求失败 | 1 | 0.18% | 299dfb88-f33c-4dcc-b5f0-b36fdbd6c080 |

分组小计严格等于568个失败任务，与本节整体表同一快照；结合每次attempt和已存诊断，不只看最终文案。只有证据明确时才给出连接/正文/上游等阶段；“待确认”不冒充根因已查明。此表不受基础监控最近200条明细限制，也不把一次任务的多次失败attempt当成多个失败任务。

### 耗时、拒绝与核对口径

- 完整任务耗时=匹配generation_logs.completed_at减generation_task.created_at；不拿最后attempt耗时或updated_at冒充完整完成耗时。
- 成功完整耗时覆盖948/955，失败覆盖564/568。缺完成日志则留空；成功缺日志7个、失败缺日志4个，不填0秒。
- 渠道表耗时仅为attempt.startedAt→completedAt；与完整任务耗时分开。
- 所有任务按id去重，非空clientRequestId重复组0个。账号和模型表总数、成功/失败均与整体同源快照对账。
- HTTP503/400等拒绝目前只有Nginx时间/路径/状态证据，未保留可靠账号/原始模型/幂等身份，不能伪造逐账号归属，也不能将访问日志次数直接相加到去重任务分母。
- 详细表格附account-summary.csv/json、model-summary.csv/json、channel-attempt-summary.csv/json、task-timing-details.csv/json、metrics-summary.json。持续更新，不是最终下课报告。

<!-- END LIVE SUCCESS TABLES -->


课堂创建任务截止20:51:47，434笔任务已全部终态。冻结统计与复盘见production-classroom-final-report.zh-CN.md及classroom-final-metrics-source.json。下方滚动表为14:30起现场任务，包含课后新提交，不再代表课堂冻结分母；保留采样用于本次授权发布的健康观察。

**不是下课总结，不是修复完成报告。**

- 站点：gammatv.gammablue-x.com；服务器：8.163.33.161；主机名：iZ7xv3m126dvh9imua5dz2Z。
- 监控启动：北京时间2026-10-21 14:41；只读数据回看窗口从14:30开始。
- 最近有效采样：北京时间 **2026-10-23 09:57:21**；已保存3499次快照，计划每轮结束后30秒再采，网络/系统命令耗时另计。
- 当前镜像：ghcr.io/lishen331/vozeb-pro:sha-232737aadaafb96d001da3699484b8d67c928483；settings revision=97。
- 仅SSH只读SQL、日志、指标与健康检查。没有重启、部署、改路由、修改积分/节点/配置，没有发任何付费生成或压测请求。

## 当前任务概况（创建于14:30后的数据库任务）

成功954，任务失败568，仍运行/排队1；最长活动任务年龄52秒。任务年龄只是观察值，未据此直接判超时。涉及31个已建任务用户，不代表在线人数。HTTP503等未建任务拒绝不在这个分母内。

| 类型 | 实际渠道 | logicalModel | 当前上游模型 | 状态 | 数量 |
| --- | --- | --- | --- | --- | --- |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-fast-0807 | cdance2.0-fast-0807 | error | 14 |
| image | modelbay API 渠道 | gpt-image-2 | gpt-image-2-image-to-image | error | 2 |
| text | 模汇x中漫 API gpt文本 | gpt-5.6-luna | gpt-5.6-luna | success | 21 |
| video | 兔子 API 渠道 | doubao-seedance-2-0-260128 | doubao-seedance-2-0-260128 | error | 27 |
| image | modelbay API 渠道 | gpt-image-2.5-sunburst | gpt-image-2-5-sunburst | error | 2 |
| image | 模汇X中漫 API 渠道 | gpt-image-2 | gpt-image-2-c | error | 4 |
| video | 兔子 API 渠道 | doubao-seedance-2-5-260628 | doubao-seedance-2-5-260628 | error | 13 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-all | gpt-image-2-all | error | 46 |
| video | modelbay API 渠道 | official/seedance-2-5 | official/seedance-2-5 | error | 16 |
| text | 模汇x中漫 API gpt文本 | gpt-5.4-mini | gpt-5.4-mini | success | 17 |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-mini-0807 | cdance2.0-mini-0807 | success | 1 |
| text | 模汇x中漫 API gpt文本 | gpt-5.4 | gpt-5.4 | success | 17 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-c | gpt-image-2-all | success | 5 |
| image | modelbay API 渠道 | gpt-image-2-5-flare | gpt-image-2-5-flare | error | 38 |
| image | modelbay API 渠道 | gpt-image-2.5-sunburst | gpt-image-2-5-sunburst | success | 2 |
| image | modelbay API 渠道 | gpt-image-2-text-to-image | gpt-image-2-text-to-image | success | 14 |
| image | modelbay API 渠道 | gpt-image-2-c | gpt-image-2-5-sunburst | error | 5 |
| text | 昱梦渠道 gpt | gpt-6-astra | gpt-6-astra | error | 1 |
| image | modelbay API 渠道 | gpt-image-2-c | gpt-image-2-5-flare | success | 1 |
| image | 兔子 API 渠道 | gpt-image-2-c | gpt-image-2.5-sunburst | error | 8 |
| image | modelbay API 渠道 | gpt-image-2-all | gpt-image-2-5-sunburst | error | 5 |
| image | modelbay API 渠道 | gpt-image-2-all | gpt-image-2-image-to-image | error | 2 |
| image | 模汇X中漫 API 渠道 | gpt-image-2.5-sunburst | gpt-image-2-c | success | 2 |
| image | modelbay API 渠道 | gpt-image-2-c | gpt-image-2-text-to-image | error | 1 |
| image | modelbay API 渠道 | gpt-image-2-all | gpt-image-2-5-flare | error | 6 |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-0807 | cdance2.0-0807 | error | 30 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-c | gpt-image-2-all | error | 13 |
| image | 模汇X中漫 API 渠道 | gpt-image-2 | gpt-image-2-c | success | 3 |
| image | 兔子 API 渠道 | gpt-image-2-c | gpt-image-2 | success | 3 |
| image | 兔子 API 渠道 | gpt-image-2 | gpt-image-2 | success | 176 |
| image | 兔子 API 渠道 | gpt-image-2 | gpt-image-2.5-sunburst | error | 6 |
| image | modelbay API 渠道 | gpt-image-2-5-sunburst | gpt-image-2-5-sunburst | error | 67 |
| image | modelbay API 渠道 | gpt-image-2.5-sunburst | gpt-image-2-image-to-image | error | 3 |
| image | 兔子 API 渠道 | gpt-image-2-c | gpt-image-2 | error | 14 |
| image | modelbay API 渠道 | gpt-image-2.5-sunburst | gpt-image-2-5-flare | success | 2 |
| video | 兔子 API 渠道 | doubao-seedance-2-0-260128 | doubao-seedance-2-0-260128 | success | 14 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-all | gpt-image-2-c | success | 1 |
| image | 兔子 API 渠道 | gpt-image-2 | gpt-image-2 | running | 1 |
| image | modelbay API 渠道 | gpt-image-2.5-sunburst | gpt-image-2-text-to-image | error | 2 |
| text | 模汇x中漫 API gpt文本 | gpt-5.4-pro | gpt-5.4-pro | error | 2 |
| image | 兔子 API 渠道 | gpt-image-2 | gpt-image-2 | error | 8 |
| text | 模汇x中漫 API gpt文本 | gpt-5-pro | gpt-5-pro | error | 2 |
| image | 兔子 API 渠道 | gpt-image-2.5-sunburst | gpt-image-2.5-sunburst | success | 19 |
| image | modelbay API 渠道 | gpt-image-2-5-sunburst | gpt-image-2-5-sunburst | success | 13 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-c | gpt-image-2-c | error | 29 |
| image | modelbay API 渠道 | gpt-image-2-5-flare | gpt-image-2-5-flare | success | 13 |
| image | 兔子 API 渠道 | gpt-image-2-image-to-image | gpt-image-2.5-sunburst | error | 2 |
| text | 模汇x中漫 API gpt文本 | gpt-5 | gpt-5 | success | 17 |
| image | 兔子 API 渠道 | gpt-image-2-all | gpt-image-2.5-sunburst | error | 6 |
| video | 模汇X中漫 API 渠道 | doubao-seedance-2-0 | doubao-seedance-2-0 | success | 132 |
| text | 模汇x中漫 API gpt文本 | gpt-5.6-sol | gpt-5.6-sol | success | 17 |
| text | 模汇x中漫 API gpt文本 | gpt-5.6-terra | gpt-5.6-terra | success | 17 |
| image | modelbay API 渠道 | gpt-image-2 | gpt-image-2-5-sunburst | error | 3 |
| image | modelbay API 渠道 | gpt-image-2-text-to-image | gpt-image-2-5-flare | error | 1 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-c | gpt-image-2-c | success | 150 |
| text | 模汇x中漫 API gpt文本 | gpt-5.2 | gpt-5.2 | success | 17 |
| image | modelbay API 渠道 | gpt-image-2-all | gpt-image-2-text-to-image | error | 3 |
| video | 兔子 API 渠道 | doubao-seedance-2-5-260628 | doubao-seedance-2-5-260628 | success | 6 |
| text | 模汇x中漫 API gpt文本 | gpt-5.5 | gpt-5.5 | success | 17 |
| video | modelbay API 渠道 | official/seedance-2 | official/seedance-2 | success | 27 |
| image | 模汇X中漫 API 渠道 | gpt-image-2 | gpt-image-2-all | error | 11 |
| text | 模汇x中漫 API gpt文本 | gpt-5-mini | gpt-5-mini | success | 17 |
| video | modelbay API 渠道 | official/seedance-2-5 | official/seedance-2-5 | success | 9 |
| text | 昱梦渠道 gpt | codex-auto-review | codex-auto-review | error | 1 |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-fast-0807 | cdance2.0-fast-0807 | success | 7 |
| text | 模汇x中漫 API gpt文本 | gpt-5.5-pro | gpt-5.5-pro | error | 1 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-text-to-image | gpt-image-2-all | error | 1 |
| image | 模汇X中漫 API 渠道 | gpt-image-2.5-sunburst | gpt-image-2-all | success | 2 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-all | gpt-image-2-c | error | 10 |
| image | modelbay API 渠道 | gpt-image-2-image-to-image | gpt-image-2-image-to-image | error | 1 |
| image | 兔子 API 渠道 | gpt-image-2-all | gpt-image-2 | error | 14 |
| image | modelbay API 渠道 | gpt-image-2-c | gpt-image-2-5-flare | error | 10 |
| image | modelbay API 渠道 | gpt-image-2-text-to-image | gpt-image-2-text-to-image | error | 1 |
| text | 模汇x中漫 API gpt文本 | gpt-5.1 | gpt-5.1 | success | 17 |
| video | modelbay API 渠道 | official/seedance-2 | official/seedance-2 | error | 46 |
| image | modelbay API 渠道 | gpt-image-2 | gpt-image-2-text-to-image | error | 4 |
| video | 模汇X中漫 API 渠道 | doubao-seedance-2-0 | doubao-seedance-2-0 | error | 73 |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-mini-0807 | cdance2.0-mini-0807 | error | 6 |
| image | 兔子 API 渠道 | gpt-image-2.5-sunburst | gpt-image-2.5-sunburst | error | 2 |
| image | 模汇X中漫 API 渠道 | gpt-image-2-all | gpt-image-2-all | success | 139 |
| video | 天翼云星辰 TokenHub 视频渠道 | cdance2.0-0807 | cdance2.0-0807 | success | 39 |
| image | modelbay API 渠道 | gpt-image-2 | gpt-image-2-5-flare | error | 6 |

## 系统与进程

- 健康ready=true；Worker健康=true。
- 主机最近采样CPU=10%；观测样本峰值=53.27%；最近可用内存约5913MiB，样本最低可用内存约5300MiB。
- 根盘实际used/total约58.62%，剩余约18.01GiB；与df按available计算的显示口径不同，不混作增长。
- 容器重启/OOM：/vozeb-pro restarts=0 oom=false；/vozeb-pro-generation-worker restarts=0 oom=false；/vozeb-pro-postgres restarts=0 oom=false。
- PostgreSQL当前阻塞连接数=0；连接按state计数与磁盘/网络增量已在快照保留。

| 容器 | CPU瞬时值 | 内存 | 网络累计 | 磁盘累计 |
| --- | --- | --- | --- | --- |
| vozeb-pro | 0.01% | 512.7MiB / 7.282GiB | 1.89GB / 1.48GB | 5.73MB / 9.96MB |
| vozeb-pro-generation-worker | 0.00% | 38.08MiB / 7.282GiB | 13.9MB / 7.31MB | 0B / 0B |
| vozeb-pro-postgres | 7.20% | 281.1MiB / 7.282GiB | 3.99GB / 25.7GB | 232MB / 8.25GB |

快照为采样，不证明采样间绝无峰值。仅检查自容器启动以来RestartCount/OOMKilled，不等于宿主机历史从未重启。

## 已确认异常与证据

### 1. 模汇异步接口与b64格式冲突（历史故障；当前兼容性已复核）

14:32有3例，14:46再次发生。代表任务896760e0-1506-4ae6-826f-1d11dea3ee39：

- upstream_request记录实际response_format=b64_json、output_format=png，有3张参考图。
- upstream_response HTTP400，requestId=20261021064624088287871RGbRorvJMgDnwsJt。
- 原始安全错误：image async only supports response_format=url; use the synchronous endpoint for b64_json。
- 这是已到上游的请求契约错误，不是内存不足或未转发。当前同模型也有成功，不扩大为该模型全部不可用。
- 2026-10-21 17:48:25复核：最后观测到此类上游格式拒绝为16:48:36.688；其后模汇本渠道单次attempt、实际response_format=b64_json的33笔均完整成功，其中gpt-image-2-all为18/18、gpt-image-2-c为15/15。该33笔是有明确时间边界的已观察样本，不是所有输入/并发的普遍保证。详见mohui-b64-post-change-verification.json。
- 当前不再把“为绕开此报错而强制改URL”作为必做上线修复；显式URL配置仅保留为按需选项，监控方未改线上配置。支持b64不代表正文慢读问题消失，不能外推到ModelBay。

### 2. 两次Sunburst错误由兔子连接超时后平台内部403组成（已确认）

代表任务b466e7ac-7cd9-4215-991e-21bd07a397e6，另一个a5195906-c5b4-4c1c-b3ab-d7b30ffe683e。

- 兔子首attempt：UND_ERR_CONNECT_TIMEOUT，api.tu-zi.com:443，10000ms；平台映射为502。连接阶段没有获得上游业务响应，不能说是下载失败。
- 后续attempt切ModelBay，当前上游名gpt-image-2-5-sunburst，内部transport_response HTTP403，安全原文“该上游模型未绑定可用逻辑模型”。
- 该attempt没有相应upstream_request/response，403来源为平台内部准入，不据此归罪ModelBay上游或OSS。
- 当时revision94存在两个不同logicalModel：gpt-image-2.5-sunburst绑定兔子，gpt-image-2-5-sunburst绑定ModelBay。具体修复交给路由负责人，本次只留证，不改溢出。

### 3. 兔子上游内容拒绝（已确认）

任务ece864d7-ac25-48b6-aa64-fbfa604fdb66，14:39提交；upstream_response HTTP400有requestId，错误明确为上游内容政策拒绝。本次不保留学生提示词或图片，不把它算成平台传输异常。

### 4. 新增上游参数拒绝与504（已确认）

- ModelBay gpt-image-2-5-flare在14:53两笔HTTP400，原文Unknown parameter: response_format；之后gpt-image-2-5-sunburst也出现相同错误。modelbay-unsupported-parameter-evidence.json保留真实出站参数白名单与upstream_response，不把它称为未发送请求或OSS错误。建议按具体端点省略不支持字段，不能因模汇要求url就对所有渠道硬塞相同参数。
- 任务f7992a52-1ab9-40de-8bdf-5cba6b1eccce于14:47:06提交：模汇images/edits在约309秒后真实返回上游HTTP504 HTML；随后切ModelBay遇平台内部逻辑模型准入403。这是两个阶段的故障，不只归因为最终403。long-task-f799-evidence.json保留attempt及诊断。

### 5. HTTP准入503、媒体429与其他API错误（待进一步逐请求关联）

此前保留的Nginx有界tail15000行截面（不是当前分钟实时总数），匹配窗口2026-10-21 16:35:49–2026-10-21 17:54:38，POST /api/image-tasks返回200计103次、503计0次。历史15:10保存的访问证据已确认14:33–14:37至少41次503；旧记录滑出当前tail不代表历史失败归零。该采样不是完整去重生成样本分母，不把轮询或重试计为独立任务。GET /api/media-proxy有0次429；DELETE /api/canvas/projects有0次500。这些状态的具体时刻另见other-api-errors-evidence.json，当前没有匹配到可靠后台异常栈，原因不臆测。

这些是平台代理访问记录，不足以单独证明具体模型/渠道根因。特别是任务成功率不能忽略未建任务拒绝，也不能把503等同于上游429。保留错误时间/路径/状态，不保存客户端IP、请求正文或query。

### 6. 兔子HTTP200后正文慢读至超时，随后备用内部403（17:38已取到终态）

任务da3a25fa-ee9b-48c9-b8d3-34c4a0e1677d，17:27:58提交，17:38:02失败，完整603.492秒。兔子gpt-image-2的requestId=4d6f6eac；约51.8秒收到HTTP200响应头，随后正文读取547.908秒，累计5362317字节仍未完成，内部传输599.995秒超时取消。idleMs=4657，说明取消前约4.7秒仍收到过数据，不能说首字节后一直完全断流。后续自动备用模汇gpt-image-2-all被内部“该上游模型未绑定可用逻辑模型”403拒绝，没有该attempt的上游请求/响应证据。详见body-read-timeout-da3a-analysis.zh-CN.md和body-read-timeout-da3a-detail.json。监控方未取消、改状态或重发；最终403不能掩盖首次正文读取超时。

## 失败链路去重补充（2026-10-23 09:57:21）

截至当前快照失败568笔。以下分类基于当前最近最多200个任务的安全明细及已捕获定向证据；全窗口总量来自数据库聚合。明细覆盖失败68笔／窗口失败568笔。覆盖不足时不把分类小计冒充全窗口分类。按attempt链条和定向确认文件分类，不只看最终错误：

- 模汇异步要求URL但发送b64：0笔。
- ModelBay拒绝response_format参数：4笔。
- 上游504后备用请求遇内部403：0笔。
- 已定向确认2笔兔子连接超时后内部403，证据在confirmed-failure-chains.json；该数字是已确认案例数，不是对未来新增相同案例设定固定总数。当前最近明细中内容拒绝0笔。以上仅此时窗口分组，不作最终课堂结算，也不忽略未建任务拒绝。

## 账务观察与任务终态（仍非下课结算）

最新窗口积分流水汇总：consume 1537笔 / -1537积分；refund 571笔 / 571积分。流水按发生时间窗口汇总，不是逐task完整财务审计；不能将attempt失败次数直接当应退积分次数，也没有据此人工加减积分。观察到活动任务归零仍不代表已经下课，监控继续。

## 进一步确认：HTTP200后正文中断与参考图大小保护

- 任务299dfb88-f33c-4dcc-b5f0-b36fdbd6c080，16:07:48提交兔子gpt-image-2：upstream_response HTTP200，requestId=5dfa60d0；随后upstream_body_exception记录UND_ERR_SOCKET、terminated、cause=other side closed，已读5,217,887字节，正文读取耗时344,749ms。平台映射502，再尝试模汇时内部403。此处HTTP200只证明响应头已到，不证明完整JSON/图片已交付；根因定位到响应正文传输中断，具体由哪一层连接关闭还未证实，不归因Mac或整渠道不可用。
- 三笔任务c7f8f4a1-dc87-4444-beb1-ab7c267c156a、79048b25-72b6-4be4-b97f-bdf0c23bceb9、d0f3a586-87c2-46dd-aa80-edac2e4c801f在16:00:42–54提交后约0.1秒报“参考图过大，请压缩后重试”；没有相应upstream_request/response。已核对部署SHA对应代码，该错误来自准备参考文件时的既有20MiB上限检查，不是已证实的上游模型拒绝。实际参考图字节在本次日志/引用元数据中缺失，不能凭文案编造大小。
- 只读证据：body-interruption-and-large-reference-evidence.json。监控方未重新生成、未改阈值、未将这些失败写成成功。

## 新观察：画布保存HTTP409（待请求版本证据）

16:00:09–16:00:28，同一画布canvas-5QmyNt1tSGz8l0lUgH34M的PATCH /api/canvas/projects/:id在访问日志有7次409。canvas-save-conflicts-evidence.json保留时刻、路径和状态，不保存客户端IP或请求正文。已核对部署SHA 2b99976f对应的PATCH保存源码，409可由项目版本条件不匹配产生（expectedUpdatedAt或mutation.baseUpdatedAt，对比服务器版本，mutationId用于幂等）。当前缺少当时请求的这些字段、服务器当时版本、响应JSON及页面会话，不能仅凭409确认是多设备冲突或客户端保存缺陷。此类保存异常与生图失败分开，不能加进模型成功率分母；未改学生项目。

## 失败任务观察分类（按taskId去重）

| 观察分类 | 数量 | 代表任务ID |
| --- | --- | --- |
| async-response-format-contract | 55 | 896760e0-1506-4ae6-826f-1d11dea3ee39、2ded0cfd-d9e7-43fa-a479-5fc6b85e4e0f、9bf27f74-5ed2-4622-8203-294c7ba6151a、3969f8fa-6174-44a4-b96f-8060e51c40d0 |
| upstream-content-rejection | 1 | ece864d7-ac25-48b6-aa64-fbfa604fdb66 |
| http403-stage-needs-correlation | 113 | b466e7ac-7cd9-4215-991e-21bd07a397e6、a5195906-c5b4-4c1c-b3ab-d7b30ffe683e、f7992a52-1ab9-40de-8bdf-5cba6b1eccce、9454de8f-9c7d-46a5-bfce-4b92c50cb39b |
| unsupported-response-format | 114 | 93949b07-9274-48b8-8ef5-ca073e1ec89e、877db1e8-b237-4400-bb5c-07891789f65f、0675cbb6-04a1-4462-8718-11e2c8c2047c、84c228c8-c5d7-48a6-950f-ea661a379a5b |
| other-backend-error | 198 | c7f8f4a1-dc87-4444-beb1-ab7c267c156a、d0f3a586-87c2-46dd-aa80-edac2e4c801f、79048b25-72b6-4be4-b97f-bdf0c23bceb9、1af10e67-93dc-465e-a7bf-737cd17b4469 |
| upstream-quota | 44 | 3281dccb-6054-49ea-b959-1f47d3eb497c、ff5d4d4f-fae9-4a16-ba8e-664f56397a6f、1a763ebf-71b2-4344-b049-17ee85f9903d、d70f11c9-7df8-4165-8d01-8d7bb720fee8 |
| stack-overflow | 31 | 1331d006-2bdb-4554-bdcd-80155142bcef、5b04f370-e08e-427c-bc8e-34dec393c1f2、b5d030f4-f302-4265-b689-7f80b8908b13、0a41185c-4696-4a66-80f8-889ea1347334 |
| rate-limit | 2 | 9489b3af-3b3f-4951-9202-1cb362859e78、58da0356-ea57-4737-8d88-d0498b4d50ee |
| timeout-stage-needs-correlation | 10 | 2e3cf83a-0689-4274-b32f-80ddaf2eb9de、742ac982-1580-40af-8915-bc5162f761d2、6ac4ef48-493a-49d5-b85a-457bb7355faf、da83e1ef-bff7-4399-b423-1ea65850df16 |

http403-stage-needs-correlation为监控自动初分；上文已使用完整诊断进一步确认这两笔为内部逻辑模型准入403。不能直接把初分标签当最终根因。

## 实际课堂能力范围

15:05只读input-mode-breakdown.json核对：该时点本窗口已建图片任务均为kind=edit且references非空，含1–5张参考；不是纯文生图。因而带图错误与课堂实际使用直接相关，不能用其他输入能力或上午补样成功代替当前能力验收。该次分组按任务当前最终渠道统计，不能冒充最初所选渠道的独立成功率，也没有因此自动隐藏模型。

## 配置变化与节点持久化抽查（不得过度归因）

- 采样观察到settings revision在14:48:50为94、14:49:25为95，说明外部有配置变化；监控方没有执行写入。不把前后样本混作配置一直未变。
- 14:54只读抽查24个成功任务，24个均有持久化结果且项目存在；14个可在当前画布中按相同结果/任务关系直接匹配成功图片节点。另10个经定向核对，8个原节点当前已不在项目中，2个已被同原节点的更新任务替换；不能仅凭未匹配就断言前端回写失败，也不擅自恢复学生可能删除/替换的节点。本项是数据库现状抽查，不声称逐个浏览器看图通过。

19:43补充性能对照：兔子双参考图任务3fb020a5-9a7c-4aba-a79a-90c357435b76完整486.608秒，正文426.084秒、1814898字节；随后另一笔双参考图059bb1b8-9215-4295-9b1f-61235372c049完整60.868秒，正文5.002秒、3340534字节，均后台成功。不能单按体积/参考图数量解释，也未证实具体上游或网络层根因；详见tuzi-multireference-latency-comparison-1943.zh-CN.md。

## 20:01–20:02新增图片比例校验失败

四笔任务4565b219-aeca-4e56-a4a3-e89f5a44251f、af53f7fb-b90f-40e5-a3a5-5fbbfcd82e25、846d5467-57ed-4f53-9186-c2269e0d9619、58ce7c95-baf6-4e2d-a98c-621a2bee0834保存的config.size均为"00:00"，均带2张参考图，横跨兔子gpt-image-2及模汇gpt-image-2-c。provider_exception明确为“图片比例必须是正数，例如 9:16”，两类出站请求事件计数均为0；这是平台出站前参数校验，不是上游返回失败，也不是Mac兼容性证据。无效值来自哪一个界面/转换步骤尚未查明，不归咎用户。

四笔均缺少规范image-task:<id>完成日志，完整失败耗时留空；不拿updated_at代替，也不据此推断扣费/退款。完整证据与建议见image-ratio-zero-validation-2001.zh-CN.md，未修改生产。

## 课堂视频与诊断保留盲区

19:59创建的两笔模汇doubao-seedance-2-0视频于20:04成功：35a66748-eabf-45f3-825f-a9e93e5404b2完整281.164秒，0d832b43-a32c-40e2-9e9f-4190ce3ea0e3完整251.833秒。20:18只读核对均task/log=success且result.url非空、mimeType=video/mp4；不冒充已逐浏览器播放验收。20:22追加终态：20:03模汇视频67d370de-324d-4ba8-9b47-dcc3c3d7af2e成功，完整906.078秒（约15分06秒）；20:15 ModelBay official/seedance-2视频5d7717b0-4b08-40ae-b27e-bed51f8e7760成功，完整335.861秒。最新两笔原节点均status=success且serverUrl与任务结果匹配；前两笔原节点当前不存在，不能据此断言回写失败或擅自恢复。轮询HTTP200和小JSON正文读取完成不等于视频生成成功。模汇长等待发生在异步结果轮询阶段，不把后台成功当成无性能问题。

部署源码诊断保留预算为JSON序列化20KiB，超预算保留首条并逐次删除第二条；视频轮询body事件可挤掉初始submit/request/response锚点。不是固定56条上限，也不是“没发送”。已从本机早期快照保全四笔视频初始链路，不额外请求上游。详见video-diagnostic-retention-and-lifecycle-2018.zh-CN.md；本机归档补救不等于已修复线上诊断保留策略。

## Mac浏览器支线

19:00访问采样已观察到Mac-UA生成提交：一组Mac Chrome130特征的4次POST，按同画布、同秒创建且候选唯一与后台任务关联。至少已有模汇和兔子的成功任务；18:46失败任务8ebfe9dc-41c2-41d1-8a7b-61f68cd0b2cc明确是兔子连接超时后备用内部绑定403，不是该浏览器没有发出请求。关联规则与证据见mac-generation-correlation-1900.json；UA不等于已核验物理设备，仍不确认截图中人员身份，也不把结论外推至旧Safari。mac-browser-preliminary-analysis.zh-CN.md已保留早期“未观察到POST”的历史窗口并追加最新进展。监控方未为排查点击付费生成。

19:07最初四笔终态已补齐，见mac-generation-correlation-1907.json；19:51访问采样已进一步关联7笔（6成功、1失败），见mac-generation-correlation-1951.json，仍不将其视作所有Mac的总体成功率。额外性能观察：18:58的兔子任务ae9c318b-6ec4-4450-8e65-1068b470429a最终成功，但完整361.694秒中318.023秒用于服务器读取上游正文，3831548字节；不能归因Mac本地页面卡顿，也不能把慢成功计作失败。更细的上游/网络层原因未证实，详见tuzi-slow-success-ae9c-analysis.zh-CN.md。

## 20:33–20:42连续巡检与访问层观察

本机完整复核该段17个已捕获快照，最大采样间隔34.873秒，应用和Worker均ready/healthy，无新增生成任务或失败、无容器重启/OOM/数据库阻塞；CPU采样0–10.05%，MemAvailable最低约5833.6MiB、磁盘47.78–47.79%，配置revision保持95。此为采样证据，不冒充无间隙全量日志。

访问层仍有独立4xx：20:35:25的GET /autodiscover/autodiscover.json返回404；20:36:22、26、31的GET /api/model-catalog各返回401。部署SHA对应目录接口在getCurrentUser无用户（含捕获异常后置null）时返回401，现有访问证据没有该请求的Session和鉴权详细原因，不足以认定学生登录失效、数据库错误或某台Mac故障，也不能先当作正常匿名访问而丢弃。监控方未发起这些目录请求；不将它们添加到图片任务失败率分母。

白名单证据monitor-window-audit-latest.json与proxy-4xx-followup-2043.json。前者来自有界日志快照且lookback可能重叠，出现次数不是去重请求数；后者从Nginx访问尾部定向核对时间/方法/去查询串路径/状态，不含IP或凭据。继续观察是否出现真实登录用户关联证据，未为此变更鉴权。

## 本机监控工具异常与修复（不计入学生生成失败）

16:24:32有一轮报告进程读取尚未写完的latest.json发生JSON解析错误，错误原文保存在reporter-alerts.jsonl；后台业务采样与生产服务当时仍在运行，后续刷新恢复。16:31:30将本机快照改为临时文件+原子替换，并只重启本机采样Node进程以加载代码，保留任务去重状态和cycle编号。重载前后采样时刻16:31:22.637与16:31:30.401，间隔约7.8秒；没有重启生产容器。

Windows并发读文件可能令rename返回EPERM/EBUSY；现在遇共享锁保留旧完整快照，记录publication-deferred，交由下一次正常采样发布，不额外重试上游。并发自测40次发布尝试：7次成功替换、33次保留旧快照，48次JSON并发读取零解析失败；后续正常运行采样和统计核对继续通过。测试证据atomic-snapshot-selftest-result.json与local-sampler-restart-atomic.json。该问题属于监控工具，不是应用生成任务错误，不混进模型或账号失败率。

20:37:21完整统计捕获发生单轮本机metrics-capture-failed；保留的400字符错误摘要在具体异常原因之前被截断，不能据此确认为网络/数据库/JSON解析根因。背景生产快照采样未重启，该轮业务任务计数也未变化；20:46:04完整统计已恢复至432任务且后续独立核对通过。该采集缺口属于监控工具，不计入学生失败，也不能声称整轮所有采集步骤零异常。证据local-metrics-capture-gap-2037.json。

20:45:13另从本机对生产公网GET /api/health/ready做只读探测：HTTP200、ready/Worker均true，完整探测201毫秒。此结果仅证明当时本机到公网入口的该健康路径可达，不保证所有客户端网络、登录态、媒体路径或模型能力均正常；证据public-health-probes.jsonl。未为此发起生成或登录。

## 23:06本机滚动报告读取恢复

快照文件增长后，一次性读取为JavaScript字符串触发长度上限，导致滚动报告一度陈旧；基础采样与冻结课堂统计不受影响。现改为逐行聚合，6项自测与恢复后统计校验通过。不得把Sampler/生产健康误作报告更新健康。详见local-report-streaming-recovery-2306.zh-CN.md及JSON证据；未删除快照或重启生产。

## 证据保存与边界

本机证据目录：C:/Users/admin/Downloads/VOZEB-classroom-monitor-20261021-1441。

- snapshots.jsonl / latest.json：只读数据库任务/attempt/诊断白名单、容器/内存/CPU/磁盘/网络、健康与有界日志信号。
- task-changes.jsonl：任务状态变化；alerts.jsonl：首次观察失败，不代表故障发生在监控启动之后。
- modelbay-unsupported-parameter-evidence.json / long-task-f799-evidence.json / canvas-result-persistence-check.json / canvas-unmatched-targets.json：补充参数、长任务和节点状态只读证据。
- confirmed-failure-chains.json：具体失败task的参数白名单、cause、requestId及相关绑定；没有API Key、口令、Cookie、参考图正文。
- access-audit-1450.json：Nginx503按分钟及安全路径证据；有界tail，不作全量总数声明。
- heartbeat.json / monitor-runtime.json：采样时刻与进程身份；monitor-errors.jsonl如存在表示监控采样自身错误，不是直接业务故障。

本机report-watch对采样进程退出、采样过期、应用/Worker健康、OOM、容器重启和数据库阻塞做独立自检，结果写入watchdog-latest.json与watchdog-events.jsonl；不重启任何生产服务。原始快照/指标采样并不等于浏览器全部交互验收。

本记录持续更新；下课或用户明确结束后，才能结算本次课堂窗口的最终成功/失败/进行中、未建任务拒绝与修复建议。未自动失败化或回写任何学生节点。
