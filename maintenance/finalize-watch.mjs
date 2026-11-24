import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {siteRoot,runtime,readJson} from './paths.mjs';
export async function finalizeWatch(){
 const [{mergeProviderLibrary},{validateRevryLibrary},{mergeApkLibrary},{mergeRokuLibrary,parseRokuEpisodeFile,parseRokuEpisodeIndex,isRokuSeriesReference},{catalogEntryCount,VERSION},{validatePublisherSelection},{mergePlexLibrary},{mergePlutoLibrary}]=await Promise.all(['provider-libraries','revry','apk-library','roku-library','core','publisher-links','plex','pluto'].map(runtime));
 const catalog=await readJson('data/catalog.json'),roku=await readJson('data/roku/catalog.json'),apk=await readJson('data/apk-library.json'),revry=validateRevryLibrary(await readJson('data/revry.json')),publishers=await readJson('data/publisher-links.json');
 if(catalog.schema!==1||!catalog.items?.length||!catalog.live?.length||roku.report?.graphTraversalComplete!==true)throw Error('The saved catalogue is incomplete.');
 let counted=mergeApkLibrary(mergeRokuLibrary(catalog,roku),apk);counted={...counted,items:[...counted.items,...revry.items],live:[...counted.live,...revry.live],providerSeries:[...counted.providerSeries,...revry.providerSeries]};
 const extraLibraries={};for(const provider of ['pbs','freetv','runtime']){const value=await readJson('data/'+provider+'.json');counted=mergeProviderLibrary(counted,value);extraLibraries[provider]=value.report.counts;}
 const plex=await readJson('data/plex.json');counted=mergePlexLibrary(counted,plex);extraLibraries.plex=plex.report.counts;
 const pluto=await readJson('data/pluto.json');counted=mergePlutoLibrary(counted,pluto);extraLibraries.pluto=pluto.report.counts;
 const identities=[...counted.items,...counted.live,...counted.providerSeries].map(row=>row.id);if(new Set(identities).size!==identities.length)throw Error('Provider catalogue identities conflict.');
 for(const show of roku.providerSeries.filter(isRokuSeriesReference))parseRokuEpisodeFile(show,await readJson('data/'+show.episodeFile));
 for(let n=0;n<256;n++){const prefix=n.toString(16).padStart(2,'0');parseRokuEpisodeIndex(prefix,await readJson('data/roku/index/'+prefix+'.json'));}
 for(const provider of ['philo','fawesome']){const value=validatePublisherSelection(publishers.selections?.[provider],provider);for(const key of ['items','live'])if(JSON.stringify(catalog[key].filter(row=>row.provider===provider))!==JSON.stringify(publishers.selections[provider][key]))throw Error('Publisher bundle differs from catalogue.');}
 const entries=[],hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),swPath=path.join(siteRoot,'sw.js');
 const sw=await fs.readFile(swPath,'utf8');if(!/^const CACHE='sheepbox-web-(?:[a-f0-9]{12}|__SHELL_REVISION__)';/.test(sw))throw Error('Unknown service worker revision format.');
 await fs.writeFile(swPath,sw.replace(/^const CACHE='sheepbox-web-[^']+';/,"const CACHE='sheepbox-web-__SHELL_REVISION__';").replaceAll('\r\n','\n'));
 async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const target=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Symlinks cannot be published.');if(item.isDirectory())await walk(target);else if(item.name!=='build.json'){if(/\.(?:html|css|m?js|json|webmanifest|txt|md)$/i.test(item.name)){const text=await fs.readFile(target,'utf8');if(text.includes('\r\n'))await fs.writeFile(target,text.replaceAll('\r\n','\n'));}entries.push({path:path.relative(siteRoot,target).replaceAll('\\','/'),sha256:hash(await fs.readFile(target))});}}}
 await walk(siteRoot);entries.sort((a,b)=>a.path.localeCompare(b.path));const revision=hash(JSON.stringify(entries)).slice(0,12);
 await fs.writeFile(swPath,(await fs.readFile(swPath,'utf8')).replaceAll('__SHELL_REVISION__',revision));entries.length=0;await walk(siteRoot);entries.sort((a,b)=>a.path.localeCompare(b.path));
 const manifest={version:VERSION,revision,catalogGeneratedAt:catalog.generatedAt,titles:catalogEntryCount(counted),live:counted.live.length,extraLibraries,revry:{videos:revry.items.length,shows:revry.providerSeries.length,live:revry.live.length},apkLibrary:{videos:apk.items.length,shows:apk.providerSeries.length},publisherLinks:{fawesomeMovies:publishers.selections.fawesome.items.length,philoChannels:publishers.selections.philo.live.length},roku:{films:roku.items.length,shows:roku.providerSeries.length,episodeFiles:roku.report.episodeFiles,scope:roku.report.scope},files:entries};
 await fs.writeFile(path.join(siteRoot,'build.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=await finalizeWatch();console.log(JSON.stringify({version:result.version,revision:result.revision,titles:result.titles,live:result.live}));}
