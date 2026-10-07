# 固定帮助图片

`#搜索帮助` 默认发送随源码预先生成的本地 JPEG；`#搜索帮助 文字` 直接查看文字版。未指定关键词的 `#搜索`、`#搜文`、`#搜图` 也会打开帮助。所有指令仍支持 `/` 开头。

公开说明保存在 `lib/help-content.mjs` 的 `helpTopics['search-help']`。离线构建使用 AI-Plugin 的 `buildStaticHelpCards` 和 `createNativeCardRenderer` 生成 `resources/help/search-help-1.jpg` 及 `manifest.json`；修改公开说明后需要重新生成。在线请求只读取并校验本地固定图，不启动浏览器，不访问搜索服务，不调用 AI。

Yunzai 适配器按需加载同级 AI-Plugin 的纯图片发送模块；没有安装 AI-Plugin、图片缺失或校验不通过时显示文字帮助，不影响搜索插件加载。核心 `handleCommand` 可通过可选 `helpReply(event, topic)` 注入其他框架的固定图片发送方式：发送成功返回 `true`，尚未发送返回 `false`，已经部分发送后失败应抛出异常，避免重复追加文字。

原有 `masterOnly` 权限检查先于帮助图片回调；诊断仍只有机器人主人可以使用。固定图片只含公开命令说明，不含配置、密钥或搜索结果。
