import {runDocument} from './search.mjs'
import {formatText} from './format.mjs'
export {formatText} from './format.mjs'

const users=new Map()
export const help='实时搜索（#和/都可以）：\n#搜索 关键词：自动选择文字或结果图\n#搜文 关键词：文字结果与来源\n#搜图 关键词：真实搜索结果图\n#搜索帮助：使用说明\n#搜索诊断：主人检查Python、Pillow和字体\n每次重新联网，返回本次搜索结果。结果是网页搜索摘要，搜索时间不等于来源数据更新时间。'
async function replyResult(e,message,quote){
  const outcome=await e.reply(message,quote)
  if(outcome===false||outcome?.error)throw new Error('搜索结果消息发送失败')
  return outcome
}
function delivery(format,receipt){return {...(receipt&&typeof receipt==='object'?receipt:{}),delivered:true,format,receipt}}
export async function deliverResult(e,result,{config,image}){
  const quote=Boolean(e.isGroup)
  if(result.format==='image'&&result.imageBase64){
    let segment
    try{segment=image(Buffer.from(result.imageBase64,'base64'))}catch{return delivery('text',await replyResult(e,'图片消息接口不可用，改为文字结果。\n\n'+formatText(result,config),quote))}
    return delivery('image',await replyResult(e,[`联网搜索：${result.query}\n${result.searchUrl}`,segment],quote))
  }
  const note=result.format==='image'?'图片渲染不可用，已改为文字结果。主人可运行 #搜索诊断 检查依赖。\n\n':''
  return delivery('text',await replyResult(e,note+formatText(result,config),quote))
}
export async function handleCommand(e,{searcher,config,image,diagnose=()=>runDocument({check:true,fontPath:config.fontPath},config),now=Date.now}){
  const match=String(e.msg||'').trim().match(/^[#/](搜索|搜图|搜文|搜索帮助|搜索诊断)(?:\s+(.*))?$/s)
  if(!match)return false
  if(config.masterOnly&&!e.isMaster)return true
  const [,command,rawQuery]=match,query=rawQuery?.trim(),quote=Boolean(e.isGroup)
  if(command==='搜索诊断'){
    if(!e.isMaster)return true
    try{const d=await diagnose();await e.reply(`搜索依赖检查：\n后端：${config.provider==='endpoint'?'已配置认证搜索服务':'本机Bing解析'}\nPython：${d.python||'未配置'}\nPillow：${d.pillow||'未安装'}\n中文字体：${d.fontAvailable?'可用':'未找到'}\n本机图片能力：${d.imageReady?'就绪':config.provider==='endpoint'?'由搜索服务提供图片；本机渲染依赖未齐全':'可用文字模式，需补齐图片依赖'}\n本检查不联网，实际网络请使用 #搜文 关键词。`,quote)}
    catch{await e.reply('搜索依赖检查失败：请确认Python可执行文件及完整插件目录，按安装说明配置。',quote)}
    return true
  }
  if(command==='搜索帮助'||!query){await e.reply(help,quote);return true}
  const user=String(e.user_id??e.sender?.user_id??'anonymous'),time=now()
  if(time-(users.get(user)??-Infinity)<config.cooldownMs){await e.reply('搜索请求太频繁，请稍后再试。',quote);return true}
  users.set(user,time);if(users.size>1000)users.delete(users.keys().next().value)
  try{await deliverResult(e,await searcher.search(query,command==='搜图'?'image':command==='搜文'?'text':'auto'),{config,image})}
  catch(error){await e.reply('这次联网搜索没有成功：'+error.message,quote)}
  return true
}
