import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
let fallback=path.resolve(here,'../docs/watch');try{await fs.access(fallback);}catch{fallback=path.resolve(here,'..');}
export const siteRoot=path.resolve(process.env.SHEEPBOX_SITE_ROOT||fallback);
export const runtime=name=>import(pathToFileURL(path.join(siteRoot,'src',name+'.mjs')).href);
export const readJson=async name=>JSON.parse(await fs.readFile(path.join(siteRoot,name),'utf8'));
export async function writeJson(name,value){const target=path.resolve(siteRoot,name);if(!target.startsWith(siteRoot+path.sep))throw Error('Metadata target escapes site.');await fs.writeFile(target,JSON.stringify(value)+'\n');}
