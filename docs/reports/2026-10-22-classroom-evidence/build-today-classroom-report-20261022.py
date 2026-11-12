import pathlib,json,datetime,collections,hashlib,math,re
BASE=pathlib.Path(__file__).parent
OUT=pathlib.Path(r'D:\Claude code programe\VOZEB-PRO\VOZEB-PRO\docs\reports')
EVIDENCE=OUT/'2026-10-22-classroom-evidence'
start=datetime.datetime.fromisoformat('2026-10-22T08:30:00+08:00')
release=datetime.datetime.fromisoformat('2026-10-22T16:38:14+08:00')
source=json.loads((BASE/'classroom-metrics-source.json').read_text(encoding='utf-8'))
raw=[t for t in source['samples'] if t.get('surface')=='canvas' and datetime.datetime.fromisoformat(t['created_at'])>=start]
assert len(raw)==len({t['id'] for t in raw}), 'duplicate task ID'
accounts={a['alias']:a.get('masked_account','—') for a in source['accounts']}
channels={a['id']:a['name'] for a in source['channels']}
now=datetime.datetime.fromisoformat(source['at']);tz=datetime.timezone(datetime.timedelta(hours=8));stamp=now.astimezone(tz).strftime('%Y%m%d-%H%M%S')
frozen={'at':source['at'],'windowStart':start.isoformat(),'surface':'canvas','readOnly':True,'source':'classroom-metrics-source.json; single SQL statement snapshot','settingsRevision':source['revision'],'accountLabels':{a:accounts.get(a,'—') for a in sorted({t['account_alias'] for t in raw})},'channelNames':channels,'tasks':raw}
def secretcheck(v):
 if isinstance(v,dict):
  assert not any(k.lower() in {'password','apikey','authorization','cookie','prompt','privatekey'} for k in v)
  for x in v.values():secretcheck(x)
 elif isinstance(v,list):
  for x in v:secretcheck(x)
 elif isinstance(v,str):assert not re.search(r'(?i)sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}|BEGIN (?:OPENSSH|RSA|EC) PRIVATE KEY',v)
