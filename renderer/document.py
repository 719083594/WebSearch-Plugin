#!/usr/bin/env python3
"""Parse inert Bing HTML and optionally render actual results; no HTTP or shell."""
import base64,datetime,io,json,os,re,sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs,urljoin,urlsplit
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError

class ResultsParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results=[];self.stack=[];self.row=None;self.row_depth=0;self.in_h2=False;self.in_p=False
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs);self.stack.append(tag)
        if tag=='li' and 'b_algo' in attrs.get('class','').split():
            self.row={'title':'','url':'','snippet':''};self.row_depth=len(self.stack)
        if self.row:
            if tag=='h2':self.in_h2=True
            if tag=='a' and self.in_h2 and not self.row['url']:self.row['url']=attrs.get('href','')
            if tag=='p':self.in_p=True
        if tag in ('meta','link','img','br','input','hr','source','wbr'):self.stack.pop()
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag in self.stack:self.handle_endtag(tag)
    def handle_endtag(self,tag):
        if self.row:
            if tag=='h2':self.in_h2=False
            if tag=='p':self.in_p=False
            if tag=='li' and len(self.stack)==self.row_depth:
                if self.row['title'].strip() and self.row['url']:self.results.append(self.row)
                self.row=None;self.in_h2=False;self.in_p=False
        if tag in self.stack:
            index=len(self.stack)-1-self.stack[::-1].index(tag);self.stack=self.stack[:index]
    def handle_data(self,data):
        if self.row and not any(t in self.stack for t in ('script','style')):
            if self.in_h2:self.row['title']+=data
            elif self.in_p:self.row['snippet']+=data

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
def parse_results(html,search_url,limit=5):
    parser=ResultsParser();parser.feed(html);results=[];seen=set()
    for row in parser.results:
        url=source_url(row['url'],search_url)
        if not url or url in seen:continue
        seen.add(url);results.append({'title':clean(row['title'],180),'url':url,'snippet':clean(row['snippet'],350)})
        if len(results)>=limit:break
    return results

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
    write([('示例时间：' if data.get('synthetic') else '搜索时间：')+time+(' · 离线合成示例' if data.get('synthetic') else ' · Bing · 每次重新联网')],small,'#53685d');y+=18
    for lines,size in cards:
        top=y;draw.rounded_rectangle((25,top,1055,top+size),radius=12,fill='white');y+=12
        for content,font,color in lines:write(content,font,color)
        y=top+size+14
    write(['本图全部为合成示例，未发起真实搜索；只展示图片排版。' if data.get('synthetic') else '本图为本次联网搜索结果；搜索时间不等于来源数据更新时间。'],small,'#53685d')
    buffer=io.BytesIO();image.crop((0,0,1080,min(height,y+22))).save(buffer,'JPEG',quality=82)
    return base64.b64encode(buffer.getvalue()).decode()
def process(data):
    if data.get('check'):return dependencies(data.get('fontPath',''))
    results=parse_results(data['html'],data['searchUrl'],min(8,max(1,int(data.get('maxResults',5)))))
    output={'results':results,'renderer':'web-result-card'}
    if data.get('image') and results:
        try:output['imageBase64']=render(data,results);output['imageType']='jpeg'
        except (ImportError,OSError,ValueError):output['imageUnavailable']=True
    return output
def main():
    try:
        raw=sys.stdin.read(4000001)
        if len(raw)>4000000:raise ValueError('Input too large')
        print(json.dumps(process(json.loads(raw)),ensure_ascii=False))
    except (ValueError,KeyError,TypeError):print(json.dumps({'error':'Invalid search document input'}))
if __name__=='__main__':main()
