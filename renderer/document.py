#!/usr/bin/env python3
"""Parse inert Bing/360/Sogou HTML and render sources; no HTTP or shell."""
import base64,datetime,io,json,os,re,sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs,urljoin,urlsplit
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError

class Node:
    def __init__(self,tag,attrs=None):self.tag=tag;self.attrs=dict(attrs or []);self.children=[]
    def classes(self):return set((self.attrs.get('class') or '').split())
    def hidden(self):return self.tag in ('script','style','noscript') or 'hidden' in self.attrs or self.attrs.get('aria-hidden')=='true' or re.search(r'display\s*:\s*none',self.attrs.get('style') or '',re.I)
class ResultsParser(HTMLParser):
    void={'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self):super().__init__(convert_charrefs=True);self.root=Node('document');self.stack=[self.root]
    def handle_starttag(self,tag,attrs):
        node=Node(tag,attrs);self.stack[-1].children.append(node)
        if tag not in self.void:self.stack.append(node)
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in self.void:self.handle_endtag(tag)
    def handle_endtag(self,tag):
        for index in range(len(self.stack)-1,0,-1):
            if self.stack[index].tag==tag:self.stack=self.stack[:index];break
    def handle_data(self,data):self.stack[-1].children.append(data)

def walk(node):
    if node.hidden():return
    yield node
    for child in node.children:
        if isinstance(child,Node):yield from walk(child)
def node_text(node):
    if node.hidden():return ''
    return ''.join(node_text(child) if isinstance(child,Node) else child for child in node.children)

def clean(value,limit):return re.sub(r'\s+',' ',re.sub(r'[\x00-\x08\x0b-\x1f]','',value)).strip()[:limit]
def source_url(value,search_url):
    value=urljoin(search_url,value)
    parsed=urlsplit(value)
    if parsed.hostname in ('cn.bing.com','www.bing.com','bing.com') and parsed.path.startswith('/ck/'):
        token=parse_qs(parsed.query).get('u',[''])[0]
        if token.startswith('a1'):
            try:value=base64.urlsafe_b64decode(token[2:]+'='*((-len(token[2:]))%4)).decode();parsed=urlsplit(value)
            except (ValueError,UnicodeError):return ''
    if parsed.scheme not in ('http','https') or not parsed.hostname or parsed.username or parsed.password:return ''
    return value[:500]
def inspect_document(html,search_url,limit=5,engine=None):
    host=urlsplit(search_url).hostname
    engine=engine or ('360' if host in ('www.so.com','so.com') else 'sogou' if host in ('www.sogou.com','sogou.com') else 'bing')
    parser=ResultsParser();parser.feed(html);nodes=list(walk(parser.root));results=[];seen=set()
    for container in nodes:
        classes=container.classes()
        is_result=(engine=='bing' and container.tag=='li' and 'b_algo' in classes) or (engine=='360' and container.tag=='li' and 'res-list' in classes) or (engine=='sogou' and container.tag=='div' and bool(classes&{'vrwrap','rb'}))
        if not is_result:continue
        descendants=list(walk(container))
        heading=next((node for node in descendants if node.tag==('h2' if engine=='bing' else 'h3')),None)
        if heading is None:continue
        link=next((node for node in walk(heading) if node.tag=='a' and node.attrs.get('href')),None)
        if link is None:continue
        # 360 gives the actual source in data-mdurl beside an opaque /link URL.
        url=source_url(link.attrs.get('data-mdurl') or link.attrs.get('data-replaceurl') or link.attrs.get('href',''),search_url)
        title=clean(node_text(heading),180)
        if not url or url in seen or not title:continue
        if engine=='bing':snippets=[node for node in descendants if node.tag=='p']
        else:snippets=[node for node in descendants if node.classes()&{'res-desc','res-list-summary','str_info','str-text','space-txt','text-layout'}]
        # Use innermost selected regions once, so wrapper+child do not repeat.
        if not snippets:snippets=[node for node in descendants if node.tag=='p' and not node.classes()&{'g-linkinfo'}]
        selected=[node for node in snippets if not any(child is not node and child in list(walk(node)) for child in snippets)]
        snippet=clean(' '.join(node_text(node) for node in selected),350)
        seen.add(url);results.append({'title':title,'url':url,'snippet':snippet})
        if len(results)>=limit:break
    inputs=[node for node in nodes if node.tag=='input' and node.attrs.get('value') and (node.attrs.get('id') in ('sb_form_q','upquery','keyword','input','bottom_form_querytext') or node.attrs.get('name') in ('q','query'))]
    visible=next((node for node in inputs if node.attrs.get('type')!='hidden'),None)
    effective=(visible or (inputs[0] if inputs else None))
    title=clean(' '.join(node_text(node) for node in nodes if node.tag=='title'),300)
    blocked=bool(re.match(r'^(?:安全验证|访问验证|人机验证|验证码|captcha|security check)(?:\s|[-_—：:]|$)',title,re.I))
    requested=parse_qs(urlsplit(search_url).query).get('q' if engine!='sogou' else 'query',[''])[0]
    if blocked and results and effective and effective.attrs['value']==requested and title.lower().startswith(requested.lower()+' - '):blocked=False
    if not results:
        text=clean(node_text(parser.root),1200)
        blocked=blocked or bool(re.search(r'请完成.{0,8}(?:验证|验证码)|检测到异常访问|请输入验证码|verify (?:you are|that you are) human',text,re.I))
    output={'results':[] if blocked else results,'renderer':'web-result-card','blocked':blocked}
    if effective:output['effectiveQuery']=effective.attrs['value']
    return output
def parse_results(html,search_url,limit=5,engine=None):return inspect_document(html,search_url,limit,engine)['results']

def find_font(specified=''):
    if specified:return specified if Path(specified).is_file() else None
    fonts=['/usr/share/fonts/truetype/wqy/wqy-microhei.ttc','/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf',str(Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts/msyh.ttc'),str(Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts/simhei.ttf'),'/System/Library/Fonts/PingFang.ttc']
    return next((p for p in fonts if Path(p).is_file()),None)
def dependencies(font_path=''):
    result={'python':'.'.join(map(str,sys.version_info[:3])),'pillow':None,'fontAvailable':False,'imageReady':False}
    try:
        import PIL
        from PIL import ImageFont
        result['pillow']=PIL.__version__;font=find_font(font_path)
        if font:ImageFont.truetype(font,24);result['fontAvailable']=True;result['imageReady']=True
    except (ImportError,OSError):pass
    return result
def wrapped(draw,text,font,width):
    line='';lines=[]
    for c in text:
        if c=='\n' or draw.textlength(line+c,font=font)>width:
            lines.append(line);line='' if c=='\n' else c
        else:line+=c
    if line:lines.append(line)
    return lines
def timestamp(value,zone):
    moment=datetime.datetime.fromisoformat(value.replace('Z','+00:00'))
    try:local=moment.astimezone(ZoneInfo(zone));label=zone
    except ZoneInfoNotFoundError:
        local=moment.astimezone(datetime.timezone(datetime.timedelta(hours=8)) if zone=='Asia/Shanghai' else datetime.timezone.utc)
        label=zone if zone=='Asia/Shanghai' else 'UTC'
    return local.strftime('%Y/%m/%d %H:%M:%S')+' '+label
def render(data,results):
    from PIL import Image,ImageDraw,ImageFont
    font_path=find_font(data.get('fontPath',''))
    if not font_path:raise ValueError('CJK font is missing')
    title=ImageFont.truetype(font_path,30);heading=ImageFont.truetype(font_path,23);body=ImageFont.truetype(font_path,19);small=ImageFont.truetype(font_path,16)
    probe=ImageDraw.Draw(Image.new('RGB',(1,1)));width=980
    cards=[]
    for i,row in enumerate(results[:4]):
        lines=[(wrapped(probe,f"{i+1}. {row['title']}",heading,width),heading,'#175b42'),(wrapped(probe,row['snippet'][:200],body,width),body,'#26392f'),(wrapped(probe,row['url'],small,width),small,'#52675b')]
        cards.append((lines,sum(len(lines)*(font.size+7) for lines,font,_ in lines)+28))
    query_lines=wrapped(probe,'联网搜索：'+data['query'],title,width)
    header=len(query_lines)*37+80
    height=header+sum(size+14 for _,size in cards)+72
    if height>3400:raise ValueError('Image is too tall')
    image=Image.new('RGB',(1080,height),'#f2f6f4');draw=ImageDraw.Draw(image);y=25
    def write(lines,font,color):
        nonlocal y
        for line in lines:draw.text((40,y),line,font=font,fill=color);y+=font.size+7
    write(query_lines,title,'#183c2b')
    time=timestamp(data['searchedAt'],data.get('timeZone','Asia/Shanghai'))
    write([('示例时间：' if data.get('synthetic') else '搜索时间：')+time+(' · 离线合成示例' if data.get('synthetic') else ' · '+str(data.get('engineLabel',data.get('engine','Bing')))+' · 每次重新联网')],small,'#53685d');y+=18
    for lines,size in cards:
        top=y;draw.rounded_rectangle((25,top,1055,top+size),radius=12,fill='white');y+=12
        for content,font,color in lines:write(content,font,color)
        y=top+size+14
    write(['本图全部为合成示例，未发起真实搜索；只展示图片排版。' if data.get('synthetic') else '本图为本次联网搜索结果；搜索时间不等于来源数据更新时间。'],small,'#53685d')
    buffer=io.BytesIO();cropped=image.crop((0,0,1080,min(height,y+22)))
    if data.get('imageType')=='png':cropped.save(buffer,'PNG',optimize=True)
    else:cropped.save(buffer,'JPEG',quality=82)
    return base64.b64encode(buffer.getvalue()).decode()
def process(data):
    if data.get('check'):return dependencies(data.get('fontPath',''))
    output=inspect_document(data['html'],data['searchUrl'],min(8,max(1,int(data.get('maxResults',5)))),data.get('engine'))
    results=output['results']
    if data.get('image') and results:
        try:output['imageBase64']=render(data,results);output['imageType']='png' if data.get('imageType')=='png' else 'jpeg'
        except (ImportError,OSError,ValueError):output['imageUnavailable']=True
    return output
def main():
    try:
        raw=sys.stdin.read(4000001)
        if len(raw)>4000000:raise ValueError('Input too large')
        print(json.dumps(process(json.loads(raw)),ensure_ascii=False))
    except (ValueError,KeyError,TypeError):print(json.dumps({'error':'Invalid search document input'}))
if __name__=='__main__':main()
