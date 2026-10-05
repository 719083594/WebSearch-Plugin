import {containsCJK, normalizedQuery} from './engines.mjs'

const stop = new Set(('的 了 是 有 和 与 或 在 为 对 将 被 这 那 我 你 我们 请 请问 帮 帮我 告诉 一下 搜索 查询 查找 联网 什么 哪些 哪个 哪里 哪里有 谁 怎么 如何 为什么 是否 能 可以 需要 有哪些 种类 类型 品种 方法 方式 介绍 相关 关于 最新 当前 现在 吗 呢 a an the and or in of for on to with what which who where when why how is are was were be can do does has have please tell me search find list type types kind kinds breed breeds about latest current').split(' '))
const segmenter=new Intl.Segmenter('zh',{granularity:'word'})

export function queryTerms(query) {
  const parts=[...segmenter.segment(normalizedQuery(query))].filter(p=>p.isWordLike).map(p=>p.segment)
  return [...new Set(parts.filter(p=>!stop.has(p)&&!/^\d+$/.test(p)))]
}
// This is a conservative wrong-topic check, not a semantic answer validator.
// No overlap can be a translation/synonym and is left uncertain. A broad first
// word (often a place) alone cannot validate a multi-topic question.
export function assessRelevance(query, results, answerText='') {
  const terms=queryTerms(query)
  const answer=String(answerText||'').split('\n').filter(line=>!/^\s*(?:联网搜索|搜索时间|搜索来源)\s*[:：]/.test(line)).join(' ')
  const text=normalizedQuery([...results.map(row=>row.title+' '+row.snippet),answer].join(' ')).split(normalizedQuery(query)).join(' ')
  const matched=terms.filter(term=>text.includes(term)||(/^[a-z]{4,}s$/.test(term)&&text.includes(term.slice(0,-1))))
  if(!terms.length)return {status:'uncertain',reason:'no-subject-terms',terms,matched}
  if(terms.length===1)return {status:matched.length?'relevant':'uncertain',reason:matched.length?'subject-match':'possible-synonym',terms,matched}
  if(matched.some(term=>term!==terms[0]))return {status:'relevant',reason:'subject-match',terms,matched}
  if(matched.length===1&&matched[0]===terms[0]) {
    const subjects=terms.slice(1).join('')
    // Partial Han overlap can be a compound abbreviation (医疗保险 -> 医保).
    const partialHan=[...subjects].some(char=>/\p{Script=Han}/u.test(char)&&!'种类型品方法'.includes(char)&&text.includes(char))
    const sameScript=containsCJK(query)?containsCJK(text):/[a-z]/.test(text)
    if(sameScript&&!partialHan)return {status:'unrelated',reason:'only-first-term-matched',terms,matched}
  }
  return {status:'uncertain',reason:'possible-synonym-or-translation',terms,matched}
}
export function ensureRelevant(query, results, answerText='') {
  const assessment=assessRelevance(query,results,answerText)
  if(assessment.status==='unrelated')throw new Error('搜索结果只匹配开头词，缺少问题主题，未当作有效结果')
  return assessment
}
