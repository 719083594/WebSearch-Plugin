import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {normalizeConfig} from './config.mjs'
import {requestEndpoint} from './endpoint.mjs'
import {engines,engineOrder,searchAddress,validateSearchAddress,normalizedQuery} from './engines.mjs'
import {ensureRelevant} from './relevance.mjs'

const documentScript=fileURLToPath(new URL('../renderer/document.py',import.meta.url))
const MAX_HTML=3000000,MAX_OUTPUT=4000000
export function chooseFormat(query,format='auto'){
  if(['text','image'].includes(format))return format
  return /股票|股价|行情|指数|涨跌|走势图|表格|对比|截图|结果图/.test(query)?'image':'text'
}
export function runDocument(input,config,signal){
  return new Promise((resolve,reject)=>{
    let output='',done=false
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result)}
    const child=spawn(config.pythonPath,[documentScript],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}})
    child.stdout.setEncoding('utf8')
    const abort=()=>{child.kill('SIGKILL');finish(new Error('搜索已取消或超过等待上限'))}
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('搜索结果解析或渲染超时'))},5000)
    child.stdout.on('data',chunk=>{output+=chunk;if(Buffer.byteLength(output)>MAX_OUTPUT){child.kill('SIGKILL');finish(new Error('搜索结果过大'))}})
    child.stderr.resume()
    child.on('error',()=>finish(new Error('Python 不可用，请安装 Python 3.10+ 或修改 pythonPath；运行 #搜索诊断 检查。')))
    child.on('close',code=>{
      if(done)return
      if(code!==0)return finish(new Error('搜索网页解析失败，请运行 #搜索诊断 检查 Python 支持组件。'))
      try{const result=JSON.parse(output);if(result.error)throw new Error(result.error);finish(null,result)}catch{finish(new Error('没有取得有效的搜索解析结果'))}
    })
    child.stdin.on('error',()=>{})
    if(signal?.aborted)return abort()
    signal?.addEventListener('abort',abort,{once:true})
    child.stdin.end(JSON.stringify(input))
  })
}
async function fetchPage(url,engine,query,fetchImpl,signal){
  for(let redirects=0;redirects<4;redirects++){
    const response=await fetchImpl(url,{redirect:'manual',cache:'no-store',signal,headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36','accept-language':'zh-CN,zh;q=0.9','cache-control':'no-cache'}})
    if([301,302,303,307,308].includes(response.status)){
      const next=new URL(response.headers.get('location')||'',url)
      await response.body?.cancel()
      url=validateSearchAddress(next.href,engine,query).url;continue
    }
    if(!response.ok){await response.body?.cancel();throw new Error('搜索引擎返回 HTTP '+response.status)}
    if(!response.body)throw new Error('搜索引擎返回空页面')
    const chunks=[];let size=0
    for await(const chunk of response.body){size+=chunk.byteLength;if(size>MAX_HTML){await response.body.cancel().catch(()=>{});throw new Error('搜索页面过大')};chunks.push(Buffer.from(chunk))}
    const address=validateSearchAddress(response.url||url,engine,query)
    return {html:Buffer.concat(chunks).toString('utf8'),...address}
  }
  throw new Error('搜索引擎重定向次数过多')
}
function abortable(work,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new Error('搜索源超过等待上限或已取消'))
    if(signal.aborted)return abort()
    signal.addEventListener('abort',abort,{once:true})
    try{Promise.resolve(work()).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))}
    catch(error){signal.removeEventListener('abort',abort);reject(error)}
  })
}
export function createSearcher({config={},fetchImpl=globalThis.fetch,parse=runDocument,now=()=>new Date()}={}){
  config=normalizeConfig(config);let busy=false
  return {
    config,
    async search(query,format='auto',{signal:externalSignal,imageType='jpeg'}={}){
      query=String(query||'').trim()
      if(!query||query.length>240)throw new Error('请输入1–240字的搜索内容。')
      if(!['auto','text','image'].includes(format))throw new Error('format 必须是 auto、text 或 image')
      if(!['jpeg','png'].includes(imageType))throw new Error('imageType 必须是 jpeg 或 png')
      if(busy)throw new Error('正在处理其他搜索，请稍后再试。')
      if(externalSignal?.aborted)throw new Error('搜索已取消')
      busy=true
      const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,config.timeoutMs)
      externalSignal?.addEventListener('abort',abort,{once:true})
      const searchedAt=now().toISOString()
      try{
        const selected=chooseFormat(query,format)
        if(config.provider==='endpoint'){
          const result=await abortable(()=>requestEndpoint(query,selected,config,fetchImpl,controller.signal),controller.signal)
          if(controller.signal.aborted)throw new Error('搜索超过等待上限')
          return result
        }
        const attempts=[]
        for(const engine of engineOrder(query,config.provider)){
          if(controller.signal.aborted)throw new Error('搜索超过等待上限')
          const source=new AbortController(),sourceAbort=()=>source.abort()
          controller.signal.addEventListener('abort',sourceAbort,{once:true})
          const sourceTimer=setTimeout(sourceAbort,config.sourceTimeoutMs)
          try{
            const page=await abortable(()=>fetchPage(searchAddress(engine,query),engine,query,fetchImpl,source.signal),source.signal)
            const result=await abortable(()=>parse({html:page.html,query,engine,engineLabel:engines[engine].name,searchUrl:page.url,searchedAt,image:selected==='image',imageType,fontPath:config.fontPath,maxResults:config.maxResults,timeZone:config.timeZone},config,source.signal),source.signal)
            if(result.blocked)throw new Error('搜索页面要求安全验证或验证码')
            if(!result.results?.length)throw new Error('没有取得有效搜索结果，可能遇到搜索引擎限制或验证码。')
            if(result.effectiveQuery!==undefined&&normalizedQuery(result.effectiveQuery)!==normalizedQuery(query))throw new Error('页面搜索框改变了完整关键词')
            const relevance=ensureRelevant(query,result.results,result.answerText)
            if(source.signal.aborted||controller.signal.aborted)throw new Error('搜索超过等待上限')
            attempts.push({engine:engines[engine].name,ok:true})
            const provenance={requestedQuery:query,effectiveQuery:result.effectiveQuery??page.effectiveQuery,queryVerified:true,attemptedEngines:attempts.map(a=>a.engine),attempts,relevance}
            return {...result,ok:true,query,searchUrl:page.url,searchedAt,engine:engines[engine].name,cached:false,format:selected,requestedQuery:provenance.requestedQuery,effectiveQuery:provenance.effectiveQuery,queryVerified:true,attemptedEngines:provenance.attemptedEngines,provenance}
          }catch(error){
            attempts.push({engine:engines[engine].name,ok:false,error:source.signal.aborted?'搜索源超过等待上限或已取消':error.message})
            if(controller.signal.aborted)throw error
          }finally{clearTimeout(sourceTimer);controller.signal.removeEventListener('abort',sourceAbort)}
        }
        throw new Error('未取得有效联网结果（已有限换源）：'+attempts.map(a=>a.engine+'：'+a.error).join('；'))
      }catch(error){if(controller.signal.aborted)throw new Error('搜索已取消或超过等待上限。');throw error}
      finally{clearTimeout(timer);externalSignal?.removeEventListener('abort',abort);busy=false}
    }
  }
}
