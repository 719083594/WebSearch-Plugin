# 更新记录

## 2.0.0

- 改名WebSearch-Plugin，提供独立Node API、JSON/文字/PNG命令行、离线/联网诊断。
- 云崽基类仅存在于integrations/yunzai，安装器显式--yunzai-bridge生成本地标记，核心和CLI无需框架。
- 可选认证endpoint客户端兼容既有browser sidecar，保留answerText及原图、共享并发、取消和聊天期限hook。
- 保留旧config/plugin.json参数、搜索命令、权限、群引用、缺图回退及Chaite/search-client兼容接口。
- 新增独立导入、CLI输出、安装迁移、真实PNG与服务认证/边界测试。

## 1.0.2

- 添加 OrangeJuice 原生插件主页、命令与逐字段配置声明。
- 标明配置重启生效，保留已有运行行为。


## 1.0.1

- 添加统一风格的本地图标、驼峰显示名称、作者和功能介绍。
- 元数据自动适配安装目录，发布包包含图标和识别文件。

- 搜索命令显式使用所有人权限，补充普通成员文字和图片搜索测试。
- 可选 GPT 工具接入说明明确要求选择公共权限。

## 1.0.0

- 独立云崽搜索命令，支持#和/，无需AI、API Key或额外搜索服务。
- 每次联网获取Bing搜索结果，提供文字/真实结果图与时间、来源。
- 图片依赖缺失和框架图片接口缺失时回退文字。
- 私聊不引用、群聊引用；可配置主人权限与命令冷却。
- 完整Python解析/渲染支持、安装器、诊断器、可选Chaite适配器。
- Linux原生/Docker与Windows安装说明，离线测试和合成示例。
- 沿用PolyForm Noncommercial 1.0.0非商业许可。
