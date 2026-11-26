import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {guestSandbox} from "./guest-sandbox.mjs";

const root=fileURLToPath(new URL("../../",import.meta.url));
const sandbox=guestSandbox();
const server=createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,"http://localhost");
    if(url.pathname.startsWith("/api/")){
      let raw="";
      for await(const chunk of req) raw+=chunk;
      const result=await sandbox.request(url.pathname.slice(4)+url.search,req.headers.authorization,req.method,raw && JSON.parse(raw));
      res.writeHead(result.status,Object.fromEntries(result.headers));
      res.end(await result.text());
    }else{
      const path=resolve(root,"."+ (url.pathname==="/" ? "/index.html" : url.pathname));
      if(!path.startsWith(resolve(root)+sep)) throw Error("Invalid path");
      const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"};
      if(!mime[extname(path)]) throw Error("Invalid extension");
      const content=await readFile(path);
      res.setHeader("Content-Type",mime[extname(path)]);
      res.setHeader("Content-Security-Policy","connect-src 'self'; img-src 'self' data:");
      res.end(url.pathname==="/config.js" ? content+'\nAPI_CONFIG.baseUrl=location.origin+"/api"; API_CONFIG.guestEnabled=true;' : content);
    }
  } catch {res.writeHead(404);res.end();}
});
server.listen(0,"127.0.0.1",()=>console.log("http://127.0.0.1:"+server.address().port));
