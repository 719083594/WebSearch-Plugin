// Authenticated client for an optional existing search service. Does not start
// a listener and never forwards secrets across redirects.
const MAX_RESPONSE=8000000

export async function requestEndpoint(query, format, config, fetchImpl, signal) {
  const response=await fetchImpl(config.endpoint+'/search',{
    method:'POST',redirect:'manual',cache:'no-store',signal,
    headers:{'content-type':'application/json','x-search-secret':config.secret},
    body:JSON.stringify({query,image:format==='image'})
  })
  if(!response.ok){await response.body?.cancel();throw new Error('搜索服务返回HTTP '+response.status)}
  if(!response.body)throw new Error('搜索服务返回空响应')
  const chunks=[];let size=0
  for await(const chunk of response.body){size+=chunk.byteLength;if(size>MAX_RESPONSE){await response.body.cancel().catch(()=>{});throw new Error('搜索服务响应过大')};chunks.push(Buffer.from(chunk))}
  let result
  try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new Error('搜索服务未返回有效JSON')}
  if(!result.ok)throw new Error('搜索服务未能取得结果')
  if(!Array.isArray(result.results))throw new Error('搜索服务返回无效结果列表')
  const results=result.results.filter(row=>{
    if(!row||typeof row.title!=='string'||typeof row.snippet!=='string'||typeof row.url!=='string')return false
    try{const u=new URL(row.url);return ['http:','https:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password}catch{return false}
  }).slice(0,config.maxResults).map(row=>({title:row.title.slice(0,180),snippet:row.snippet.slice(0,350),url:row.url.slice(0,500)}))
  if(!results.length)throw new Error('搜索服务没有取得有效来源')
  if(typeof result.searchedAt!=='string'||!Number.isFinite(Date.parse(result.searchedAt)))throw new Error('搜索服务缺少有效搜索时间')
  const output={ok:true,query,results,searchedAt:result.searchedAt,engine:typeof result.engine==='string'?result.engine:'Bing',searchUrl:'https://cn.bing.com/search?q='+encodeURIComponent(query),cached:!!result.cached,format}
  if(typeof result.answerText==='string')output.answerText=result.answerText.slice(0,20000)
  if(format==='image'&&typeof result.imageBase64==='string'){
    const header=Buffer.from(result.imageBase64.slice(0,24),'base64')
    if(header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){output.imageBase64=result.imageBase64;output.imageType='png'}
    else if(header[0]===255&&header[1]===216&&header[2]===255){output.imageBase64=result.imageBase64;output.imageType='jpeg'}
    else output.imageUnavailable=true
  }
  if(format==='image'&&!output.imageBase64)output.imageUnavailable=true
  return output
}
