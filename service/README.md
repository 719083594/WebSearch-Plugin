# 可选 HTTP 搜索服务

这是通用搜索 API 的可选认证适配器，不需要机器人框架，不启动 LLM。默认使用 `provider:auto`，真实引擎、搜索 URL 和 query provenance 原样来自核心；服务不缓存、不落盘、不访问搜索来源网页中的链接。PNG 使用同一份核心搜索结果渲染。

```bash
# 设置你自己的长随机密钥，不能提交到仓库或放进 Dockerfile
export SEARCH_SECRET='your-private-random-secret'
node service/server.mjs
```

默认监听 `0.0.0.0:3080`，可用 `SEARCH_PORT` 修改。需要 Node.js 18.17+、Python 3.10+；PNG 另需 Pillow 与 `/usr/share/fonts/truetype/wqy/wqy-microhei.ttc` 中文字体。Dockerfile 提供包含依赖的可选镜像，在仓库根目录构建：`docker build -f service/Dockerfile -t websearch-service .`。建议仅在内部 Docker 网络使用；公开访问需配置自己的 HTTPS 与网络访问控制。

- `GET /healthz`：不需要认证，返回 `{ok,busy,renderer}`，不包含主机或密钥信息。
- `POST /search`：请求头 `x-search-secret`，JSON `{query:"搜索内容",image:true}`；`query` 去首尾空白后 1–240 字，`image` 可省略为 `false`。
- HTTP 内容最多 4096 字节；401 认证失败、400 参数错误、413 过大、429 正在处理另一请求、502 搜索失败、503 正在关闭。
- 成功返回真实核心结果及 `answerText`、`durationMs`、`cached:false`；需要图片时 `imageBase64` 与 `imageType` 来自核心。渲染不可用时核心的降级标记保留。
- 密钥进行固定长度摘要的常量时间比较；失败不回传内部错误、配置或堆栈。客户端断线和 SIGTERM 会取消正在执行的搜索。

服务支持只读根文件系统；Python 设置 `PYTHONDONTWRITEBYTECODE=1`。容器不需要 Docker socket、root、主机目录或持久数据卷。通过环境注入密钥，不将它写入镜像。

测试：`node --test service/server.test.mjs`。`createSearchServer({secret,searchService})` 仅返回未绑定端口的 HTTP Server，允许其他应用注入服务并选择监听方式。
