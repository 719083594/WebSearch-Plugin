#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createWebSearch, formatText, version} from './api.mjs'

const help = `联网搜索（WebSearch-Plugin）${version}
用法：
  web-search search "关键词" [--format json|text|png|image] [--output 结果.png] [--config 配置.json]
  web-search diagnose [--network] [--config 配置.json]
  web-search --help | --version
JSON为默认输出；png/image需要--output。image保留后端原始PNG/JPEG。图片依赖缺失时输出文字，并在stderr说明。
自动模式（auto）：含汉字优先360/搜狗，其他优先必应/360，每次最多两个源；也可配置固定源或认证服务（endpoint）。
diagnose默认只检查本机，--network才发起联网搜索。`

export async function runCli(argv, {stdout = value => process.stdout.write(value), stderr = value => process.stderr.write(value), writeFile = fs.writeFile, createService = createWebSearch} = {}) {
  try {
    if (!argv.length || argv.includes('--help') || argv.includes('-h')) {stdout(help+'\n'); return 0}
    if (argv.length === 1 && argv[0] === '--version') {stdout(version+'\n'); return 0}
    const [command, ...args] = argv
    if (!['search','diagnose'].includes(command)) throw new Error('未知命令：'+command)
    const options = {format:'json'}, query = []
    for (let i=0; i<args.length; i++) {
      const arg=args[i]
      if (arg==='--network') options.network=true
      else if (['--format','--output','--config'].includes(arg)) {
        if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(arg+' 缺少值')
        options[arg.slice(2)]=args[++i]
      } else if (arg.startsWith('-')) throw new Error('未知参数：'+arg)
      else query.push(arg)
    }
    if (command==='diagnose') {
      if (query.length || options.output || options.format!=='json') throw new Error('diagnose只支持--network和--config')
      stdout(JSON.stringify(await createService({configPath:options.config}).diagnose({network:!!options.network}),null,2)+'\n')
      return 0
    }
    if (options.network) throw new Error('--network只用于diagnose')
    const imageOutput=['png','image'].includes(options.format)
    if (!['json','text','png','image'].includes(options.format)) throw new Error('--format必须是json、text、png或image')
    if (imageOutput && !options.output) throw new Error('图片输出需要--output 结果.png或结果.jpg')
    if (options.output && !imageOutput) throw new Error('--output只用于图片')
    if (!query.join(' ').trim()) throw new Error('请输入搜索关键词')
    const service=createService({configPath:options.config})
    const result=await service.search(query.join(' '),imageOutput?'image':'text',{imageType:options.format==='image'?'jpeg':'png'})
    if (options.format==='json') stdout(JSON.stringify(result,null,2)+'\n')
    else if (imageOutput && result.imageBase64) {
      if (options.format==='png'&&result.imageType!=='png') throw new Error('后端未返回PNG，未写入目标文件；可用--format image --output 结果.jpg保留后端原图')
      await writeFile(path.resolve(options.output),Buffer.from(result.imageBase64,'base64'))
      stderr((result.imageType||'image').toUpperCase()+'已写入：'+path.resolve(options.output)+'\n')
    } else {
      if (imageOutput) stderr('图片依赖缺失，已回退文字；目标图片未写入。\n')
      stdout(formatText(result,service.config)+'\n')
    }
    return 0
  } catch (error) {stderr('联网搜索：'+error.message+'\n'); return 1}
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) process.exitCode=await runCli(process.argv.slice(2))
