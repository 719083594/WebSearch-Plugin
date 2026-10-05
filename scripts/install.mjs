import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {normalizeConfig} from '../lib/config.mjs'
import {runDocument} from '../lib/search.mjs'

const args=process.argv.slice(2),options={}
for(let i=0;i<args.length;i++){
  const arg=args[i]
  if(['--install-deps','--force-config','--master-only'].includes(arg))options[arg]=true
  else if(['--python','--font'].includes(arg)&&args[i+1])options[arg]=args[++i]
  else throw new Error('未知参数：'+arg+'；支持 --python 路径 --font 路径 --install-deps --master-only --force-config')
}
const root=fileURLToPath(new URL('../',import.meta.url)),destination=path.join(root,'config/plugin.json')
if(fs.existsSync(destination)&&!options['--force-config'])throw new Error('本地配置已存在，未覆盖。使用 #搜索诊断 检查；明确替换才用 --force-config。')
if(options['--install-deps']){
  if(process.platform!=='linux'||process.getuid?.()!==0)throw new Error('--install-deps 仅支持以root运行的Debian/Ubuntu；见安装说明')
  for(const command of [['apt-get',['update']],['apt-get',['install','-y','--no-install-recommends','python3','python3-pil','fonts-wqy-microhei']]]){
    const r=spawnSync(command[0],command[1],{stdio:'inherit',shell:false});if(r.status!==0)throw new Error('依赖安装失败')
  }
}
const config=normalizeConfig({pythonPath:options['--python']||(process.platform==='win32'?'python':'python3'),fontPath:options['--font']||'',masterOnly:!!options['--master-only']})
const d=await runDocument({check:true,fontPath:config.fontPath},config)
if(!d.python||Number(d.python.split('.')[0])<3||(Number(d.python.split('.')[0])===3&&Number(d.python.split('.')[1])<10))throw new Error('需要Python 3.10+')
// Config contains paths/preferences only, no credentials. A root installer must
// leave it readable by a bot running under a different unprivileged user.
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(config,null,2)+'\n',{mode:0o644});fs.chmodSync(destination,0o644)
console.log('本地搜索配置已生成。图片依赖：'+(d.imageReady?'就绪':'未齐全，将自动返回文字；安装Pillow和中文字体后再检查。'))
console.log('下一步：重启云崽，发送 #搜索帮助 或 #搜文 测试关键词。无需启动附属服务。')
