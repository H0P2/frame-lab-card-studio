from pathlib import Path
import hashlib,html,json,zipfile
base=Path(__file__).resolve().parent
root=base
items=['index.html','app.js','style.css','guide.html','docs.css','README.md','LICENSE.txt']
sections=''.join('<details><summary>'+n+'</summary><pre><code>'+html.escape((root/n).read_text(encoding='utf-8'))+'</code></pre></details>' for n in items)
(root/'source.html').write_text('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>공개 소스 — FRAME LAB</title><link rel="stylesheet" href="docs.css"></head><body><nav><a href="index.html">← 편집기로</a><a href="guide.html">사용 안내와 검사 기록</a><a href="https://github.com/H0P2/frame-lab-card-studio">GitHub 저장소</a></nav><p class="tag">FRAME LAB / SOURCE</p><h1>공개 소스</h1><p>로그인 없이 코드를 읽거나 전체 파일을 내려받을 수 있습니다. 편집기 소스, 실제 검사 기록, 완성 이미지, 재검사 도구를 포함합니다.</p><p><a href="source.zip" download>전체 소스 ZIP 내려받기</a> · <a href="evidence/source-manifest.json">파일 해시 목록</a></p><h2>편집기 코드</h2>'+sections+'<h2>검사 기록과 제작 권리</h2><p><a href="guide.html">과제 기준과 실제 검사 원본</a> · <a href="evidence/provenance.json">완성 이미지 제작·권리</a></p><p>MIT License · 프로젝트 내부 제작 · AI 구현 지원.</p></body></html>',encoding='utf-8')
files=[p for p in root.rglob('*') if p.is_file() and '.git' not in p.relative_to(root).parts and 'verification' not in p.relative_to(root).parts and p.name not in ['source.zip','source-manifest.json']]
manifest={str(p.relative_to(root)).replace('\\','/'):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(files)}
(root/'evidence/source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
with zipfile.ZipFile(root/'source.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in files+[root/'evidence/source-manifest.json']:
  z.write(p,str(p.relative_to(root)).replace('\\','/'))
 for p in (base/'verification').rglob('*'):
  if p.is_file() and p.name!='gps-test.jpg' and 'results' not in p.parts:
   z.write(p,str(p.relative_to(base)).replace('\\','/'))
print('Public source archive ready:',(root/'source.zip').stat().st_size,'bytes')
