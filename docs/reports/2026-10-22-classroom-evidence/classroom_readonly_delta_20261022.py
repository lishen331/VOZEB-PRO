import ast, pathlib, subprocess, datetime, json, re
BASE=pathlib.Path(__file__).parent
module=ast.parse((BASE/'classroom_readonly_incident_audit_20261022.py').read_text(encoding='utf-8'))
SSH=next(ast.literal_eval(n.value) for n in module.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SSH' for t in n.targets))
QUERY=r"""
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='8000ms';
SELECT jsonb_build_object('section','snapshot_time','data',transaction_timestamp());
SELECT jsonb_build_object('section','today_counts','data',coalesce(jsonb_agg(row_to_json(x)),'[]')) FROM (
 SELECT task_type,status,count(*) count FROM vozeb_pro_generation_tasks WHERE created_at>='2026-10-22 08:30:00+08' AND surface='canvas' GROUP BY task_type,status
) x;
SELECT jsonb_build_object('section','failed_delta','data',coalesce(jsonb_agg(row_to_json(x)),'[]')) FROM (
 SELECT t.id,t.task_type,t.status,t.created_at,t.updated_at,t.execution_phase,t.channel_id,t.upstream_task_id,
 t.payload->'config'->>'logicalModel' logical_model,t.payload->'config'->>'model' current_upstream_model,
 t.payload->'config'->>'apiFormat' api_format,t.payload->'config'->'advancedConfig'->>'protocol' protocol,
 left(t.payload->>'error',750) error,
 (SELECT jsonb_build_object('status',g.status,'durationMs',g.duration_ms,'successCount',g.success_count,'failCount',g.fail_count) FROM vozeb_pro_generation_logs g WHERE g.id=t.task_type||'-task:'||t.id) generation_log,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('amount',p.amount,'type',p.type,'createdAt',p.created_at,'idempotencyKey',p.idempotency_key)),'[]') FROM vozeb_pro_point_records p WHERE p.user_id=t.user_id AND p.type='refund' AND position(t.id in coalesce(p.idempotency_key,''))>0) refund_records,
 (SELECT coalesce(jsonb_agg(e),'[]') FROM (SELECT jsonb_strip_nulls(jsonb_build_object('at',e->'at','phase',e->'phase','state',e->'state','channelId',e->'channelId','model',e->'model','status',e->'status','errorCode',e->'errorCode','errorName',e->'errorName','errorMessage',left(e->>'errorMessage',750),'requestId',e->'requestId','durationMs',e->'durationMs','responseBytes',e->'responseBytes','upstreamTaskId',e->'upstreamTaskId','cause',e->'cause','parameters',e->'parameters')) e FROM jsonb_array_elements(coalesce(t.diagnostic_events,'[]')) WITH ORDINALITY q(e,n) WHERE e->>'phase' IN ('upstream_request','upstream_response','transport_response','provider_exception','submit_exception','upstream_body_complete','state') ORDER BY n DESC LIMIT 30) a) events
 FROM vozeb_pro_generation_tasks t WHERE t.created_at>='2026-10-22 08:30:00+08' AND t.surface='canvas' AND t.status IN ('error','failed') AND t.updated_at>='2026-10-22 16:15:19+08' ORDER BY t.updated_at DESC LIMIT 100
) x;
SELECT jsonb_build_object('section','earlier_active_status','data',coalesce(jsonb_agg(row_to_json(x)),'[]')) FROM (
 SELECT t.id,t.task_type,t.status,t.created_at,t.updated_at,t.execution_phase,t.upstream_task_id,t.last_heartbeat_at,t.lease_until,t.next_poll_at,
 left(t.payload->>'error',750) error,
 (SELECT jsonb_build_object('status',g.status,'durationMs',g.duration_ms,'completedAt',g.completed_at) FROM vozeb_pro_generation_logs g WHERE g.id=t.task_type||'-task:'||t.id) generation_log
 FROM vozeb_pro_generation_tasks t WHERE id IN ('8a27def2-84df-476c-981e-ed1965522325','cc574f05-abe2-4e46-8ebb-f9b3c7cab49e','888d3de5-de5d-4ddb-af7c-4ffa82383ff9','f88741ae-d78e-4225-8dcd-3afdb9ecd25b')
) x;
COMMIT;
"""
p=subprocess.run(SSH+['docker exec -i vozeb-pro-postgres psql -U vozeb_pro -d vozeb_pro -qAt -v ON_ERROR_STOP=1'],input=QUERY,text=True,encoding='utf-8',stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=40)
if p.returncode: raise RuntimeError(p.stderr[:1500])
def scrub(v):
 if isinstance(v,str):
  v=re.sub(r'https?://[^\s\"<>]+','[URL]',v)
  v=re.sub(r'(?i)(sk-[\w-]{12,}|bearer\s+[\w.\-/+=]+)','[REDACTED]',v)
  return v
 if isinstance(v,dict):return {k:scrub(x) for k,x in v.items()}
 if isinstance(v,list):return [scrub(x) for x in v]
 return v
result={'auditedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'readOnly':True,'transactionIsolation':'repeatable read','todayWindow':'2026-10-22 08:30+08 Canvas; may include tests','deltaSince':'2026-10-22 16:15:19+08'}
for line in p.stdout.splitlines():
 row=json.loads(line);result[row['section']]=scrub(row['data'])
out=BASE/('readonly-delta-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.json')
out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('saved',out)
print('snapshot_time',result['snapshot_time'],'counts',result['today_counts'])
print('failed_delta_rows',len(result['failed_delta']))
for t in result['failed_delta']:
 print(t['id'],t['task_type'],t['updated_at'],'protocol',t['protocol'],'api',t['api_format'],'log',t['generation_log'],'refund',t['refund_records'])
print('earlier_active_status',json.dumps(result['earlier_active_status'],ensure_ascii=False))
