// Public help source only. Offline tooling turns these topics into fixed JPEGs.
export const helpTopics=Object.freeze({
  'search-help':{
    title:'联网搜索 · WebSearch',
    subtitle:'输入关键词，查看真实网页结果与来源。',
    groups:[
      {title:'开始搜索',items:[
        {command:'#搜索 关键词',description:'自动选择文字结果或搜索结果图片'},
        {command:'#搜文 关键词',description:'查看文字摘要与原始来源链接'},
        {command:'#搜图 关键词',description:'将本次真实搜索结果整理为图片'}
      ]},
      {title:'帮助与检查',items:[
        {command:'#搜索帮助',description:'查看这张使用指南'},
        {command:'#搜索帮助 文字',description:'查看文字版说明'},
        {command:'#搜索诊断',description:'检查 Python、Pillow 与中文字体',permission:'仅机器人主人可用'}
      ]},
      {title:'使用提示',items:[
        {command:'直接发送，无需 @ 机器人',description:'所有指令同时支持 # 和 / 开头'},
        {command:'每次搜索都重新联网',description:'结果来自网页搜索摘要；搜索时间不等于来源内容更新时间'}
      ]},
      {title:'结果与权限',items:[
        {command:'图片暂不可用时显示文字结果',description:'来源链接仍可继续查阅'},
        {command:'遵循当前机器人的搜索设置',description:'若启用「仅主人可搜索」，帮助与搜索也仅主人可用'}
      ]}
    ],
    footer:'建议使用具体关键词；重要信息请打开来源页面核实。'
  }
});
