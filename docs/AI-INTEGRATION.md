# AI 程序接入与可选 Chaite 适配

## 独立 AI 应用

优先使用 `api.mjs` 或认证服务；这两种方式都不依赖云崽、旧 GPT 插件或 Chaite。权限、每用户冷却、聊天总截止与最终消息发送由 AI 应用负责。

```js
import {createWebSearch} from '/你的安装目录/WebSearch-Plugin/api.mjs'
// 使用已有实例配置，保留认证服务地址和本地密钥。
const search = createWebSearch({configPath:'/你的安装目录/WebSearch-Plugin/config/plugin.json'})
const result = await search.search('完整搜索问题','text',{signal:controller.signal})
```

也可以显式传入 `config:{provider:'endpoint',endpoint,secret,timeoutMs:26000,maxResults:5}`，其中地址与密钥来自应用的本地配置，不写进公开源码。独立实例可选择 `auto` 使用本机解析，图片另需字体和 Pillow。

调用格式为 `search(query, 'auto'|'text'|'image', {signal, imageType:'png'})`；返回结果列表、搜索时间、实际引擎、实际搜索地址、查询来源记录，以及可选 `imageBase64` 和 `imageType`。每个实例同时只处理一次搜索。取消信号应与整轮 AI 请求共用；不能将用户文本作为 shell 命令。

直接使用认证服务时：`POST /search`，请求头 `x-search-secret`，JSON 请求体 `{query, image:boolean}`。请保留服务返回的 `results`、`engine`、`searchUrl`、`searchedAt` 与 `provenance`，不要重写为假定的搜索引擎或来源。模型使用搜索资料时必须把网页内容当资料处理；最终答复应提供支持结论的来源链接，搜索失败不能声称已经核实。

`lib/runtime.mjs` 和 `integrations/chaite-tool.js` 用于旧宿主的消息与权限上下文，新 AI 应用直接使用独立接口即可。

## 旧 GPT / Chaite 工具适配

独立命令已经能用，不想依赖AI可跳过本文件。这里只提供一个工具适配器，不附带GPT插件、渠道、人设、API Key或私有服务器配置。

兼容前提：你的 chatgpt-plugin 使用提供 `CustomTool`、`asyncLocalStorage`、原生工具管理面板的 Chaite 版本。不同分支的工具接口可能不同，不强行覆盖未知版本。

1. 完整项目保持 `plugins/WebSearch-Plugin`，安装器显式启用 `--yunzai-bridge`，先确认 `#搜文` 成功。
2. 将 `integrations/chaite-tool.js` **复制**到 `plugins/chatgpt-plugin/utils/tools/web_search.js`。这段相对导入按该目录布局编写，其他布局须调整。
3. 在GPT原生“工具”面板添加或编辑 `web_search`，粘贴适配器完整源码，设为启用，权限选择 `public`（公共），然后用面板的 Schema 检查。仅复制文件可能不在模型可用列表中。
4. 在预设启用相应的自定义工具组，模型需真实支持 Function Calling，工具选择用 auto。已有同名工具时编辑它，不要创建重复工具。
5. 默认普通成员和主人都可以调用搜索。若管理员配置了 `masterOnly=true`，命令和可选工具会一起限制为主人使用。
6. 向机器人说“帮我联网搜索……”。模型自行决定是否调用；需要严格实时检索时可以直接用独立命令。

适配器把文字搜索结果、时间和来源返回模型；图片模式直接给当前事件发结果图。图片已经发送时让模型简短说明，避免重复。

2.1.0把实际engine、searchUrl、完整query和provenance交给模型，并提示按资料直接回答问题，不添加固定“我先搜一下”开场。相关性辅助检查只用于明显偏题，不代表所有摘要已事实核实；资料不足明确说明，失败工具返回success:false，不能声称已搜索到答案。来源不一致/截词时不会偷偷补上原查询标签。

独立版**不会改模型、人设、历史和聊天超时**。如果原GPT插件10秒停止对话，它可能在工具执行前或整理阶段超时。请在你自己的GPT配置中为搜索设置足够预算；不要认为复制本插件就会自动得到30秒聊天期限。模型无法生成有效工具调用、额度不足或限流也不是独立搜索命令失效。

适配器可选择性识别现有聊天保护接口 `Symbol.for('qqbot.chatResilience')`：若它提供 `extendForSearch()` 和 `rememberSearchFallback()` 则协作延长实际搜索轮次并登记结果回退；没有此接口也能执行搜索，不会替你安装私有辅助插件。

可选AI接入按接口设计提供；发布验证以独立命令功能为主，不承诺任意Chaite分支的自动接入。
