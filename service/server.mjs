#!/usr/bin/env node
// Optional HTTP adapter. Importing this module never starts a listener.
import http from 'node:http'
import {createHash,timingSafeEqual} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {createWebSearch,formatText} from '../api.mjs'

const MAX_BODY=4096
const defaultConfig=Object.freeze({provider:'auto',timeoutMs:25000,maxResults:5,cooldownMs:0,fontPath:'/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',timeZone:'Asia/Shanghai'})
class RequestError extends Error {
  constructor(status,message){super(message);this.status=status}
}
const digest=value=>createHash('sha256').update(value).digest()

function reply(res,status,value,headers={}) {
  if(res.destroyed||res.writableEnded)return
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers})
  res.end(JSON.stringify(value))
}
function bodyJSON(req,signal) {
  return new Promise((resolve,reject)=>{
    const chunks=[];let bytes=0,done=false
    const finish=(error,result)=>{
      if(done)return;done=true
      req.off('data',data);req.off('end',end);req.off('aborted',aborted);req.off('error',aborted)
      signal.removeEventListener('abort',aborted)
      if(error){req.resume();reject(error)}else resolve(result)
    }
    const data=chunk=>{
      bytes+=chunk.length
      if(bytes>MAX_BODY)return finish(new RequestError(413,'请求内容过大。'))
      chunks.push(chunk)
    }
    const end=()=>{
      try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')))}
      catch{finish(new RequestError(400,'请求必须是有效 JSON。'))}
    }
    const aborted=()=>finish(new RequestError(499,'请求已取消。'))
    req.on('data',data);req.once('end',end);req.once('aborted',aborted);req.once('error',aborted)
    signal.addEventListener('abort',aborted,{once:true})
    if(signal.aborted)aborted()
  })
}

/** Factory returns an unbound http.Server; inject searchService for tests/adapters. */
export function createSearchServer({secret=process.env.SEARCH_SECRET,searchService,config=defaultConfig,renderer='web-result-card',now=Date.now}={}) {
  if(typeof secret!=='string'||!secret.length||secret.length>4096||!/^[\x20-\x7e]+$/.test(secret))throw new Error('SEARCH_SECRET 必须为非空的 ASCII 认证密钥（最多 4096 个字符）')
  const expected=digest(secret)
  const service=searchService||createWebSearch({config})
  if(typeof service.search!=='function')throw new Error('搜索服务必须提供 search 方法')
  let busy=false,closing=false,active
  const handler=async(req,res)=>{
    const route=req.url?.split('?',1)[0]
    if(route==='/healthz'){
      if(req.method!=='GET')return reply(res,405,{ok:false,error:'仅支持 GET。'},{allow:'GET'})
      return reply(res,closing?503:200,{ok:!closing,busy,renderer})
    }
    if(route!=='/search')return reply(res,404,{ok:false,error:'接口不存在。'})
    if(req.method!=='POST')return reply(res,405,{ok:false,error:'仅支持 POST。'},{allow:'POST'})
    const supplied=req.headers['x-search-secret']
    const authHeaders=req.rawHeaders.filter((value,index)=>index%2===0&&value.toLowerCase()==='x-search-secret').length
    if(typeof supplied!=='string'||authHeaders!==1||!timingSafeEqual(expected,digest(supplied)))return reply(res,401,{ok:false,error:'认证失败。'})
    if(closing)return reply(res,503,{ok:false,error:'服务正在关闭。'})
    if(busy)return reply(res,429,{ok:false,error:'正在处理其他搜索，请稍后再试。'},{'retry-after':'1'})
    const contentLength=req.headers['content-length']
    if(contentLength&&(!/^\d+$/.test(contentLength)||Number(contentLength)>MAX_BODY))return reply(res,413,{ok:false,error:'请求内容过大。'},{connection:'close'})
    const controller=new AbortController();active=controller;busy=true
    const started=now()
    const disconnect=()=>{if(!res.writableEnded)controller.abort()}
    req.once('aborted',disconnect);res.once('close',disconnect)
    try{
      const input=await bodyJSON(req,controller.signal)
      if(!input||Array.isArray(input)||typeof input!=='object'||typeof input.query!=='string')throw new RequestError(400,'query 必须是 1–240 字的字符串。')
      const query=input.query.trim()
      if(!query||query.length>240)throw new RequestError(400,'query 必须是 1–240 字的字符串。')
      if(input.image!==undefined&&typeof input.image!=='boolean')throw new RequestError(400,'image 必须是布尔值。')
      const result=await service.search(query,input.image===true?'image':'text',{signal:controller.signal,imageType:'png'})
      if(controller.signal.aborted)throw new RequestError(closing?503:499,'请求已取消。')
      if(!result||!Array.isArray(result.results)||!result.results.length)throw new Error('搜索核心未返回有效结果')
      // Preserve the actual engine, URL, provenance and source-quality metadata.
      const output={...result,ok:true,query:result.query||query,cached:false,durationMs:Math.max(0,now()-started)}
      if(typeof output.answerText!=='string')output.answerText=formatText(output,{timeZone:service.config?.timeZone||config.timeZone||'Asia/Shanghai'})
      reply(res,200,output)
    }catch(error){
      const status=error instanceof RequestError?error.status:closing?503:502
      const message=error instanceof RequestError?error.message:closing?'服务正在关闭。':'搜索暂时不可用，请稍后重试。'
      reply(res,status,{ok:false,error:message},status===413?{connection:'close'}:{})
    }finally{
      req.off('aborted',disconnect);res.off('close',disconnect)
      if(active===controller)active=undefined
      busy=false
    }
  }
  const server=http.createServer({maxHeaderSize:8192,headersTimeout:5000,requestTimeout:10000,keepAliveTimeout:3000},(req,res)=>{void handler(req,res)})
  server.shutdown=()=>{
    closing=true;active?.abort()
    server.closeIdleConnections?.()
    return new Promise(resolve=>{
      const force=setTimeout(()=>{server.closeAllConnections?.();resolve()},2000);force.unref()
      server.close(()=>{clearTimeout(force);resolve()})
    })
  }
  return server
}

async function main(){
  const port=Number(process.env.SEARCH_PORT||3080)
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('SEARCH_PORT 必须为 1–65535 的整数端口')
  const server=createSearchServer()
  server.on('error',()=>{console.error('搜索服务无法启动，请检查端口和运行环境。');process.exitCode=1})
  server.listen(port,'0.0.0.0',()=>console.log('搜索服务已启动，监听端口：'+port))
  let stopping=false
  const stop=()=>{if(stopping)return;stopping=true;void server.shutdown().then(()=>{process.exitCode=0})}
  process.once('SIGTERM',stop);process.once('SIGINT',stop)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(()=>{console.error('搜索服务配置无效，请设置 SEARCH_SECRET 和有效的 SEARCH_PORT。');process.exitCode=1})
}
