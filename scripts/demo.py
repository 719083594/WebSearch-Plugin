"""Build a synthetic public preview; never capture a real chat or server."""
import base64,importlib.util
from pathlib import Path
root=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('search_document',root/'renderer/document.py');doc=importlib.util.module_from_spec(spec);spec.loader.exec_module(doc)
rows=[{'title':'【合成示例】云崽插件安装指南','snippet':'本预览所有数据为合成，只展示图片排版，不是实际搜索结果。实际命令每次向搜索引擎联网获取内容。','url':'https://example.org/install'},{'title':'【合成示例】文字与图片搜索命令','snippet':'#搜文 关键词 返回文字与来源；#搜图 关键词 返回实际搜索结果图。命令也支持 / 前缀。','url':'https://example.org/commands'},{'title':'【合成示例】依赖和常见问题','snippet':'图片需要Pillow与中文字体；图片依赖缺失时自动返回文字。搜索摘要不代表网站的全部内容。','url':'https://example.org/help'}]
data={'query':'合成演示：独立搜索插件','searchedAt':'2026-01-01T00:00:00Z','timeZone':'Asia/Shanghai','synthetic':True}
destination=root/'docs/preview.jpg';destination.parent.mkdir(exist_ok=True);destination.write_bytes(base64.b64decode(doc.render(data,rows)))
print('Synthetic preview generated.')
