# 测试范围

```bash
node --test tests/*.test.mjs
python3 tests/document_test.py
node scripts/diagnose.mjs
```

图片测试需要Pillow及中文字体；Windows替换为你的 Python 命令。

Node离线测试验证查询编码、每次新请求、并发门控、HTTP错误/空结果、Bing重定向范围、HTML体积上限、取消请求、输出格式、配置校验、双前缀、群/私聊引用、主人限制、诊断权限、个人冷却以及图片不可用时的文字回退。

Python离线测试验证Bing自然结果HTML、转义文本、危险URL过滤、同源链接去重、结果条数、Bing原始来源解码、脚本标签不作为内容、字体缺失回退、真实JPEG、中文排版及北京时间转换。合成预览由 `scripts/demo.py` 生成。

发布前在Linux容器中测试完整公共包：标准Python依赖、安装器、本地配置保护、正式命令处理函数、实际联网文字结果与图片段。测试使用模拟框架事件捕获消息，不发送QQ、不访问聊天历史、不调用模型。

TRSS/Miao等按云崽V3接口设计；其他兼容分支不等于都完成真人QQ验证。搜索引擎可用性和实时性取决于实际网络和来源。自动CI离线运行，不向搜索引擎发送请求。

GitHub Actions 在 Linux 的 Node22/24上执行Node/Python测试和依赖诊断。依赖安装器不会在测试中自动修改真实机器人，联网诊断要显式传入 `--network`。
