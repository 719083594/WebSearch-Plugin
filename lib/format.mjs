export function formatText(result, config = {timeZone:'Asia/Shanghai'}) {
  const time = new Date(result.searchedAt).toLocaleString('zh-CN', {timeZone:config.timeZone, hour12:false})
  const rows=result.results.map((r,i)=>`${i+1}. ${r.title}\n${r.snippet}\n${r.url}`)
  const disclaimer='搜索时间不等于来源数据更新时间。'
  let answer=String(result.answerText||'').replace(/\r\n/g,'\n')
  // Some legacy services return a full formatText body as answerText. Remove
  // only its repeated presentation; keep any additional actual summary.
  if(/^\s*联网搜索\s*[:：]/.test(answer)&&/搜索时间\s*[:：]/.test(answer)){
    answer=answer.replace(/^\s*联网搜索\s*[:：].*$/gm,'').replace(/^\s*搜索时间\s*[:：].*$/gm,'').replace(/^\s*搜索来源\s*[:：].*\nhttps?:\/\/[^\n]+/gm,'')
    for(const row of rows)answer=answer.split(row).join('')
    answer=answer.split(disclaimer).join('').replace(/\n{3,}/g,'\n\n').trim()
  }
  return [`联网搜索：${result.query}`, `搜索时间：${time}（${config.timeZone}）`, ...(result.engine&&result.searchUrl?[`搜索来源：${result.engine}\n${result.searchUrl}`]:[]), ...(answer?[answer]:[]), ...rows, disclaimer].join('\n\n')
}
