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
        self.assertEqual(doc.timestamp('2026-01-01T00:00:00Z','Asia/Shanghai'),'2026/01/01 08:00:00 北京时间')
        r=doc.parse_results(row('字'*500,'https://example.org/','字'*1000),'https://cn.bing.com/search?q=x')
        self.assertEqual(len(r[0]['title']),180);self.assertEqual(len(r[0]['snippet']),350)
    def test_png_output_is_real_png(self):
        self.assertTrue(doc.dependencies()['imageReady'],'Pillow and CJK font are needed for the render test')
        data={'html':row('PNG标题','https://example.org/png','真实PNG编码离线测试'),'query':'PNG测试','searchUrl':'https://cn.bing.com/search?q=x','searchedAt':'2026-01-01T00:00:00Z','image':True,'imageType':'png'}
        result=doc.process(data)
        self.assertEqual(result['imageType'],'png')
        from PIL import Image
        with Image.open(io.BytesIO(base64.b64decode(result['imageBase64']))) as image:self.assertEqual(image.format,'PNG');self.assertEqual(image.width,1080)
    def test_real_360_result_structure_and_original_source(self):
        html='<li class="res-list"><h3 class="res-title"><a href="https://www.so.com/link?m=opaque" data-mdurl="https://example.org/cats"><em>中国猫</em>的种类</a></h3><p class="res-desc">狸花猫与山东狮子猫。</p><p class="g-linkinfo">网站反馈</p></li>'
        result=doc.inspect_document(html,'https://www.so.com/s?q=中国猫',engine='360')
        self.assertEqual(result['results'][0],{'title':'中国猫的种类','url':'https://example.org/cats','snippet':'狸花猫与山东狮子猫。'})
    def test_real_sogou_structure_searchbox_and_hidden_suggestions(self):
        html='<input id="upquery" name="query" value="中国有哪些种类的猫"><div class="vrwrap"><h3 class="vr-title"><a href="/link?url=opaque">中国的猫咪品种</a></h3><div class="text-layout"><div class="fz-mid space-txt">狸花猫、玄猫与三花猫。</div><a>网站标签</a></div></div><div class="vrwrap" style="display:none"><h3><a href="https://example.org/hidden">隐藏推荐</a></h3></div>'
        result=doc.inspect_document(html,'https://www.sogou.com/web?query=中国有哪些种类的猫',engine='sogou')
        self.assertEqual(result['effectiveQuery'],'中国有哪些种类的猫');self.assertEqual(len(result['results']),1);self.assertEqual(result['results'][0]['snippet'],'狸花猫、玄猫与三花猫。')
        self.assertEqual(result['results'][0]['url'],'https://www.sogou.com/link?url=opaque')
    def test_captcha_is_not_a_valid_result_page(self):
        html='<title>安全验证 - 搜索</title>'+row('继续访问','https://example.org/verify','请完成安全验证')
        result=doc.inspect_document(html,'https://cn.bing.com/search?q=测试')
        self.assertTrue(result['blocked']);self.assertEqual(result['results'],[])
if __name__=='__main__':unittest.main()
