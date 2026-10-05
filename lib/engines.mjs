export const engines = {
  bing: {name:'Bing', url:'https://cn.bing.com/search', queryKey:'q', hosts:['cn.bing.com','www.bing.com','bing.com']},
  '360': {name:'360', url:'https://www.so.com/s', queryKey:'q', hosts:['www.so.com','so.com']},
  sogou: {name:'Sogou', url:'https://www.sogou.com/web', queryKey:'query', hosts:['www.sogou.com','sogou.com']}
}
export const normalizedQuery = value => String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase()
export const containsCJK = query => /\p{Script=Han}/u.test(query)
export function engineOrder(query, provider='auto') {
  if(provider!=='auto')return [provider]
  return (containsCJK(query)?['360','sogou','bing']:['bing','360','sogou']).slice(0,2)
}
export function searchAddress(engine, query) {
  const definition=engines[engine]
  if(!definition)throw new Error('不支持的搜索引擎')
  const url=new URL(definition.url);url.searchParams.set(definition.queryKey,query)
  return url.href
}
export function validateSearchAddress(value, engine, requestedQuery) {
  const definition=engines[engine]
  let url
  try{url=new URL(value)}catch{throw new Error('搜索引擎返回无效地址')}
  if(!definition||url.protocol!=='https:'||!definition.hosts.includes(url.hostname)||url.username||url.password)throw new Error('搜索引擎重定向到不支持的地址')
  const actual=url.searchParams.get(definition.queryKey)
  if(actual===null||normalizedQuery(actual)!==normalizedQuery(requestedQuery))throw new Error('搜索引擎改变或丢失了完整关键词，未使用该页面')
  return {url:url.href,effectiveQuery:actual}
}
export function inferEngine(value) {
  let url
  try{url=new URL(value)}catch{return null}
  return Object.keys(engines).find(key=>engines[key].hosts.includes(url.hostname))||null
}
