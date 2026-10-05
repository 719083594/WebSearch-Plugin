import {readConfig} from '../lib/config.mjs'
import {runDocument,createSearcher} from '../lib/search.mjs'
const config=readConfig()
try{
  const dependencies=await runDocument({check:true,fontPath:config.fontPath},config)
  const result={node:process.versions.node,...dependencies,masterOnly:config.masterOnly,timeoutMs:config.timeoutMs,networkChecked:false}
  if(process.argv.includes('--network')){
    const search=await createSearcher({config}).search('北京时间','text')
    result.networkChecked=true;result.resultCount=search.results.length;result.searchedAt=search.searchedAt
  }
  console.log(JSON.stringify(result,null,2))
  if(!dependencies.imageReady)console.log('文字模式可用；图片需要Pillow及中文字体。详见docs/INSTALL.md。')
}catch(error){console.error('诊断失败：'+error.message);process.exitCode=1}
