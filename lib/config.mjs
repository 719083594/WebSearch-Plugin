import fs from 'node:fs'
import {fileURLToPath} from 'node:url'

export const defaults={pythonPath:process.platform==='win32'?'python':'python3',fontPath:'',timeoutMs:26000,maxResults:5,masterOnly:false,cooldownMs:5000,timeZone:'Asia/Shanghai'}
export const configFile=new URL('../config/plugin.json',import.meta.url)
export function normalizeConfig(input={}){
  const c={...defaults}
  for(const name of Object.keys(c))if(input[name]!==undefined)c[name]=input[name]
  for(const name of ['pythonPath','fontPath','timeZone'])if(typeof c[name]!=='string'||/[\0\r\n]/.test(c[name]))throw new Error('搜索配置 '+name+' 无效')
  if(!c.pythonPath)throw new Error('pythonPath 不能为空')
  for(const [name,min,max] of [['timeoutMs',1000,30000],['maxResults',1,8],['cooldownMs',0,600000]]){
    if(!Number.isInteger(c[name])||c[name]<min||c[name]>max)throw new Error('搜索配置 '+name+' 超出允许范围')
  }
  if(typeof c.masterOnly!=='boolean')throw new Error('masterOnly 必须是布尔值')
  try{new Intl.DateTimeFormat('zh-CN',{timeZone:c.timeZone})}catch{throw new Error('timeZone 不是有效时区')}
  return c
}
export function readConfig(file=configFile){
  try{return normalizeConfig(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')))}
  catch(error){if(error.code==='ENOENT')return normalizeConfig();throw error}
}
export function localConfigPath(){return fileURLToPath(configFile)}