secretcheck(frozen)
blob=json.dumps(frozen,ensure_ascii=False,indent=2).encode('utf-8')
fname=f'canvas-today-metrics-{stamp}.json';EVIDENCE.mkdir(exist_ok=True);(EVIDENCE/fname).write_bytes(blob)
manifest={'file':fname,'sha256':hashlib.sha256(blob).hexdigest(),'uniqueTasks':len(raw),'taskIDsUnique':True,'noCredentialFields':True,'frozenAt':source['at']}
(EVIDENCE/f'canvas-today-verification-{stamp}.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
def counts(ts):
 s=sum(t['status']=='success' for t in ts);f=sum(t['status'] in ['error','failed'] for t in ts);a=len(ts)-s-f
 return len(ts),s,f,a

def rate(s,n):return f'{100*s/n:.2f}%' if n else '—'
def durations(ts):return [t['generation_log_duration_ms']/1000 for t in ts if t['status']=='success' and t.get('generation_log_status')=='success' and isinstance(t.get('generation_log_duration_ms'),(int,float))]
def percentile(v,p):
 if not v:return None
 v=sorted(v);pos=(len(v)-1)*p;i=math.floor(pos);j=math.ceil(pos);return v[i]+(v[j]-v[i])*(pos-i)
def timecol(ts):
 v=durations(ts)
 return f'{sum(v)/len(v):.3f} / {percentile(v,.95):.3f} / {max(v):.3f} (n={len(v)})' if v else '—'
def row_stats(label,ts):
 n,s,f,a=counts(ts);return f'| {label} | {n} | {s} | {f} | {a} | {rate(s,s+f)} | {rate(s,n)} | {timecol(ts)} |'
def table_header(first):return [f'| {first} | 任务 | 成功 | 失败 | 在途 | 终态成功率 | 全任务完成成功比例 | 成功耗时均值/P95/最大（秒） |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
lines=['# 2026-10-22 生产课堂实时监控报告（未结束）','',f'**数据库源冻结时间：{now.astimezone(tz).strftime("%Y-%m-%d %H:%M:%S %z")}。只读监控，不是最终验收。**','',
'## 1. 概述与统计口径','',
f'- 窗口：2026-10-22 08:30（北京）至上述冻结时刻；仅`surface=canvas`，按task ID去重，共{len(raw)}笔、{len({t["account_alias"] for t in raw})}个账号。',
'- 包括窗口内可能存在的测试、教师及学生任务；未确认身份的账号不擅自标成学生。',
'- 以下是数据库任务业务终态，不以HTTP200、ready健康或前端提示当成成功；没有形成数据库任务的HTTP拒绝不在分母内，不能称完整端到端成功率。',
'- 终态成功率=success/(success+error)；全任务完成成功比例=success/所有任务，在途不是失败。',
'- 完整耗时取匹配generation log的duration_ms；只统计success任务。缺日志不拿updated_at伪造耗时。P95采用线性插值，n在表内标明。',
'- 模型按任务保存的原始logicalModel归属，实际fallback另列attempt；`.`与`-`型号ID不擅自合并。',
'- 账号仅显示稳定别名和脱敏用户名，不输出密码或学生身份。',
f'- 冻结证据：`2026-10-22-classroom-evidence/{fname}`；SHA256 `{manifest["sha256"]}`。','',
'## 2. 整体及能力成功率','']
lines+=table_header('范围')
lines.append(row_stats('合计',raw))
for typ in ['text','image','video']:
 ts=[t for t in raw if t['task_type']==typ]
 if ts:lines.append(row_stats(typ,ts))
 else:lines.append(f'| {typ} | 0 | 0 | 0 | 0 | — | — | 本窗口无DB任务，不能声称验证通过 |')
lines+=['','## 3. 分账号成功率','']+table_header('账号别名 / 脱敏用户名')
for account in sorted({t['account_alias'] for t in raw},key=lambda a:-sum(t['account_alias']==a for t in raw)):
 lines.append(row_stats(f'{account} / {accounts.get(account,"—")}',[t for t in raw if t['account_alias']==account]))
lines+=['','账号使用的模型、素材、审核情形不同，低成功率不能直接归咎账号或设备。','',
'## 4. 原始所选模型成功率与生成时间','']+table_header('类型 / 原始logicalModel')
for typ,model in sorted({(t['task_type'],t['requested_model']) for t in raw}):
 lines.append(row_stats(f'{typ} / `{model}`',[t for t in raw if t['task_type']==typ and t['requested_model']==model]))
lines+=['','当日累计混合了旧版本与新版本，不将历史失败直接当作当前版本仍失败；也不把少量当前成功升级为全模型可用认证。','',
'## 5. 实际渠道与attempt表现','',
'以下为attempt，不额外增加任务分母。actualModel优先使用同attempt时段、同channel的diagnosticModel；缺失则标“未证实”，不把recordedModel自动当实际出站型号。','',
'| 渠道 | 类型 | 实际模型证据 | attempt | 成功 | 失败 | 其他/在途 | 终态attempt成功率 |','| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |']
groups=collections.defaultdict(list)
for t in raw:
 for a in t.get('attempts',[]):
  model=a.get('diagnosticModel') or '[未证实] attempt记录:'+str(a.get('recordedModel') or '缺失')
  groups[(channels.get(a.get('channelId'),a.get('channelId') or '未知'),t['task_type'],model)].append(a)
for (ch,typ,m),aa in sorted(groups.items()):
 s=sum(a.get('status') in ['success','succeeded'] for a in aa);f=sum(a.get('status') in ['error','failed'] for a in aa)
 lines.append(f'| {ch} | {typ} | `{m}` | {len(aa)} | {s} | {f} | {len(aa)-s-f} | {rate(s,s+f)} |')
lines+=['','## 6. 发布切换前后分层','',
'只按创建时间分组，以16:38:14（worker新StartedAt之后）为界；这是观察分层，不是每task构建指纹，也不是严格因果实验。旧任务在部署后完成仍属旧创建窗口。','']+table_header('创建窗口 / 类型')
for label,cond in [('16:38:14之前创建',lambda t:datetime.datetime.fromisoformat(t['created_at'])<release),('16:38:14起创建',lambda t:datetime.datetime.fromisoformat(t['created_at'])>=release)]:
 for typ in ['image','video']:
  lines.append(row_stats(f'{label} / {typ}',[t for t in raw if cond(t) and t['task_type']==typ]))
lines+=['','## 7. 已证实问题、缺口与处理边界','',
'| 问题 | 关键证据 | 仍未证实 / 处理方向 |','| --- | --- | --- |',
'| 图片上游200后RangeError | 16:15—16:41冻结14笔，含body_complete字节数、request ID、provider_exception；逐task各退1积分 | 缺真实stack；不能只凭大base64推断函数或阈值。24组离线合成解析均未复现，不能视为修复。 |',
'| fallback逻辑模型绑定403覆盖首错误 | 同task先RangeError，后transport_response403“未绑定” | 新镜像引入路由身份修复，但当前自然样本未覆盖所有fallback分支；不能宣布完整验收。 |',
'| ModelBay素材HTTP403 | 16:15—16:41冻结8笔submit_exception | 缺子请求脱敏正文/code，不能猜余额/密钥；建议补齐子调用诊断。 |',
'| 视频素材高度范围不合要求 | 模汇异步任务和TokenHub asset处理返回300—6000px范围错误 | 未记录实际Height时不推断过小/过大；建议上传前验证原始尺寸、映射及发送后素材元数据。 |',
'| 发布交界的两笔图片提交中断 | 两笔真实upstream_request后无响应记录，约180s recovery失败；同时16:38换镜像 | 与发布相关但缺完整因果；上游费用未知，不重放、不擅改节点。 |',
'| ModelBay不接受response_format | 有上游参数契约错误样本 | 不能用其他输入能力成功代替当前接口能力；需按渠道模型契约修正，不全局删参数。 |','',
'详细task与上游ID：`2026-10-22-classroom-followup-1645.zh-CN.md`及同目录持续报告13.74—13.75。平台退款与上游扣费分开。','',
'## 8. 质量核对与未完成事项','']
terminal=[t for t in raw if t['status'] in ['success','error','failed']]
missing=[t['id'] for t in terminal if not t.get('generation_log_status')]
mismatch=[t['id'] for t in terminal if (t['status']=='success')!=(t.get('generation_log_status')=='success')]
identities=collections.Counter((t['task_type'],t.get('request_identity_hash')) for t in raw if t.get('request_identity_hash'))
lines += [f'- 唯一task ID校验：{len(raw)}/{len(raw)}；重复task ID=0。',f'- 终态缺generation log：{len(missing)}；任务成功/日志成功标志不一致：{len(mismatch)}。',f'- 相同类型request identity hash跨task重复组：{sum(n>1 for n in identities.values())}（不是根据hash把独立task强行合并）。',
'- 成功指标仍是服务端DB结果；仅部分样本做过result_payload持久化核验，未逐个学生浏览器查看/播放，不能冒称前端交付全部通过。',
'- 没有新增付费生成、重放、改生产数据库、修改配置、推送或部署。',
'- 课堂仍有在途，采样继续；本报告不是最终关闭或“全部修复”结论。','']
report=OUT/'2026-10-22-production-classroom-live-metrics.zh-CN.md'
text='\n'.join(lines)
tmp=report.with_suffix('.md.tmp');tmp.write_text(text,encoding='utf-8');tmp.replace(report)
print(json.dumps({'report':str(report),'evidence':fname,'at':source['at'],'counts':counts(raw),'accounts':len({t['account_alias'] for t in raw}),'models':len({(t['task_type'],t['requested_model']) for t in raw}),'attempts':sum(len(t['attempts']) for t in raw),'terminalMissingLogs':len(missing),'statusMismatches':len(mismatch)},ensure_ascii=False))
