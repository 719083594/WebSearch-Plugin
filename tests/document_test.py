import base64,datetime,importlib.util,io,sys,unittest
from pathlib import Path
root=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('search_document',root/'renderer/document.py');doc=importlib.util.module_from_spec(spec);spec.loader.exec_module(doc)
def row(title,url,snippet):return f'<li class="b_algo"><h2><a href="{url}"><strong>{title}</strong><img src="unused" /></a></h2><div><p>{snippet}</p></div></li>'
class DocumentTests(unittest.TestCase):
    def test_actual_structure_entities_and_untrusted_urls(self):
        html='<ol>'+row('标题 &amp; 内容','https://example.org/a','文本 &lt;b&gt;')+row('Bad','javascript:alert(1)','unused')+row('Credentials','https://user:pass@example.org/','unused')+'</ol>'
        r=doc.parse_results(html,'https://cn.bing.com/search?q=test');self.assertEqual(len(r),1);self.assertEqual(r[0]['title'],'标题 & 内容');self.assertEqual(r[0]['snippet'],'文本 <b>')
    def test_duplicate_links_and_limit(self):
        html=row('a','https://example.org/a','one')+row('a','https://example.org/a','two')+row('b','https://example.org/b','three')
        self.assertEqual(len(doc.parse_results(html,'https://cn.bing.com/search?q=x')),2)
        self.assertEqual(len(doc.parse_results(html,'https://cn.bing.com/search?q=x',1)),1)
    def test_bing_source_redirect_and_no_script_execution(self):
        encoded='a1'+base64.urlsafe_b64encode(b'https://example.org/source').decode().rstrip('=')
        r=doc.parse_results(row('Source<script>bad()</script>','https://www.bing.com/ck/a?u='+encoded,'snippet'),'https://cn.bing.com/search?q=x')
        self.assertEqual(r[0]['url'],'https://example.org/source');self.assertEqual(r[0]['title'],'Source')
    def test_missing_font_falls_back_without_losing_sources(self):
        data={'html':row('title','https://example.org','snippet'),'query':'x','searchUrl':'https://cn.bing.com/search?q=x','searchedAt':'2026-01-01T00:00:00Z','image':True,'fontPath':'/nonexistent-font-for-test'}
        r=doc.process(data);self.assertTrue(r['imageUnavailable']);self.assertTrue(r['results'])
    def test_actual_jpeg_and_full_height(self):
        self.assertTrue(doc.dependencies()['imageReady'],'Pillow and CJK font are needed for the render test')
        rows=[{'title':'合成标题'+str(i),'snippet':'合成摘要，用于离线验证中文图片。','url':'https://example.org/'+str(i)} for i in range(4)]
        b=base64.b64decode(doc.render({'query':'合成测试','searchedAt':'2026-01-01T00:00:00Z','timeZone':'Asia/Shanghai'},rows))
        from PIL import Image
        with Image.open(io.BytesIO(b)) as image:self.assertEqual(image.format,'JPEG');self.assertEqual(image.width,1080);self.assertGreater(image.height,400)
    def test_beijing_time_and_caps(self):
        self.assertEqual(doc.timestamp('2026-01-01T00:00:00Z','Asia/Shanghai'),'2026/01/01 08:00:00 Asia/Shanghai')
        r=doc.parse_results(row('字'*500,'https://example.org/','字'*1000),'https://cn.bing.com/search?q=x')
        self.assertEqual(len(r[0]['title']),180);self.assertEqual(len(r[0]['snippet']),350)
if __name__=='__main__':unittest.main()
