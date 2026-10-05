import fs from 'node:fs'
import {fileURLToPath} from 'node:url'

export const defaults={provider:'auto',endpoint:'',secret:'',pythonPath:process.platform==='win32'?'python':'python3',fontPath:'',timeoutMs:26000,sourceTimeoutMs:8000,maxResults:5,masterOnly:false,cooldownMs:5000,timeZone:'Asia/Shanghai'}
export const configFile=new URL('../config/plugin.json',import.meta.url)
const labels={provider:'搜索后端',endpoint:'认证搜索服务地址',secret:'认证密钥',pythonPath:'Python 命令',fontPath:'中文字体路径',timeZone:'显示时区',timeoutMs:'搜索等待上限',sourceTimeoutMs:'单个搜索源等待上限',maxResults:'最多结果数',cooldownMs:'搜索冷却时间',masterOnly:'仅主人可搜索'}
const fieldName=name=>`${labels[name]||name}（${name}）`
export function normalizeConfig(input={}){
  const c={...defaults}
  for(const name of Object.keys(c))if(input[name]!==undefined)c[name]=input[name]
  for(const name of ['pythonPath','fontPath','timeZone','provider','endpoint','secret'])if(typeof c[name]!=='string'||/[\0\r\n]/.test(c[name]))throw new Error(fieldName(name)+'无效，请填写文本且不要包含换行或空字符')
  if(!['auto','bing','360','sogou','endpoint'].includes(c.provider))throw new Error('搜索后端（provider）必须为自动（auto）、必应（bing）、360 搜索（360）、搜狗（sogou）或认证服务（endpoint）')
  if(c.provider==='endpoint'){
    let url
    try{url=new URL(c.endpoint)}catch{throw new Error('认证服务地址（endpoint）必须是有效的 HTTP(S) 基础地址')}
    if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.search||url.hash)throw new Error('认证服务地址（endpoint）不能包含登录信息、查询参数或地址片段')
    if(!c.secret||c.secret.length>4096||!/^[\x20-\x7e]+$/.test(c.secret))throw new Error('认证服务需要本地 ASCII 认证密钥（secret），不得公开提交')
    c.endpoint=url.href.replace(/\/$/,'')
  }
  if(!c.pythonPath)throw new Error('Python 命令（pythonPath）不能为空')
  for(const [name,min,max] of [['timeoutMs',1000,30000],['sourceTimeoutMs',1000,10000],['maxResults',1,8],['cooldownMs',0,600000]]){
    if(!Number.isInteger(c[name])||c[name]<min||c[name]>max)throw new Error(fieldName(name)+`必须是 ${min}–${max} 范围内的整数`)
  }
  if(typeof c.masterOnly!=='boolean')throw new Error('仅主人可搜索（masterOnly）必须是 true 或 false')
  try{new Intl.DateTimeFormat('zh-CN',{timeZone:c.timeZone})}catch{throw new Error('显示时区（timeZone）不是有效时区')}
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
