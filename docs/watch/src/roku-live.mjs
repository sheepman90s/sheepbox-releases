// Maintainer-only public live-channel metadata. The original Roku website owns
// playback, advertising, DRM, access and guide UI; no play offer is requested.
import {plainText,safeUrl} from './core.mjs';
import {ROKU_MENU,rokuCollections,rokuFreeOption,rokuPageAddress} from './roku-catalog.mjs';

const ID=/^[a-f0-9]{32}$/;
function privateShelf(row){
  // Public shelves also request featureInclude=watchlist. Only the endpoint path
  // identifies a personal shelf; matching the complete URL hides every channel.
  let path='';try{path=new URL(row.meta?.href).pathname;}catch{}
  return /\/(?:watchlist|continuewatching|favorites|recents)(?:\/|$)/i.test(path)||/^(Recently Watched|Watch it Again|Save List)$/i.test(row.title??'');
}
const paused=value=>[true,'true',1].includes(value);
function image(row){return ['gridEpg','grid','detailBackground','detailPoster'].map(key=>safeUrl(row?.imageMap?.[key]?.path)).find(Boolean)||'';}
function liveCard(row,label){
  if(row?.type!=='livefeed'||!ID.test(row.meta?.id??'')||!rokuFreeOption(row))return null;
  const title=plainText(row.title).slice(0,240);if(!title)return null;
  const sourceId=row.meta.id;const shelf=plainText(label).slice(0,160);
  return {id:`roku-live-${sourceId}`,sourceId,provider:'roku',providerName:'Roku',kind:'live',mode:'roku-link',title,
    description:'A free live channel in Roku’s guest catalogue. Watch in the original Roku player; Roku manages programme availability, advertising, captions and access.',
    image:image(row),categories:[...new Set(['Live TV',...(Array.isArray(row.genres)?row.genres:[]).filter(value=>typeof value==='string').map(plainText),shelf].filter(Boolean))],
    shelves:shelf?[shelf]:[],official:`https://app.roku.com/watch/${sourceId}`,watchUrl:`https://app.roku.com/watch/${sourceId}`,freeGuestVerified:true};
}
function liveRoot(menu){
  const roots=[];function visit(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(visit);return;}
    if(value.title==='Live TV'&&value.meta?.type==='page'){const url=rokuPageAddress(value.meta.id,{rendered:true});if(url)roots.push({url,label:'Live TV',kind:'directory',feed:url});}
    if(Array.isArray(value.view))value.view.forEach(visit);
  }visit(menu);return roots;
}

export function parseRokuLivePage(data,{label='Live TV',kind='directory',feed=''}={}){
  const collections=rokuCollections(data),live=[],tasks=[],rows=[],skipped=[],unsupported=[];
  for(const row of collections){
    const name=plainText(row.title)||label;
    if(privateShelf(row)){skipped.push({reason:'personal-shelf',label:name});continue;}
    if(paused(row.lazyload)){
      const url=rokuPageAddress(row.meta?.href);if(url)tasks.push({url,label:name,kind:'directory',feed:url});
      else unsupported.push({reason:'unsupported-lazy-shelf',label:name});
      continue;
    }
    const view=Array.isArray(row.view)?row.view:[],hasLive=view.some(entry=>entry.content?.type==='livefeed');
    const directoryLinks=kind==='directory'&&(/^(Explore More|Browse Live TV|Live TV Categories)$/i.test(name)||/ltvz-bookends/.test(row.meta?.id??''));
    let eligible=0,more=0,children=0;const identities=[];
    for(const entry of view){
      const content=entry?.content;if(!content)continue;
      if(content.type==='livefeed'){
        if(ID.test(content.meta?.id??''))identities.push(content.meta.id);
        const item=liveCard(content,name);if(item){live.push(item);eligible++;}else skipped.push({reason:'ineligible-livefeed',label:name});
      }
      if(content.meta?.mediaType!=='page')continue;
      if(!hasLive&&!directoryLinks&&kind!=='more'){skipped.push({reason:'non-live-shelf-branch',label:name});continue;}
      const href=content.meta.href,isMore=typeof href==='string'&&href.includes('/plugins/pages/see-more');
      const supplied=rokuPageAddress(href),rendered=rokuPageAddress(content.meta.id,{rendered:true});
      const url=isMore?supplied:rendered||supplied;
      if(!url){unsupported.push({reason:'unsupported-live-page-link',label:plainText(content.title)||name});continue;}
      if(isMore)more++;else children++;
      tasks.push({url,label:isMore?name:plainText(content.title)||name,kind:isMore?'more':'directory',
        feed:isMore&&kind==='more'&&name===label?(feed||url):url,...(!isMore&&supplied&&supplied!==url?{fallback:supplied}:{})});
    }
    rows.push({label:name,entries:view.length,livefeedIdentities:identities,eligible,moreLinks:more,childPages:children,terminal:more===0});
  }
  return {live,tasks,rows,skipped,unsupported,recognized:collections.length>0||Array.isArray(data?.collections)&&data.type==='page'};
}

