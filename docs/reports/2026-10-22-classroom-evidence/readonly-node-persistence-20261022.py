import ast,pathlib,subprocess,json,datetime
b=pathlib.Path(__file__).parent;a=ast.parse((b/'classroom_readonly_incident_audit_20261022.py').read_text(encoding='utf-8'));ssh=next(ast.literal_eval(n.value) for n in a.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SSH' for t in n.targets))
q="""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='8000ms';
SELECT jsonb_build_object('at',transaction_timestamp(),'readOnly',true,'tasks',coalesce(jsonb_agg(row_to_json(x)),'[]')) FROM(
SELECT t.id,t.task_type,t.status,t.created_at,t.updated_at,t.project_id,p.updated_at project_updated_at,
coalesce(nullif(split_part(t.payload->>'clientRequestId',':',3),''),(SELECT e->>'nodeId' FROM jsonb_array_elements(coalesce(t.diagnostic_events,'[]'))e WHERE coalesce(e->>'nodeId','')<>'' LIMIT 1)) original_node_id,
p.id IS NOT NULL project_exists,n.node IS NOT NULL original_node_exists,n.node->'metadata'->>'status' node_status,
n.node->'metadata'->'imageTask'->>'id' node_image_task_id,n.node->'metadata'->'videoTask'->>'id' node_video_task_id,
coalesce(n.node->'metadata'->>'errorDetails','')<>'' node_has_error,coalesce(n.node->'metadata'->>'serverUrl','')<>'' node_has_server_url,coalesce(n.node->'metadata'->>'url','')<>'' node_has_url,
(t.result_payload IS NOT NULL AND t.result_payload<>'{}'::jsonb AND t.result_payload<>'null'::jsonb) task_has_result
FROM vozeb_pro_generation_tasks t LEFT JOIN vozeb_pro_canvas_projects p ON p.id=t.project_id AND p.user_id=t.user_id
LEFT JOIN LATERAL(SELECT value node FROM jsonb_array_elements(coalesce(p.project_json->'nodes','[]')) WHERE value->>'id'=coalesce(nullif(split_part(t.payload->>'clientRequestId',':',3),''),(SELECT e->>'nodeId' FROM jsonb_array_elements(coalesce(t.diagnostic_events,'[]'))e WHERE coalesce(e->>'nodeId','')<>'' LIMIT 1)) LIMIT 1)n ON true
WHERE t.surface='canvas' AND t.created_at>='2026-10-22 16:38:14+08' AND t.status IN('success','error','failed') ORDER BY t.created_at DESC LIMIT 40)x; COMMIT;"""
p=subprocess.run(ssh+['docker exec -i vozeb-pro-postgres psql -U vozeb_pro -d vozeb_pro -qAt -v ON_ERROR_STOP=1'],input=q,text=True,encoding='utf-8',stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=20)
if p.returncode:raise RuntimeError(p.stderr[:1000])
x=json.loads(p.stdout.strip());o=b/('post-release-node-persistence-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.json');o.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf-8');print('saved',o,'tasks',len(x['tasks']))
for t in x['tasks']: print(t['id'],t['status'],'node',t['original_node_exists'],t['node_status'],'current-task',t['node_image_task_id'] or t['node_video_task_id'],'err',t['node_has_error'],'url',t['node_has_server_url'] or t['node_has_url'],'result',t['task_has_result'])
