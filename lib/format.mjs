export function formatText(result, config = {timeZone:'Asia/Shanghai'}) {
  const time = new Date(result.searchedAt).toLocaleString('zh-CN', {timeZone:config.timeZone, hour12:false})
  return [`联网搜索：${result.query}`, `搜索时间：${time}（${config.timeZone}）`, ...(result.answerText?[result.answerText]:[]), ...result.results.map((r,i) => `${i+1}. ${r.title}\n${r.snippet}\n${r.url}`), '搜索时间不等于来源数据更新时间。'].join('\n\n')
}