function validUrl(value){
  const safe=safeUrl(value,['app.roku.com']);if(!safe)return false;const u=new URL(safe);
  if(u.hash)return false;if(safe===ROKU_MENU)return true;
  const match=/^\/api\/v2\/homescreen\/pages\/([^/]+)(\/rendered)?$/.exec(u.pathname);if(!match)return false;
  try{const id=decodeURIComponent(match[1]);return match[2]?rokuPageAddress(id,{rendered:true})===safe:rokuPageAddress(id)===safe;}catch{return false;}
}
function combine(map,item){const old=map.get(item.sourceId);map.set(item.sourceId,old?{...old,image:old.image||item.image,categories:[...new Set([...old.categories,...item.categories])],shelves:[...new Set([...old.shelves,...item.shelves])]}:item);}

export async function loadRokuLiveSelection({fetcher=globalThis.fetch,signal,onProgress=()=>{},onCheckpoint=async()=>{},resume,maxRequests=Infinity,delayMs=150,checkpointEvery=10}={}){
  const initial=resume?.checkpoint??resume;
  if(initial&&(initial.schema!==1||initial.type!=='roku-live'))throw Error('Unsupported Roku live checkpoint.');
  const startedAt=initial?.startedAt??new Date().toISOString(),queue=[],done=new Set(initial?.done??[]),live=new Map((initial?.live??[]).map(item=>[item.sourceId,item])),failures=[],unsupported=[...(initial?.unsupported??[])],skipped=[...(initial?.skipped??[])],coverage=[...(initial?.coverage??[])],feedSignatures=new Map(initial?.feedSignatures??[]);
  let requests=initial?.requests??0,bytes=initial?.bytes??0,runRequests=0,menuLoaded=initial?.menuLoaded??false,lastCheckpoint=requests,blockedStatus=0,retryAfterSeconds=null;
  const enqueue=task=>{if(!validUrl(task.url)||task.fallback&&!validUrl(task.fallback))throw Error('Unsupported Roku live metadata address.');if(!done.has(task.url)&&!queue.some(row=>row.url===task.url))queue.push(task);};
  for(const task of [...(initial?.pending??[]),...(initial?.failedTasks??[])])if(task.url!==ROKU_MENU)enqueue(task);
  async function json(url){
    if(!validUrl(url))throw Error('Unsupported Roku live metadata address.');signal?.throwIfAborted();
    if(runRequests>=maxRequests)throw Error('Roku live metadata request budget reached.');
    const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,30000);
    try{
      requests++;runRequests++;const response=await fetcher(url,{credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal});
      if(!response.ok){
        const error=Error(`Roku live metadata returned HTTP ${response.status}.`);error.status=response.status;
        if([403,429].includes(response.status)){
          blockedStatus=response.status;const retry=response.headers?.get('retry-after');
          retryAfterSeconds=/^\d{1,6}$/.test(retry??'')?Number(retry):retry&&Number.isFinite(Date.parse(retry))?Math.max(0,Math.ceil((Date.parse(retry)-Date.now())/1000)):null;
        }
        throw error;
      }
      if(response.url&&response.url!==url)throw Error('Roku returned an unexpected live metadata address.');
      const text=await response.text();bytes+=text.length;if(text.length>32_000_000)throw Error('Roku live metadata response is too large.');
      try{return JSON.parse(text);}catch{throw Error('Roku returned invalid live metadata.');}
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  function snapshot(){
    const available=[...live.values()].sort((a,b)=>a.title.localeCompare(b.title));
    return {live:available,report:{source:ROKU_MENU,label:'Free live channels · Watch on Roku',complete:menuLoaded&&available.length>0&&queue.length===0&&failures.length===0&&unsupported.length===0,
    scope:'All eligible livefeed cards reached through the supplied Live TV directory, live-bearing shelves, More continuations and explicit Explore More category branches. Whole-service or EPG-master completeness is not claimed.',
    startedAt,updatedAt:new Date().toISOString(),channels:available.length,requests,bytes,pagesCompleted:coverage.length,remaining:queue.length+(menuLoaded?0:1),failed:failures.length,failures:failures.map(({task,error})=>({url:task.url,label:task.label,error})),unsupported,skipped,coverage,
    publishedServiceTotal:null,epgMasterDirectoryVerified:false,countryAttribution:'No country is inferred from viewer IP, page locale or channel language.',
    watchLinks:'Roku’s own Live TV UI publishes /watch/<32-hex-content-id> links. External player only; no live playback or media/DRM/ad request is made by this metadata loader.',
    operationalLimitReached:(queue.length>0||!menuLoaded)&&runRequests>=maxRequests,blocked:!!blockedStatus,...(blockedStatus?{blockedStatus,retryAfterSeconds}:{})},
    checkpoint:{schema:1,type:'roku-live',startedAt,requests,bytes,menuLoaded,live:available,pending:[...queue],done:[...done],failedTasks:failures.map(row=>row.task),unsupported,skipped,coverage,feedSignatures:[...feedSignatures]}};
  }
  async function checkpoint(force=false){const data=snapshot();onProgress(data.report);if(force||requests-lastCheckpoint>=checkpointEvery){await onCheckpoint(data);lastCheckpoint=requests;}return data;}
  try{
    if(!menuLoaded&&runRequests<maxRequests){
      try{const roots=liveRoot(await json(ROKU_MENU));if(!roots.length)throw Error('Roku did not supply its Live TV directory.');roots.forEach(enqueue);menuLoaded=true;}
      catch(error){if(signal?.aborted)throw error;failures.push({task:{url:ROKU_MENU,label:'Live TV navigation',kind:'menu'},error:error.message});}
    }
    while(queue.length&&runRequests<maxRequests&&!blockedStatus){
      signal?.throwIfAborted();const task=queue.shift();if(done.has(task.url))continue;
      try{
        let data;
        try{data=await json(task.url);}catch(error){if(signal?.aborted)throw error;if(error.status===404&&task.fallback&&runRequests<maxRequests)data=await json(task.fallback);else throw error;}
        const parsed=parseRokuLivePage(data,task);if(!parsed.recognized)throw Error('Roku returned an unrecognized live metadata page.');
        if(task.label==='Live TV'&&task.kind==='directory'&&!parsed.live.length&&!parsed.tasks.length)throw Error('Roku returned an empty Live TV directory; existing sample metadata cannot establish current coverage.');
        if(task.kind==='more'){
          const signature=parsed.rows.flatMap(row=>row.livefeedIdentities).sort().join('|');const signatures=feedSignatures.get(task.feed)||[];
          if(signature&&signatures.includes(signature)&&parsed.tasks.some(row=>row.kind==='more'))throw Error('Roku repeated a live continuation without reaching a supplied terminal.');
          if(signature&&!signatures.includes(signature))signatures.push(signature);feedSignatures.set(task.feed,signatures);
        }
        parsed.live.forEach(item=>combine(live,item));parsed.tasks.forEach(enqueue);unsupported.push(...parsed.unsupported);skipped.push(...parsed.skipped);
        coverage.push({url:task.url,label:task.label,kind:task.kind,rows:parsed.rows.map(({livefeedIdentities,...row})=>({...row,uniqueLivefeedIdentities:new Set(livefeedIdentities).size}))});done.add(task.url);
      }catch(error){if(signal?.aborted){queue.unshift(task);throw error;}failures.push({task,error:error.message});}
      await checkpoint();
      if(delayMs&&queue.length&&!blockedStatus&&runRequests<maxRequests)await new Promise(resolve=>setTimeout(resolve,delayMs));
    }
  }finally{await checkpoint(true);}
  return snapshot();
}
