// Offline only: immutable deployment-source + synthetic 403; no real network, user data or credentials.
const fs=require('node:fs'),cp=require('node:child_process'),vm=require('node:vm'),crypto=require('node:crypto');
const repo='D:/Claude code programe/VOZEB-PRO/VOZEB-PRO',sha='bc2643a5d2c8ddc51173f4a74d45da3c6ee52859';
const ts=require(repo+'/web/node_modules/typescript/lib/typescript.js');
const files={service:'web/src/lib/server/modelbay-asset-service.ts',route:'web/src/app/api/video-generation-tasks/video-generation-route.ts',trace:'web/src/lib/server/media-task-trace.ts'};
const sources={};
function read(key){const src=cp.execFileSync('git',['show',`${sha}:${files[key]}`],{cwd:repo,encoding:'utf8'});sources[key]={file:files[key],sha256:crypto.createHash('sha256').update(src).digest('hex')};return src;}
function compile(src,requireImpl=()=>({})){const module={exports:{}};const code=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInThisContext(`(function(require,module,exports){${code}\n})`)(requireImpl,module,module.exports);return module.exports;}
const service=compile(read('service'));const routeSource=read('route');read('trace');
const tree=ts.createSourceFile(files.route,routeSource,ts.ScriptTarget.Latest,true);
const names=new Set(['prepareModelBayReferences','SafeCandidateFailure']);
const parts=tree.statements.filter(n=>n.name&&names.has(n.name.text)).map(n=>({name:n.name.text,line:tree.getLineAndCharacterOfPosition(n.getStart(tree)).line+1,text:n.getText(tree)}));
if(parts.length!==2)throw new Error('source declarations not found');
const fakeFetch=async()=>new Response(JSON.stringify({error:{code:'SYNTHETIC_ONLY_CODE',message:'SYNTHETIC_ONLY_MESSAGE'}}),{status:403,headers:{'content-type':'application/json'}});
const route=compile(`
const {ingestModelBayReferences,ModelBayAssetError,getAuthSettings,fetchSafeOutbound}=require('fixture');
${parts.map(x=>x.text).join('\n')}
export {prepareModelBayReferences};`,()=>({...service,getAuthSettings:async()=>({systemChannels:[{id:'offline-modelbay',baseUrl:'https://fixture.invalid',apiKey:'offline-placeholder'}]}),fetchSafeOutbound:fakeFetch}));
(async()=>{
 let original,wrapped;
 try{await service.ingestModelBayAsset({url:'https://fixture.invalid/reference.jpg',type:'image'},{baseUrl:'https://fixture.invalid',apiKey:'offline-placeholder',fetcher:fakeFetch});}catch(e){original=e;}
 try{await route.prepareModelBayReferences({channelId:'offline-modelbay',advancedConfig:{protocol:'modelbay-seedance'},baseUrl:'https://fixture.invalid'},[{url:'https://fixture.invalid/reference.jpg',type:'image'}]);}catch(e){wrapped=e;}
 const output={at:new Date().toISOString(),offline:true,sourceCommit:sha,synthetic:true,notUpstreamRootCauseEvidence:true,sources,extracted:parts.map(({name,line})=>({name,line})),before:{name:original.name,message:original.message,status:original.details?.status,code:original.details?.code,hasResponse:!!original.details?.response},after:{name:wrapped.name,message:wrapped.message,hasDetails:!!wrapped.details,hasCause:!!wrapped.cause,hasStatus:wrapped.status!==undefined},verified:original.name==='ModelBayAssetError'&&original.details.status===403&&wrapped.name==='Error'&&!wrapped.details&&!wrapped.cause};
 if(!output.verified)throw new Error('expected diagnostic loss not reproduced');
 const out=__dirname+'/offline-modelbay-diagnostic-loss-20261022.json';fs.writeFileSync(out,JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
})();
