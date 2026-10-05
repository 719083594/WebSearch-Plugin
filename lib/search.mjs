import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {normalizeConfig} from './config.mjs'

const documentScript=fileURLToPath(new URL('../renderer/document.py',import.meta.url))
const allowedHosts=new Set(['cn.bing.com','www.bing.com','bing.com'])
const MAX_HTML=3000000,MAX_OUTPUT=4000000
export function chooseFormat(query,format='auto'){
  if(['text','image'].includes(format))return format
  return /股票|股价|行情|指数|涨跌|走势图|表格|对比|截图|结果图/.test(query)?'image':'text'
}
export function runDocument(input,config,signal){
  return new Promise((resolve,reject)=>{
    let output='',done=false
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result)}
    const child=spawn(config.pythonPath,[documentScript],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false})
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
async function fetchPage(url,fetchImpl,signal){
  for(let redirects=0;redirects<4;redirects++){
    const response=await fetchImpl(url,{redirect:'manual',cache:'no-store',signal,headers:{'user-agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36','accept-language':'zh-CN,zh;q=0.9','cache-control':'no-cache'}})
    if([301,302,303,307,308].includes(response.status)){
      const next=new URL(response.headers.get('location')||'',url)
      await response.body?.cancel()
      if(next.protocol!=='https:'||!allowedHosts.has(next.hostname)||next.username||next.password)throw new Error('搜索引擎重定向到不支持的地址')
      url=next.href;continue
    }
    if(!response.ok){await response.body?.cancel();throw new Error('搜索引擎返回 HTTP '+response.status)}
    if(!response.body)throw new Error('搜索引擎返回空页面')
    const chunks=[];let size=0
    for await(const chunk of response.body){size+=chunk.byteLength;if(size>MAX_HTML){await response.body.cancel().catch(()=>{});throw new Error('搜索页面过大')};chunks.push(Buffer.from(chunk))}
    return Buffer.concat(chunks).toString('utf8')
  }
  throw new Error('搜索引擎重定向次数过多')
}
export function createSearcher({config={},fetchImpl=globalThis.fetch,parse=runDocument,now=()=>new Date()}={}){
  config=normalizeConfig(config);let busy=false
  return {
    config,
    async search(query,format='auto',{signal:externalSignal}={}){
      query=String(query||'').trim()
      if(!query||query.length>240)throw new Error('请输入1–240字的搜索内容。')
      if(busy)throw new Error('正在处理其他搜索，请稍后再试。')
      if(externalSignal?.aborted)throw new Error('搜索已取消')
      busy=true
      const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,config.timeoutMs)
      externalSignal?.addEventListener('abort',abort,{once:true})
      const searchedAt=now().toISOString(),searchUrl='https://cn.bing.com/search?q='+encodeURIComponent(query)
      try{
        const html=await fetchPage(searchUrl,fetchImpl,controller.signal)
        const selected=chooseFormat(query,format)
        const result=await parse({html,query,searchUrl,searchedAt,image:selected==='image',fontPath:config.fontPath,maxResults:config.maxResults,timeZone:config.timeZone},config,controller.signal)
        if(controller.signal.aborted)throw new Error('搜索超过等待上限')
        if(!result.results?.length)throw new Error('没有取得有效搜索结果，可能遇到搜索引擎限制或验证码。')
        return {ok:true,query,searchUrl,searchedAt,engine:'Bing',cached:false,...result,format:selected}
      }catch(error){if(controller.signal.aborted)throw new Error('搜索已取消或超过等待上限。');throw error}
      finally{clearTimeout(timer);externalSignal?.removeEventListener('abort',abort);busy=false}
    }
  }
}
