import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {siteRoot,runtime,readJson} from './paths.mjs';
import {validateReplacement} from './validate.mjs';
import {loadNasa} from './nasa.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const all=['pbs','freetv','runtime','revry','nasaplus','filmzie','newson','xumo','cw','yupptv'];
const requested=(process.env.SHEEPBOX_REFRESH_PROVIDERS||'all').split(',');const providers=requested.includes('all')?all:requested;
if(!providers.length||providers.some(id=>!all.includes(id)))throw Error('Unknown refresh provider.');
const output=process.env.SHEEPBOX_REFRESH_OUTPUT;if(!output)throw Error('Set SHEEPBOX_REFRESH_OUTPUT to a new staging directory.');
const stage=path.resolve(output),relative=path.relative(siteRoot,stage);if(!relative.startsWith('..')&&!path.isAbsolute(relative))throw Error('Stage must be outside the published runtime.');
await fs.mkdir(stage); // Refuse to overwrite or resume an existing stage.
const before=await readJson('build.json'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
for(const entry of [...before.files,{path:'build.json'}]){if(!entry.path||entry.path.split('/').some(part=>part==='..')||path.isAbsolute(entry.path))throw Error('Unsafe build path.');const bytes=await fs.readFile(path.join(siteRoot,entry.path));if(entry.sha256&&hash(bytes)!==entry.sha256)throw Error('Published runtime differs from its manifest.');const target=path.join(stage,entry.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
let catalog=await readJson('data/catalog.json');const changed=[];
function runPython(script,folder,args=[]){const result=spawnSync(process.env.PYTHON||'python3',[path.join(here,script),'--output',folder,...args],{stdio:'inherit',windowsHide:true,timeout:2*60*60*1000});if(result.error||result.status!==0)throw Error('Complete provider export failed; saved libraries retained.');}
for(const provider of providers){
 console.log('Refreshing '+provider+' complete supported metadata');
 if(['pbs','freetv','runtime','revry'].includes(provider)){
  const previous=await readJson('data/'+provider+'.json'),folder=await fs.mkdtemp(path.join(os.tmpdir(),'sheepbox-'+provider+'-'));
  if(provider==='pbs')runPython('pbs_library.py',folder);
  else if(provider==='revry')runPython('revry_library.py',folder);
  else runPython('ott_library.py',folder,['--provider',provider,'--expected-region',previous.report.region]);
  const filename=provider==='pbs'?'pbs-web-catalog.json':provider==='revry'?'REVRY_WEB_METADATA.json':provider+'.json';
  const value=validateReplacement(previous,JSON.parse(await fs.readFile(path.join(folder,filename),'utf8')),provider);await fs.writeFile(path.join(stage,'data',provider+'.json'),JSON.stringify(value)+'\n');changed.push('data/'+provider+'.json');
 }else{
  let value;
  if(provider==='nasaplus')value=await loadNasa();
  else{const table={filmzie:['filmzie','loadFilmzieLibrary'],newson:['newson','loadNewsOnSelection'],xumo:['xumo','loadXumoSelection'],cw:['cw','loadCwSelection'],yupptv:['yupp','loadYuppSelection']},[module,method]=table[provider];value=await (await runtime(module))[method]();value.providerSeries??=[];const complete=provider==='newson'?value.report.latestDirectoryComplete:provider==='yupptv'?value.report.channelDirectoryComplete:provider==='filmzie'?value.report.movieDirectoryComplete&&value.report.seriesDirectoryComplete:value.report.complete;if(complete!==true)throw Error('Provider directory incomplete.');value.report={...value.report,complete:true,generatedAt:new Date().toISOString()};}
  const previous={items:catalog.items.filter(row=>row.provider===provider),live:catalog.live.filter(row=>row.provider===provider),providerSeries:(catalog.providerSeries??[]).filter(row=>row.provider===provider),report:catalog.sources[provider]};
  validateReplacement(previous,value,provider);catalog={...catalog,items:[...catalog.items.filter(row=>row.provider!==provider),...value.items],live:[...catalog.live.filter(row=>row.provider!==provider),...value.live],providerSeries:[...(catalog.providerSeries??[]).filter(row=>row.provider!==provider),...value.providerSeries],sources:{...catalog.sources,[provider]:value.report},...(value.nasaSeries?{nasaSeries:value.nasaSeries}:{})};
 }
}
catalog.generatedAt=new Date().toISOString();await fs.writeFile(path.join(stage,'data/catalog.json'),JSON.stringify(catalog)+'\n');changed.push('data/catalog.json');
const report=await readJson('data/catalog-report.json');report.generatedAt=catalog.generatedAt;report.sources=catalog.sources;await fs.writeFile(path.join(stage,'data/catalog-report.json'),JSON.stringify(report,null,2)+'\n');changed.push('data/catalog-report.json');
const result=spawnSync(process.execPath,[path.join(here,'finalize-watch.mjs')],{env:{...process.env,SHEEPBOX_SITE_ROOT:stage},stdio:'inherit',windowsHide:true});if(result.status!==0)throw Error('Combined library validation failed.');
const after=JSON.parse(await fs.readFile(path.join(stage,'build.json'),'utf8')),allowed=new Set([...changed,'build.json','sw.js']);
if(after.version!==before.version||after.files.length!==before.files.length||after.files.some(entry=>!before.files.some(old=>old.path===entry.path)||!allowed.has(entry.path)&&before.files.find(old=>old.path===entry.path).sha256!==entry.sha256))throw Error('Refresh changed files outside the metadata allowlist.');
console.log(JSON.stringify({complete:true,providers,previousRevision:before.revision,revision:after.revision,titles:after.titles,live:after.live}));
