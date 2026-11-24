import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {siteRoot,readJson} from './paths.mjs';
const repo=process.env.GITHUB_REPOSITORY,token=process.env.GH_TOKEN,stage=path.resolve(process.env.SHEEPBOX_REFRESH_OUTPUT||'');
if(repo!=='sheepman90s/sheepbox-releases'||!token||!process.env.SHEEPBOX_REFRESH_OUTPUT)throw Error('Publishing requires this repository’s scoped workflow token and a validated stage.');
const repository=path.resolve(siteRoot,'../..'),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function git(args,env={}){const result=spawnSync('git',args,{cwd:repository,env:{...process.env,...env},encoding:'utf8',windowsHide:true});if(result.status!==0)throw Error('Git publication failed; no force-push is attempted.');return result.stdout.trim();}
if(git(['remote','get-url','origin']).replace(/\.git$/,'')!=='https://github.com/'+repo||git(['branch','--show-current'])!=='main'||git(['status','--porcelain']))throw Error('Publication requires a clean checkout of public main.');
const before=await readJson('build.json'),after=JSON.parse(await fs.readFile(path.join(stage,'build.json'),'utf8'));
if(before.version!==after.version||before.files.length!==after.files.length)throw Error('Metadata refresh cannot change the application version or file set.');
const allowed=/^(?:data\/(?:pbs|freetv|runtime|revry|plex|pluto|catalog|catalog-report)\.json|sw\.js)$/;
const changes=[];for(const entry of after.files){const old=before.files.find(row=>row.path===entry.path);if(!old)throw Error('Unexpected staged file.');const bytes=await fs.readFile(path.join(stage,entry.path));if(hash(bytes)!==entry.sha256)throw Error('Stage manifest mismatch.');if(entry.sha256!==old.sha256){if(!allowed.test(entry.path))throw Error('Refresh touched a file outside its allowlist.');if(hash(await fs.readFile(path.join(siteRoot,entry.path)))!==old.sha256)throw Error('Published source changed during refresh.');changes.push(entry.path);}}
if(!changes.length){console.log('No metadata changed.');process.exit(0);}
const auth={'GIT_CONFIG_COUNT':'1','GIT_CONFIG_KEY_0':'http.https://github.com/.extraheader','GIT_CONFIG_VALUE_0':'AUTHORIZATION: basic '+Buffer.from('x-access-token:'+token).toString('base64')};
git(['fetch','origin','main'],auth);if(git(['rev-parse','HEAD'])!==git(['rev-parse','FETCH_HEAD']))throw Error('Public main advanced during refresh; retry without overwriting it.');
for(const name of [...changes,'build.json'])await fs.writeFile(path.join(siteRoot,name),await fs.readFile(path.join(stage,name)));
git(['config','user.name','github-actions[bot]']);git(['config','user.email','41898282+github-actions[bot]@users.noreply.github.com']);
git(['add','--',...changes.map(name=>'docs/watch/'+name),'docs/watch/build.json']);git(['commit','-m','Refresh complete web catalogues']);const commit=git(['rev-parse','HEAD']);git(['push','origin','HEAD:main'],auth);
async function api(method,suffix){const response=await fetch('https://api.github.com/repos/'+repo+suffix,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Pages API HTTP '+response.status+'; source commit remains available for a build retry.');return response.json();}
await api('POST','/pages/builds');let built=false;
for(let attempt=0;attempt<120;attempt++){const result=await api('GET','/pages/builds/latest');if(result.commit===commit&&result.status==='built'){built=true;break;}if(result.commit===commit&&result.status==='errored')throw Error('GitHub Pages build failed.');await new Promise(resolve=>setTimeout(resolve,10000));}
if(!built)throw Error('GitHub Pages build did not finish within twenty minutes.');
const base='https://sheepman90s.github.io/sheepbox-releases/watch/';
let verified=false;for(let attempt=0;attempt<24;attempt++){try{const response=await fetch(base+'build.json?refresh='+after.revision,{cache:'no-store',signal:AbortSignal.timeout(30000)}),value=await response.json();if(JSON.stringify(value)===JSON.stringify(after)){verified=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,5000));}
if(!verified)throw Error('The new Pages manifest is not served yet.');
for(const name of changes){const response=await fetch(base+name+'?refresh='+after.revision,{cache:'no-store',signal:AbortSignal.timeout(60000)});if(!response.ok||hash(Buffer.from(await response.arrayBuffer()))!==after.files.find(row=>row.path===name).sha256)throw Error('Hosted metadata failed its integrity check.');}
console.log(JSON.stringify({published:true,commit,revision:after.revision,verifiedChangedFiles:changes.length}));
