import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'};
http.createServer(async(req,res)=>{
  try{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');
    const file=path.resolve(root,name);
    if(file!==root&&!file.startsWith(root+path.sep))throw Error('outside root');
    const data=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
    res.end(data);
  }catch{res.writeHead(404);res.end('Not found')}
}).listen(8883,'127.0.0.1',()=>console.log('T05: http://127.0.0.1:8883/index.html?lab'));
