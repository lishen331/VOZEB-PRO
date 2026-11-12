// Offline fixture only: no real network, production database, secret or application write.
const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm'),crypto=require('node:crypto');
const repo='D:/Claude code programe/VOZEB-PRO/VOZEB-PRO',sha='bc2643a5d2c8ddc51173f4a74d45da3c6ee52859';
const ts=require(repo+'/web/node_modules/typescript/lib/typescript.js');const sources={};
function source(file){const s=cp.execFileSync('git',['show',`${sha}:${file}`],{cwd:repo,encoding:'utf8'});sources[file]=crypto.createHash('sha256').update(s).digest('hex');return s;}
function moduleOf(s,mocks={}){const module={exports:{}};const code=ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const context={exports:module.exports,module,require:id=>id==='node:crypto'?crypto:(mocks[id]||{}),process:Object.freeze({env:Object.freeze({VOZEB_PRO_ENCRYPTION_KEY:'offline-fixture-only-key-not-from-production-32chars'})}),Buffer,URL,Headers,Request,Response,Date,Promise,console};vm.runInNewContext(code,context);return module.exports;}
const signer=moduleOf(source('web/src/lib/server/generation-media-authorization.ts'));
let record={userId:'offline-user',status:'running',channelId:'offline-channel',payload:{config:{logicalModel:'gpt-image-2',model:'gpt-image-2.5-sunburst',channelId:'offline-channel'}}};
const access=moduleOf(source('web/src/lib/server/generation-media-access.ts'),{'@/lib/server/generation-media-authorization':signer,'@/lib/server/generation-task-store':{getStoredGenerationTaskRecord:async()=>record}});
const genSource=source('web/src/lib/server/generation-channel.ts');const tree=ts.createSourceFile('generation-channel.ts',genSource,ts.ScriptTarget.Latest,true);const fn=tree.statements.find(x=>x.name?.text==='generationModelId');const generation=moduleOf(fn.getText(tree));
const url='https://fixture.invalid/result.png';let capture;
const resultModule=moduleOf(source('web/src/lib/server/image-task-result-service.ts')+'\nexport {normalizeSafeImageResult};',{
 '@/lib/server/generation-channel':{...generation,systemGenerationChannelId:()=>''},
 '@/lib/server/generation-media-authorization':signer,
 '@/app/api/image-tasks/image-task-support':{
  resolveProxiedMediaSource:()=>({proxyUrl:'/api/ai/system/offline-channel/_media',remoteUrl:url}),
  inlineRemoteImageResult:async(a,b,c,d,headers)=>{const req=new Request('https://app.fixture.invalid',{headers});const expected={userId:'offline-user',channelId:'offline-channel',url};capture={claim:signer.readGenerationMediaClaim(req,expected),allowed:await access.authorizeGenerationMediaProxyRequest(req,expected)};return capture.allowed?{dataUrl:'data:image/png;base64,b2ZmbGluZQ=='}:null;}
 }
});
(async()=>{
 let thrown;try{await resultModule.normalizeSafeImageResult({id:'offline-task',userId:'offline-user',config:record.payload.config},{dataUrl:'/api/ai/system/offline-channel/_media?url=fixture'},'https://app.fixture.invalid','offline-context');}catch(e){thrown={name:e.name,message:e.message};}
 const correctedHeaders=signer.generationMediaProxyHeaders({userId:'offline-user',taskType:'image',taskId:'offline-task',channelId:'offline-channel',upstreamModel:record.payload.config.model,url});
 const expected={userId:'offline-user',channelId:'offline-channel',url};const req=new Request('https://app.fixture.invalid',{headers:correctedHeaders});
 const correctedAllowed=await access.authorizeGenerationMediaProxyRequest(req,expected);
 record={...record,status:'cancelled'};const cancelledAllowed=await access.authorizeGenerationMediaProxyRequest(req,expected);
 record={...record,status:'running',userId:'different-user'};const crossUserAllowed=await access.authorizeGenerationMediaProxyRequest(req,expected);
 const out={at:new Date().toISOString(),offline:true,sourceCommit:sha,sources,scenario:'original logical image model != actual fallback upstream model',original:{logicalModel:'gpt-image-2',storedUpstreamModel:'gpt-image-2.5-sunburst',signedUpstreamModel:capture.claim.upstreamModel,authorizationAllowed:capture.allowed,thrown},comparison:{actualUpstreamSignedAllowed:correctedAllowed,cancelledAllowed,crossUserAllowed},verified:!capture.allowed&&thrown?.message==='上游图片无法通过授权媒体路径读取'&&correctedAllowed&&!cancelledAllowed&&!crossUserAllowed};
 if(!out.verified)throw new Error('fixture did not reproduce expected mismatch');fs.writeFileSync(__dirname+'/offline-image-fallback-media-auth-20261022.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
})();
