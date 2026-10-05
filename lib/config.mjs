import fs from 'node:fs'
import {fileURLToPath} from 'node:url'

export const defaults={provider:'bing',endpoint:'',secret:'',pythonPath:process.platform==='win32'?'python':'python3',fontPath:'',timeoutMs:26000,maxResults:5,masterOnly:false,cooldownMs:5000,timeZone:'Asia/Shanghai'}
export const configFile=new URL('../config/plugin.json',import.meta.url)
export function normalizeConfig(input={}){
  const c={...defaults}
  for(const name of Object.keys(c))if(input[name]!==undefined)c[name]=input[name]
  for(const name of ['pythonPath','fontPath','timeZone','provider','endpoint','secret'])if(typeof c[name]!=='string'||/[\0\r\n]/.test(c[name]))throw new Error('搜索配置 '+name+' 无效')
  if(!['bing','endpoint'].includes(c.provider))throw new Error('provider必须是bing或endpoint')
  if(c.provider==='endpoint'){
    let url
    try{url=new URL(c.endpoint)}catch{throw new Error('endpoint必须是HTTP(S)服务基础地址')}
    if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.search||url.hash)throw new Error('endpoint必须是无登录信息、查询串或片段的HTTP(S)地址')
    if(!c.secret||c.secret.length>4096||!/^[\x20-\x7e]+$/.test(c.secret))throw new Error('endpoint模式需要本地ASCII认证secret，不得公开提交')
    c.endpoint=url.href.replace(/\/$/,'')
  }
  if(!c.pythonPath)throw new Error('pythonPath 不能为空')
  for(const [name,min,max] of [['timeoutMs',1000,30000],['maxResults',1,8],['cooldownMs',0,600000]]){
    if(!Number.isInteger(c[name])||c[name]<min||c[name]>max)throw new Error('搜索配置 '+name+' 超出允许范围')
  }
  if(typeof c.masterOnly!=='boolean')throw new Error('masterOnly 必须是布尔值')
  try{new Intl.DateTimeFormat('zh-CN',{timeZone:c.timeZone})}catch{throw new Error('timeZone 不是有效时区')}
  return c
}
export function readConfig(file=configFile){
  let raw
  try{raw=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')}
  catch(error){if(error.code==='ENOENT')return normalizeConfig();throw new Error('无法读取搜索配置文件，请检查路径及权限')}
  let input
  try{input=JSON.parse(raw)}catch{throw new Error('搜索配置文件不是有效JSON，请检查格式；为保护密钥不输出配置内容')}
  return normalizeConfig(input)
}
export function localConfigPath(){return fileURLToPath(configFile)}
