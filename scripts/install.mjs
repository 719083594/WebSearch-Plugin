import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {normalizeConfig,readConfig} from '../lib/config.mjs'
import {runDocument} from '../lib/search.mjs'

const args=process.argv.slice(2),options={}
if(args.includes('--help')){
  console.log('WebSearch-Plugin安装器：--python 路径 --font 路径 --config 配置路径 --install-deps --master-only --force-config --yunzai-bridge --standalone\n默认仅生成独立搜索配置。--yunzai-bridge显式启用云崽适配器，要求完整项目放在云崽plugins目录。')
  process.exit(0)
}
for(let i=0;i<args.length;i++){
  const arg=args[i]
  if(['--install-deps','--force-config','--master-only','--yunzai-bridge','--standalone'].includes(arg))options[arg]=true
  else if(['--python','--font','--config'].includes(arg)&&args[i+1]&&!args[i+1].startsWith('--'))options[arg]=args[++i]
  else throw new Error('未知参数或缺少参数值：'+arg+'；运行 --help 查看用法')
}
const root=fileURLToPath(new URL('../',import.meta.url)),destination=options['--config']?path.resolve(options['--config']):path.join(root,'config/plugin.json')
if(options['--yunzai-bridge']&&options['--standalone'])throw new Error('--yunzai-bridge与--standalone不能同时使用')
if(options['--yunzai-bridge']&&!fs.existsSync(path.resolve(root,'../../lib/plugins/plugin.js')))throw new Error('未找到云崽V3插件接口。请将完整项目放到框架plugins/WebSearch-Plugin后启用桥接；独立使用不传--yunzai-bridge。')
const existing=fs.existsSync(destination)&&!options['--force-config']
if(existing&&['--python','--font','--master-only'].some(name=>options[name]!==undefined))throw new Error('本地配置已存在，未覆盖。明确替换才使用--force-config；只启用桥接可直接传--yunzai-bridge。')
if(options['--install-deps']){
  if(process.platform!=='linux'||process.getuid?.()!==0)throw new Error('--install-deps 仅支持以root运行的Debian/Ubuntu；见安装说明')
  for(const command of [['apt-get',['update']],['apt-get',['install','-y','--no-install-recommends','python3','python3-pil','fonts-wqy-microhei']]]){
    const r=spawnSync(command[0],command[1],{stdio:'inherit',shell:false});if(r.status!==0)throw new Error('依赖安装失败')
  }
}
const config=existing?readConfig(destination):normalizeConfig({pythonPath:options['--python']||(process.platform==='win32'?'python':'python3'),fontPath:options['--font']||'',masterOnly:!!options['--master-only']})
let d={python:null,imageReady:false}
try{d=await runDocument({check:true,fontPath:config.fontPath},config)}catch(error){if(config.provider!=='endpoint')throw error}
if(config.provider!=='endpoint'&&(!d.python||Number(d.python.split('.')[0])<3||(Number(d.python.split('.')[0])===3&&Number(d.python.split('.')[1])<10)))throw new Error('需要Python 3.10+')
// Config contains paths/preferences only, no credentials. A root installer must
// leave it readable by a bot running under a different unprivileged user.
if(!existing){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(config,null,2)+'\n',{mode:0o644});fs.chmodSync(destination,0o644)}
if(options['--yunzai-bridge']||options['--standalone']){
  const marker=path.join(root,'config/integration.json')
  fs.mkdirSync(path.dirname(marker),{recursive:true})
  fs.writeFileSync(marker,JSON.stringify({adapter:options['--yunzai-bridge']?'yunzai':'none'},null,2)+'\n',{mode:0o644})
  fs.chmodSync(marker,0o644)
}
console.log(existing?'保留现有搜索配置。':'本地搜索配置已生成。')
console.log(config.provider==='endpoint'?'认证搜索服务模式：图片由服务提供；本机Python/Pillow不是搜索必需组件。':'图片依赖：'+(d.imageReady?'就绪':'未齐全，将自动返回文字；安装Pillow和中文字体后再检查。'))
console.log(options['--yunzai-bridge']?'云崽桥接已启用。重启机器人，发送#搜索帮助或#搜文 测试关键词。':'独立接口：node cli.mjs search "关键词" --format json；依赖诊断：node cli.mjs diagnose。')
