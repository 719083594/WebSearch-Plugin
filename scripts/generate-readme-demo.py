#!/usr/bin/env python3
"""Render README artwork from offline fixtures. Never contact a search provider."""
import argparse
import base64
import importlib.util
import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--font', help='Optional CJK font path')
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('readme_search_document', ROOT / 'renderer/document.py')
document = importlib.util.module_from_spec(spec)
spec.loader.exec_module(document)
font_path = document.find_font(args.font or '')
if not font_path:
    raise SystemExit('A CJK font is required; pass --font /path/to/font.ttc')

# Handwritten fixtures: these are not fetched pages or live search results.
rows = [
    {'title': '【演示】Example Domain · 示例域名',
     'snippet': '离线手工摘要，用来展示标题、摘要与原始链接的排版。这里只展示图片效果，不代表已发起搜索或验证来源内容。',
     'url': 'https://example.com/'},
    {'title': '【演示】IANA · 域名资料入口',
     'snippet': '第二条同样使用手工演示数据。调用方可以读取结构化结果，或发送带来源链接的文字与图片。',
     'url': 'https://www.iana.org/domains/reserved'},
    {'title': '【演示】Example.org · 保留原始来源',
     'snippet': '最后一条演示完整 URL 的显示。真实查询结果由搜索源返回；安全验证或空结果会明确报错。',
     'url': 'https://example.org/'},
]
data = {'query': '离线演示：文档中的示例域名', 'searchedAt': '2026-01-01T00:00:00Z',
        'timeZone': 'Asia/Shanghai', 'synthetic': True, 'imageType': 'png', 'fontPath': font_path}
output = ROOT / 'docs/images'
output.mkdir(parents=True, exist_ok=True)
raw = base64.b64decode(document.render(data, rows))
(output / 'search-result.png').write_bytes(raw)
result = Image.open(io.BytesIO(raw)).convert('RGB')

# The renderer output is pasted intact; the surrounding frame is README artwork.
width, height = 1280, 292 + result.height + 166
canvas = Image.new('RGB', (width, height))
draw = ImageDraw.Draw(canvas)
for y in range(height):
    t = y / (height - 1)
    draw.line((0, y, width, y), fill=(round(234 - 14*t), round(249 - 7*t), round(241 - 10*t)))
def font(size):
    return ImageFont.truetype(font_path, size)
def text(xy, value, size=24, color='#173c2b'):
    draw.text(xy, value, font=font(size), fill=color)
draw.rounded_rectangle((70, 54, 1210, 104), 25, fill='#d5eee0')
text((92, 64), 'WEBSEARCH  /  原生结果预览', 20, '#276448')
text((1040, 64), '离线演示', 20, '#276448')
text((70, 130), '结果有摘要，来源有迹可循。', 46)
text((73, 199), '同一份搜索结果 · JSON / 文字 / 图片', 25, '#536e60')
top = 278
draw.rounded_rectangle((84, top + 12, 1196, top + result.height + 32), 25, fill='#c8dece')
draw.rounded_rectangle((84, top, 1196, top + result.height + 20), 25, fill='white')
canvas.paste(result, (100, top + 10))
y = top + result.height + 63
for x, label in [(70, '完整关键词'), (465, '摘要与原始链接'), (860, '北京时间')]:
    draw.rounded_rectangle((x, y, x + 350, y + 56), 16, fill='#f8fcf9')
    text((x + 22, y + 12), label, 23)
text((73, y + 80), '手工合成数据 · 原生 renderer 输出 · 未发起联网搜索', 19, '#5e7769')
canvas.save(output / 'showcase.png', optimize=True)
print('Generated docs/images/search-result.png and docs/images/showcase.png (offline fixtures).')
