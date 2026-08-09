#!/usr/bin/env node
import {createWriteStream,existsSync,rmSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import archiver from "archiver";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const source=path.join(root,"wordpress-plugin/tgs-smart-quotes");
const target=path.join(root,"wordpress-plugin/tgs-smart-quotes.zip");
if(!existsSync(path.join(source,"tgs-smart-quotes.php"))){console.error("No se encontró el plugin WordPress");process.exit(1);}
if(existsSync(target))rmSync(target,{force:true});
await new Promise((resolve,reject)=>{const output=createWriteStream(target);const archive=archiver("zip",{zlib:{level:9}});output.on("close",resolve);archive.on("error",reject);archive.pipe(output);archive.directory(source,"tgs-smart-quotes");void archive.finalize();});
console.log(target);
