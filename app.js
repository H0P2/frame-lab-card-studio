const $=id=>document.getElementById(id),SIZES={'1:1':[1080,1080],'4:5':[1080,1350],'9:16':[1080,1920]};
const DEFAULT={ratio:'1:1',text:'오늘의 작은 발견\n내일의 새로운 시작',fontSize:76,color:'#ffffff',position:'bottom',align:'left',fit:'cover',background:'#171922',scrim:true,image:null,offsetX:0,offsetY:0,style:'original',effect:'none'};
const FONT='"Malgun Gothic","Apple SD Gothic Neo","Segoe UI","Segoe UI Emoji","Apple Color Emoji",sans-serif';
const LAB=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).has('lab'),DBNAME=LAB?'frame-lab-test-v2':'frame-lab-v1';
const MAX_FILE=8*1024*1024,MAX_PIXELS=20000000,MAX_JSON=32*1024*1024,MAX_TEMPLATES=24;
let state={...DEFAULT},image=null,layout=null,templates=[],selected=null,db=null,draftDB=null,busy=false,readSequence=0,actionQueue=Promise.resolve();
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ko',{granularity:'grapheme'}):null;
const graphemes=s=>segmenter?[...segmenter.segment(s)].map(x=>x.segment):Array.from(s);
function notify(msg,error=false){$('notice').textContent=msg;$('notice').dataset.error=String(error)}
function sampleImage(variant=0){const c=document.createElement('canvas');c.width=1200;c.height=1500;const x=c.getContext('2d'),colors=[['#5377d8','#7861a4','#de754a'],['#1a6160','#397f6a','#c9d475'],['#513783','#b94577','#eda064']][variant%3],g=x.createLinearGradient(0,0,1200,1500);colors.forEach((v,i)=>g.addColorStop(i/2,v));x.fillStyle=g;x.fillRect(0,0,c.width,c.height);x.strokeStyle='#ffffff33';x.lineWidth=2;for(let i=0;i<8;i++){x.beginPath();x.ellipse(610,700,180+i*70,260+i*50,.5,0,Math.PI*2);x.stroke()}return c.toDataURL('image/png')}
async function decode(src){const i=new Image();i.src=src;try{await i.decode()}catch{throw Error('이미지 데이터가 손상됐거나 읽을 수 없습니다. 기존 작업은 유지됩니다.')}return i}
function validateState(s){if(!s||typeof s!=='object'||Array.isArray(s))throw Error('편집 설정이 올바르지 않습니다.');const optional=['offsetX','offsetY','style','effect'],keys=Object.keys(DEFAULT);if(keys.filter(k=>!optional.includes(k)).some(k=>!Object.hasOwn(s,k)))throw Error('필수 편집 항목이 빠졌습니다.');s={...DEFAULT,...s};if(!Object.hasOwn(SIZES,s.ratio)||typeof s.text!=='string'||s.text.length>2000||!Number.isFinite(s.fontSize)||s.fontSize<20||s.fontSize>160||!/^#[0-9a-f]{6}$/i.test(s.color)||!/^#[0-9a-f]{6}$/i.test(s.background)||!['top','center','bottom'].includes(s.position)||!['left','center','right'].includes(s.align)||!['cover','contain'].includes(s.fit)||typeof s.scrim!=='boolean'||!(s.image===null||typeof s.image==='string')||!Number.isFinite(s.offsetX)||Math.abs(s.offsetX)>1||!Number.isFinite(s.offsetY)||Math.abs(s.offsetY)>1||!['original','neon','film','mono','editorial'].includes(s.style)||!['none','fade','slide','typewriter','zoom'].includes(s.effect))throw Error('편집 값이 허용 범위를 벗어났습니다. 문구는 최대 2,000자입니다.');return Object.fromEntries(keys.map(k=>[k,s[k]]))}
function imageDimensions(b,type){const v=new DataView(b.buffer,b.byteOffset,b.byteLength);if(type==='image/png'){if(b.length<24)throw Error('PNG 데이터가 너무 짧습니다.');return [v.getUint32(16),v.getUint32(20)]}let i=2;while(i+9<b.length){if(b[i]!==255){i++;continue}const m=b[i+1];if(m===216||m===217){i+=2;continue}const len=v.getUint16(i+2);if(len<2)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m))return [v.getUint16(i+7),v.getUint16(i+5)];i+=2+len}return null}
async function normalizeFile(f,{lossless=false}={}){if(f.size>(lossless?MAX_JSON:MAX_FILE))throw Error('파일은 최대 8MB까지 지원합니다. 기존 작업은 유지됩니다.');const b=new Uint8Array(await f.arrayBuffer()),png=b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v),jpeg=b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255,type=png?'image/png':jpeg?'image/jpeg':null;if(!type||!['image/png','image/jpeg',''].includes(f.type)||(f.type&&f.type!==type))throw Error('실제 PNG·JPEG 이미지 파일만 지원합니다. 기존 작업은 유지됩니다.');const dims=imageDimensions(b,type);if(dims&&(!dims[0]||!dims[1]||dims[0]*dims[1]>MAX_PIXELS))throw Error('최대 2천만 픽셀의 이미지까지 지원합니다. 기존 작업은 유지됩니다.');const url=URL.createObjectURL(new Blob([b],{type}));try{const im=await decode(url);if(im.width*im.height>MAX_PIXELS)throw Error('이미지 해상도가 너무 큽니다. 기존 작업은 유지됩니다.');const scale=Math.min(1,2400/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*scale));c.height=Math.max(1,Math.round(im.height*scale));c.getContext('2d').drawImage(im,0,0,c.width,c.height);const src=c.toDataURL(lossless?'image/png':type,type==='image/jpeg'?.92:undefined);if(src.length>(lossless?MAX_JSON:MAX_FILE)*4/3+100)throw Error('정리한 이미지가 8MB를 넘습니다. 더 작은 이미지로 시도하세요.');return {src,width:c.width,height:c.height,originalWidth:im.width,originalHeight:im.height,type}}finally{URL.revokeObjectURL(url)}}
async function normalizeDataURL(src,{lossless=true}={}){if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(src)||src.length>(lossless?MAX_JSON:MAX_FILE)*4/3+100)throw Error('템플릿 이미지 형식이 올바르지 않습니다.');let bytes;try{bytes=Uint8Array.from(atob(src.slice(src.indexOf(',')+1)),c=>c.charCodeAt(0))}catch{throw Error('템플릿 이미지 데이터를 읽을 수 없습니다.')}return normalizeFile(new File([bytes],'template-image',{type:src.slice(5,src.indexOf(';'))}),{lossless})}
function wrapText(ctx,text,width){const lines=[];for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')){if(!paragraph){lines.push('');continue}let line='';for(const cluster of graphemes(paragraph)){if(line&&ctx.measureText(line+cluster).width>width){lines.push(line);line=cluster}else line+=cluster}lines.push(line)}return lines}
function calculateLayout(s,ctx){const [w,h]=SIZES[s.ratio],pad=72,maxW=w-pad*2,maxH=h-pad*2;let effective=s.fontSize,lines,lh;while(effective>=12){ctx.font=`700 ${effective}px ${FONT}`;lines=wrapText(ctx,s.text,maxW);lh=effective*1.4;if(lines.length*lh<=maxH&&lines.every(l=>ctx.measureText(l).width<=maxW+.01))break;effective--}if(effective<12)throw Error('줄바꿈이 너무 많아 카드 안에 표시할 수 없습니다. 줄 수를 줄여 주세요. 기존 문구는 유지됩니다.');const total=lines.length*lh,baseY=s.position==='top'?pad:s.position==='center'?(h-total)/2:h-pad-total,baseBoxes=lines.map((line,i)=>{const width=ctx.measureText(line).width;return {x:s.align==='left'?pad:s.align==='right'?w-pad-width:(w-width)/2,y:baseY+i*lh,width,height:lh}}),minX=Math.min(...baseBoxes.map(b=>b.x)),maxX=Math.max(...baseBoxes.map(b=>b.x+b.width)),shiftX=Math.max(pad-minX,Math.min(w-pad-maxX,(s.offsetX||0)*w)),y=Math.max(pad,Math.min(h-pad-total,baseY+(s.offsetY||0)*h)),shiftY=y-baseY,boxes=baseBoxes.map(b=>({...b,x:b.x+shiftX,y:b.y+shiftY}));return {width:w,height:h,pad,requested:s.fontSize,effective,lines,lineHeight:lh,y,shiftX,shiftY,boxes,withinBounds:boxes.every(b=>b.x>=pad-.1&&b.x+b.width<=w-pad+.1&&b.y>=pad-.1&&b.y+b.height<=h-pad+.1)}}
function draw(s,im,canvas,animation=null){const [w,h]=SIZES[s.ratio];if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;const ctx=canvas.getContext('2d'),l=calculateLayout(s,ctx);ctx.clearRect(0,0,w,h);ctx.fillStyle=s.background;ctx.fillRect(0,0,w,h);let crop=null;const p=animation?.progress??1,ease=1-Math.pow(1-p,3);if(im){const scale=(s.fit==='cover'?Math.max(w/im.width,h/im.height):Math.min(w/im.width,h/im.height))*(animation&&s.effect==='zoom'?1+.08*(1-ease):1),iw=im.width*scale,ih=im.height*scale;crop={x:(w-iw)/2,y:(h-ih)/2,width:iw,height:ih};ctx.save();ctx.filter={neon:'saturate(1.45) contrast(1.1)',film:'sepia(.38) saturate(.8) contrast(1.05)',mono:'grayscale(1) contrast(1.15)',editorial:'saturate(.65)',original:'none'}[s.style||'original'];ctx.drawImage(im,crop.x,crop.y,iw,ih);ctx.restore()}if(s.style==='film'){ctx.fillStyle='#edaa6320';ctx.fillRect(0,0,w,h)}if(s.style==='editorial'){ctx.strokeStyle=s.color;ctx.lineWidth=2;ctx.strokeRect(36,36,w-72,h-72)}ctx.save();if(animation&&s.effect==='fade')ctx.globalAlpha=ease;const slide=animation&&s.effect==='slide'?60*(1-ease):0;if(s.scrim&&s.text.trim()){const g=ctx.createLinearGradient(0,l.y-l.pad+slide,0,l.y+l.lines.length*l.lineHeight+l.pad+slide);g.addColorStop(0,'#0000');g.addColorStop(.5,'#0009');g.addColorStop(1,'#0000');ctx.fillStyle=g;ctx.fillRect(0,l.y-l.pad+slide,w,l.lines.length*l.lineHeight+l.pad*2)}ctx.font=`700 ${l.effective}px ${FONT}`;ctx.fillStyle=s.color;ctx.textBaseline='top';ctx.textAlign=s.align;const x=(s.align==='left'?l.pad:s.align==='right'?w-l.pad:w/2)+l.shiftX;ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();let remaining=animation&&s.effect==='typewriter'?Math.floor(l.lines.reduce((n,t)=>n+graphemes(t).length,0)*ease):Infinity;l.lines.forEach((line,i)=>{const chars=graphemes(line),part=chars.slice(0,Math.max(0,remaining)).join('');remaining-=chars.length;ctx.fillText(part,x,l.y+i*l.lineHeight+slide)});ctx.restore();return {...l,crop}}
function render(){stopMotion();layout=draw(state,image,$('preview'));$('dimensions').textContent=`${layout.width} × ${layout.height} px`;$('sizeValue').textContent=state.fontSize;$('layoutInfo').textContent=layout.effective<state.fontSize?`맞춤 크기 ${layout.effective}px · ${layout.lines.length}줄`:`PNG · ${layout.lines.length}줄 · 완성 장면 저장`;$('preview').dataset.layout=JSON.stringify({...layout,lines:undefined});updateSelection();syncStudio();return layout}
function syncControls(){for(const id of ['text','fontSize','position','align','fit','background'])$(id).value=state[id];$('textColor').value=state.color;$('scrim').checked=state.scrim;document.querySelectorAll('[data-ratio]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ratio===state.ratio)))}
async function configure(patch,{normalize=true,record=true,group=null,expectedRevision=null}={}){if(recording)throw Error('영상 저장 중에는 편집을 잠시 기다려 주세요.');if(Object.hasOwn(patch,'position')&&!Object.hasOwn(patch,'offsetY'))patch={...patch,offsetY:0};if(Object.hasOwn(patch,'align')&&!Object.hasOwn(patch,'offsetX'))patch={...patch,offsetX:0};let next=validateState({...state,...patch}),nextImage=image;if(next.image!==state.image){if(next.image){if(normalize)next.image=(await normalizeDataURL(next.image)).src;nextImage=await decode(next.image)}else nextImage=null;next=validateState({...state,...patch,image:next.image})}calculateLayout(next,document.createElement('canvas').getContext('2d'));if(expectedRevision!==null&&editRevision!==expectedRevision)return snapshot();if(record)remember(state,next,group);state=next;image=nextImage;syncControls();render();scheduleDraft();return snapshot()}
function snapshot(){return {state:structuredClone(state),layout:structuredClone(layout),selected,templates:templates.map(t=>({id:t.id,name:t.name,ratio:t.editor.ratio,text:t.editor.text}))}}
async function importImage(file){const sequence=++readSequence,result=await normalizeFile(file);if(sequence!==readSequence)return false;await configure({image:result.src},{normalize:false});$('imageInfo').textContent=`${result.width} × ${result.height} · 메타데이터 제거 후 사용`;notify('이미지를 불러왔습니다.');return result}
async function exportPNG(){await document.fonts.ready;render();return new Promise((resolve,reject)=>$('preview').toBlob(b=>b?resolve(b):reject(Error('이미지를 저장하지 못했습니다.')),'image/png'))}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
async function openDB(name=DBNAME,stores=['templates']){
  return new Promise((resolve,reject)=>{
    let settled=false,q;
    const fail=message=>{if(settled)return;settled=true;clearTimeout(timer);reject(Error(message))};
    const timer=setTimeout(()=>fail('다른 이전 버전 탭이 저장소 연결을 막고 있습니다. 해당 탭을 새로고침한 뒤 저장소 다시 연결을 누르세요. 편집과 이미지·영상 저장은 계속 사용할 수 있습니다.'),3000);
    try{q=indexedDB.open(name)}catch{fail('브라우저가 저장을 허용하지 않습니다. 편집과 이미지·영상 저장은 계속 사용할 수 있습니다.');return}
    q.onupgradeneeded=()=>{for(const store of stores)if(!q.result.objectStoreNames.contains(store))q.result.createObjectStore(store,{keyPath:'id'})};
    q.onblocked=()=>fail('다른 이전 버전 탭이 저장소 연결을 막고 있습니다. 해당 탭을 새로고침한 뒤 저장소 다시 연결을 누르세요.');
    q.onerror=()=>fail('브라우저가 저장을 허용하지 않습니다. 편집과 이미지·영상 저장은 계속 사용할 수 있습니다.');
    q.onsuccess=()=>{
      const connection=q.result;if(settled){connection.close();return}settled=true;clearTimeout(timer);
      connection.onversionchange=()=>{connection.close();if(db===connection)db=null;if(draftDB===connection)draftDB=null;syncStorageControls();$('draftStatus').textContent='저장 연결 종료 · 편집 가능';notify('다른 탭의 저장소 변경으로 연결을 닫았습니다. 저장소 다시 연결로 복구할 수 있습니다.',true)};
      resolve(connection);
    };
  });
}
function syncStorageControls(){
  $('createTemplate').disabled=!db||recording;$('updateTemplate').disabled=!db||!selected||recording;
  $('jsonFile').disabled=!db||recording;$('exportJSON').disabled=!db||recording;
  $('undoDelete').disabled=!db||recording;$('retryStorage').hidden=!!db&&!!draftDB;
  $('retryStorage').disabled=!!storageConnectTask;
}
async function migrateDraft(revision){
  const read=connection=>new Promise((resolve,reject)=>{const q=connection.transaction('drafts').objectStore('drafts').get('current');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  if(await read(draftDB))return;const previous=await read(db);
  if(!previous||editRevision!==revision)return;
  await new Promise((resolve,reject)=>{const tx=draftDB.transaction('drafts','readwrite');tx.objectStore('drafts').put(previous);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error)});
}
function connectStorage({restore=false}={}){
  if(storageConnectTask)return storageConnectTask;
  const revision=editRevision;$('draftStatus').textContent='저장소 연결 중…';
  storageConnectTask=(async()=>{
    try{
      if(!db)db=await openDB();
      if(!db.objectStoreNames.contains('templates'))throw Error('템플릿 저장소 형식을 읽을 수 없습니다. 편집 내용은 유지됩니다.');
      await refreshTemplates();
      if(!draftDB)draftDB=await openDB(DBNAME+'-drafts',['drafts']);
      if(db.objectStoreNames.contains('drafts'))await migrateDraft(revision);
      if(restore)await restoreDraft(revision);else await flushDraft();
      return true;
    }catch(e){$('draftStatus').textContent='자동 저장 불가 · 편집 가능';notify(e.message,true);return false}
    finally{storageConnectTask=null;syncStorageControls()}
  })();
  syncStorageControls();return storageConnectTask;
}
async function dbRead(){if(!db)return [];return new Promise((r,j)=>{const q=db.transaction('templates').objectStore('templates').getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
async function dbWrite(records){if(!db)throw Error('이 브라우저에서 템플릿을 저장할 수 없습니다.');return new Promise((r,j)=>{const tx=db.transaction('templates','readwrite');records.forEach(t=>tx.objectStore('templates').put(t));tx.oncomplete=r;tx.onabort=tx.onerror=()=>j(Error('저장 공간이 부족하거나 저장이 거부됐습니다. 기존 템플릿은 유지됩니다.'))})}
async function refreshTemplates(){const all=await dbRead();templates=all.filter(t=>!t.deleted).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));const last=all.filter(t=>t.deleted).sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt))[0];$('undoDelete').hidden=!last;$('undoDelete').dataset.id=last?.id||'';if(!templates.some(t=>t.id===selected))selected=null;$('updateTemplate').disabled=!selected;renderTemplates()}
function renderTemplates(){const list=$('templateList');list.replaceChildren();if(!templates.length){const p=document.createElement('p');p.className='empty';p.textContent='첫 템플릿을 저장해 보세요.';list.append(p);return}for(const t of templates){const row=document.createElement('div');row.className='template-row'+(t.id===selected?' selected':'');row.dataset.id=t.id;const img=document.createElement('img');img.src=t.thumbnail;img.alt='';const detail=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small'),actions=document.createElement('div');strong.textContent=t.name;small.textContent=`${t.editor.ratio} · ${t.editor.text.length}자`;actions.className='template-actions';for(const [name,action] of [['불러오기',()=>loadTemplate(t.id)],['삭제',()=>deleteTemplate(t.id)]]){const b=document.createElement('button');b.textContent=name;b.setAttribute('aria-label',`${t.name} ${name}`);b.onclick=()=>run(action);actions.append(b)}detail.append(strong,small,actions);row.append(img,detail);list.append(row)}}
function validName(name){if(typeof name!=='string'||!name.trim()||name.trim().length>40)throw Error('템플릿 이름을 1~40자로 입력하세요.');return name.trim()}
function thumbnail(){const c=document.createElement('canvas');c.width=160;c.height=Math.round(160*$('preview').height/$('preview').width);c.getContext('2d').drawImage($('preview'),0,0,c.width,c.height);return c.toDataURL('image/png')}
function ensureTemplateBudget(records){const merged=new Map(templates.map(t=>[t.id,t]));for(const t of records){if(t.deleted)merged.delete(t.id);else merged.set(t.id,t)}const data={format:'frame-lab-templates',version:1,templates:[...merged.values()].map(t=>({id:t.id,name:t.name,createdAt:t.createdAt,updatedAt:t.updatedAt,editor:t.editor}))};if(new Blob([JSON.stringify(data,null,2)]).size>MAX_JSON)throw Error('템플릿 전체 이미지와 설정은 32MB까지 보관합니다. 이미지 크기나 템플릿 수를 줄여 주세요. 기존 목록은 유지됩니다.')}
async function createTemplate(name){name=validName(name);if(templates.length>=MAX_TEMPLATES)throw Error('템플릿은 최대 24개까지 저장할 수 있습니다.');const now=new Date().toISOString(),t={id:crypto.randomUUID(),name,createdAt:now,updatedAt:now,deleted:false,editor:structuredClone(state),thumbnail:thumbnail()};ensureTemplateBudget([t]);await dbWrite([t]);selected=t.id;await refreshTemplates();notify(`“${name}” 템플릿을 저장했습니다.`);return {id:t.id,name}}
async function loadTemplate(id){const t=templates.find(x=>x.id===id);if(!t)throw Error('선택한 템플릿을 찾을 수 없습니다.');await configure(t.editor,{normalize:false});selected=t.id;$('templateName').value=t.name;$('imageInfo').textContent=t.editor.image?'템플릿 이미지 · 메타데이터 제거 후 보관':'템플릿 · 단색 배경';await refreshTemplates();notify(`“${t.name}” 템플릿을 불러왔습니다.`);return snapshot()}
async function updateTemplate(id,name){const t=templates.find(x=>x.id===id);if(!t)throw Error('수정할 템플릿을 먼저 불러오세요.');name=validName(name);const updated={...t,name,updatedAt:new Date().toISOString(),editor:structuredClone(state),thumbnail:thumbnail()};ensureTemplateBudget([updated]);await dbWrite([updated]);await refreshTemplates();notify(`“${name}” 템플릿을 수정했습니다.`);return {id,name}}
async function deleteTemplate(id){const t=templates.find(x=>x.id===id);if(!t)throw Error('삭제할 템플릿을 찾을 수 없습니다.');await dbWrite([{...t,deleted:true,deletedAt:new Date().toISOString()}]);await refreshTemplates();notify(`“${t.name}” 템플릿을 삭제했습니다. 삭제 취소로 복구할 수 있습니다.`);return {id,deleted:true}}
async function undoDelete(){const all=await dbRead(),t=all.find(x=>x.id===$('undoDelete').dataset.id);if(!t)throw Error('복구할 템플릿이 없습니다.');if(templates.length>=MAX_TEMPLATES)throw Error('템플릿 수가 24개입니다. 항목을 줄인 뒤 복구하세요.');ensureTemplateBudget([{...t,deleted:false}]);await dbWrite([{...t,deleted:false}]);await refreshTemplates();notify('삭제한 템플릿을 복구했습니다.')}
function exportJSON(){return JSON.stringify({format:'frame-lab-templates',version:1,templates:templates.map(t=>({id:t.id,name:t.name,createdAt:t.createdAt,updatedAt:t.updatedAt,editor:t.editor}))},null,2)}
let pendingImport=null;
function cancelImportJSON(){pendingImport=null;$('importPreview').hidden=true;$('importCounts').textContent='';$('applyImport').disabled=true}
async function previewImportJSON(raw){
  cancelImportJSON();
  if(typeof raw!=='string'||new Blob([raw]).size>MAX_JSON)throw Error('JSON 파일은 최대 32MB까지 지원합니다.');
  let parsed;try{parsed=JSON.parse(raw)}catch{throw Error('JSON 문법이 손상됐습니다. 기존 템플릿은 유지됩니다.')}
  if(!parsed||parsed.format!=='frame-lab-templates'||parsed.version!==1||!Array.isArray(parsed.templates)||parsed.templates.length>MAX_TEMPLATES)throw Error('템플릿 JSON 형식·버전·개수가 올바르지 않습니다. 기존 목록은 유지됩니다.');
  const ids=new Set(),next=[];
  for(const t of parsed.templates){
    if(!t||typeof t.id!=='string'||!/^[a-z0-9_-]{8,80}$/i.test(t.id)||ids.has(t.id)||typeof t.createdAt!=='string'||typeof t.updatedAt!=='string'||!Number.isFinite(Date.parse(t.createdAt))||!Number.isFinite(Date.parse(t.updatedAt)))throw Error('필수 항목이 빠졌거나 템플릿 ID·날짜가 올바르지 않습니다. 기존 목록은 유지됩니다.');
    ids.add(t.id);
    const name=validName(t.name),editor=validateState(t.editor);let im=null;
    if(editor.image){editor.image=(await normalizeDataURL(editor.image)).src;im=await decode(editor.image)}
    const c=document.createElement('canvas');draw(editor,im,c);
    const thumb=document.createElement('canvas');thumb.width=160;thumb.height=Math.round(160*c.height/c.width);thumb.getContext('2d').drawImage(c,0,0,thumb.width,thumb.height);
    next.push({id:t.id,name,createdAt:t.createdAt,updatedAt:t.updatedAt,editor,deleted:false,thumbnail:thumb.toDataURL('image/png')});
  }
  if(new Set([...templates.map(t=>t.id),...ids]).size>MAX_TEMPLATES)throw Error('가져오기 후 템플릿이 24개를 넘습니다. 기존 목록은 유지됩니다.');
  ensureTemplateBudget(next);
  const updatedCount=next.filter(t=>templates.some(saved=>saved.id===t.id)).length;
  pendingImport={records:next,newCount:next.length-updatedCount,updatedCount};
  $('importCounts').textContent=`신규 ${pendingImport.newCount} · 갱신 ${pendingImport.updatedCount}`;
  $('importPreview').hidden=false;
  notify('검증이 끝났습니다. 적용 또는 취소를 선택하세요.');
  return {newCount:pendingImport.newCount,updatedCount:pendingImport.updatedCount};
}
async function importJSON(raw){return previewImportJSON(raw)}
function run(action){const execute=async()=>{busy=true;try{return await action()}catch(e){notify(e.message||'작업을 완료하지 못했습니다. 기존 작업은 유지됩니다.',true)}finally{busy=false}};const operation=actionQueue.then(execute,execute);actionQueue=operation.catch(()=>{});return operation}
// Studio state is separate from the current card and stored templates.
let undoStack=[],redoStack=[],lastAction=null,draftTimer=0,draftSequence=0,draftPending=Promise.resolve(),motionFrame=0,motionStart=0,recording=false,drag=null,dragSequence=0,editRevision=0,storageConnectTask=null,storageReady=Promise.resolve(false);
const HISTORY_LIMIT=40;
function changed(a,b){return Object.keys(DEFAULT).some(k=>a[k]!==b[k])}
function remember(previous,next,group=null){
  if(!changed(previous,next))return;editRevision++;
  const now=performance.now();
  if(!group||!lastAction||lastAction.group!==group||now-lastAction.time>650)undoStack.push({...previous});
  while(undoStack.length>HISTORY_LIMIT)undoStack.shift();
  while(undoStack.length>1&&[...new Set(undoStack.map(s=>s.image).filter(Boolean))].reduce((n,s)=>n+s.length,0)>MAX_JSON)undoStack.shift();
  redoStack=[];lastAction={group,time:now};
}
async function undo(){if(!undoStack.length||recording)return;const target=undoStack.at(-1),previous={...state};await configure(target,{normalize:false,record:false});undoStack.pop();redoStack.push(previous);lastAction=null;syncStudio();notify('이전 편집으로 되돌렸습니다.')}
async function redo(){if(!redoStack.length||recording)return;const target=redoStack.at(-1),previous={...state};await configure(target,{normalize:false,record:false});redoStack.pop();undoStack.push(previous);lastAction=null;syncStudio();notify('편집을 다시 적용했습니다.')}
function syncStudio(){
  $('undo').disabled=!undoStack.length||recording;$('redo').disabled=!redoStack.length||recording;
  document.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===state.style)));
  document.querySelectorAll('[data-effect]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.effect===state.effect)));
  $('playMotion').disabled=recording||state.effect==='none'||$('reduceMotion').checked;
  $('playMotion').textContent=motionFrame?'정지':'재생';$('playMotion').setAttribute('aria-label',motionFrame?'효과 미리보기 정지':'효과 미리보기 재생');
  $('downloadVideo').disabled=recording||!videoSupported()||state.effect==='none'||$('reduceMotion').checked;
  $('download').disabled=recording;$('newCard').disabled=recording;
  $('motionInfo').textContent=recording?'3초 영상을 만들고 있습니다. 이 화면을 유지해 주세요.':$('reduceMotion').checked?'움직임을 줄였습니다. 정지 카드 편집과 PNG 저장을 사용할 수 있습니다.':!videoSupported()?'이 브라우저는 WebM 저장을 지원하지 않습니다. 미리보기와 PNG는 사용할 수 있습니다.':state.effect==='none'?'페이드·슬라이드·타이핑·줌 중 하나를 선택하면 재생과 영상 저장을 사용할 수 있습니다.':'PNG는 효과가 끝난 완성 장면을 저장합니다. 영상은 3초 WebM입니다.';
}
function updateSelection(){
  if(!layout)return;const selection=$('textSelection'),canvas=$('preview'),r=canvas.getBoundingClientRect(),parent=$('canvasWrap').getBoundingClientRect();
  selection.hidden=!state.text.trim()||recording||!!motionFrame;
  const left=Math.min(...layout.boxes.map(b=>b.x)),right=Math.max(...layout.boxes.map(b=>b.x+b.width)),sx=r.width/layout.width,sy=r.height/layout.height;
  selection.style.left=(r.left-parent.left+left*sx-6)+'px';selection.style.top=(r.top-parent.top+layout.y*sy-6)+'px';selection.style.width=(Math.max(20,(right-left)*sx)+12)+'px';selection.style.height=(layout.lines.length*layout.lineHeight*sy+12)+'px';
}
async function moveText(dx,dy,group=null){
  const patch={offsetX:Math.max(-1,Math.min(1,(layout.shiftX+dx)/layout.width)),offsetY:Math.max(-1,Math.min(1,(layout.shiftY+dy)/layout.height))};
  return configure(patch,{group});
}
async function applyPreset(name){
  const presets={neon:{style:'neon',color:'#d6ff79',background:'#111b28',align:'left',position:'bottom',fontSize:88,scrim:true},film:{style:'film',color:'#fff0d8',background:'#30251d',align:'center',position:'center',fontSize:78,scrim:true},mono:{style:'mono',color:'#ffffff',background:'#111111',align:'center',position:'center',fontSize:72,scrim:true},editorial:{style:'editorial',color:'#ffffff',background:'#17202b',align:'left',position:'top',fontSize:82,scrim:true}};
  if(!presets[name])throw Error('지원하지 않는 디자인입니다.');await configure({...presets[name],offsetX:0,offsetY:0});notify('디자인을 적용했습니다. 문구와 이미지는 유지됩니다. 실행 취소로 되돌릴 수 있습니다.');
}
function scheduleDraft(){if(!draftDB)return;clearTimeout(draftTimer);$('draftStatus').textContent='저장 중…';draftTimer=setTimeout(()=>flushDraft().catch(()=>{}),400)}
async function flushDraft(){
  clearTimeout(draftTimer);if(!draftDB)return false;const item={id:'current',editor:{...state},updatedAt:new Date().toISOString()},sequence=++draftSequence;
  const operation=draftPending.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{const tx=draftDB.transaction('drafts','readwrite');tx.objectStore('drafts').put(item);tx.oncomplete=()=>resolve(true);tx.onabort=tx.onerror=()=>reject(Error('자동 저장 공간이 부족합니다. PNG 또는 템플릿 JSON으로 보관해 주세요.'))}));
  draftPending=operation;try{await operation;if(sequence===draftSequence)$('draftStatus').textContent='이 브라우저에 저장됨';return true}catch(e){$('draftStatus').textContent='자동 저장 불가';notify(e.message,true);return false}
}
function cleanStoredImage(src){
  if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(src)||src.length>MAX_JSON*4/3+100)throw Error('저장 이미지 형식이 올바르지 않습니다.');
  const type=src.slice(5,src.indexOf(';')),bytes=Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0)),parts=[];
  const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v),jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if((type==='image/png'&&!png)||(type==='image/jpeg'&&!jpeg))throw Error('저장 이미지 서명이 올바르지 않습니다.');
  const dims=imageDimensions(bytes,type);if(!dims||!dims[0]||!dims[1]||dims[0]*dims[1]>MAX_PIXELS)throw Error('저장 이미지 크기가 올바르지 않습니다.');
  const view=new DataView(bytes.buffer);
  if(png){
    parts.push(bytes.slice(0,8));let i=8;
    while(i<bytes.length){if(i+12>bytes.length)throw Error('저장 PNG가 손상됐습니다.');const length=view.getUint32(i),end=i+length+12;if(end>bytes.length)throw Error('저장 PNG가 손상됐습니다.');const chunk=String.fromCharCode(...bytes.slice(i+4,i+8));if(!['eXIf','tEXt','iTXt','zTXt'].includes(chunk))parts.push(bytes.slice(i,end));i=end;if(chunk==='IEND')break;}
  }else{
    parts.push(bytes.slice(0,2));let i=2;
    while(i<bytes.length){if(bytes[i]!==255||i+2>=bytes.length)throw Error('저장 JPEG가 손상됐습니다.');const marker=bytes[i+1];if(marker===218||marker===217){parts.push(bytes.slice(i));break;}const length=view.getUint16(i+2),end=i+2+length;if(length<2||end>bytes.length)throw Error('저장 JPEG가 손상됐습니다.');if(marker!==225&&marker!==237)parts.push(bytes.slice(i,end));i=end;}
  }
  const size=parts.reduce((n,b)=>n+b.length,0),clean=new Uint8Array(size);let offset=0;for(const part of parts){clean.set(part,offset);offset+=part.length;}let binary='';for(let i=0;i<size;i+=8192)binary+=String.fromCharCode(...clean.subarray(i,i+8192));return 'data:'+type+';base64,'+btoa(binary);
}
async function restoreDraft(revision=null){
  if(!draftDB){$('draftStatus').textContent='자동 저장 불가';return}
  const item=await new Promise((resolve,reject)=>{const q=draftDB.transaction('drafts').objectStore('drafts').get('current');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  if(revision!==null&&editRevision!==revision){scheduleDraft();return}
  if(!item){scheduleDraft();return}
  try{const editor=validateState(item.editor);if(editor.image)editor.image=cleanStoredImage(editor.image);await configure(editor,{normalize:false,record:false,expectedRevision:revision});if(revision!==null&&editRevision!==revision){scheduleDraft();return}$('imageInfo').textContent=editor.image?'자동 복구 이미지 · 메타데이터 제거 후 사용':'자동 복구 · 단색 배경';notify('작성 중이던 카드를 복구했습니다. 새 카드로 처음부터 시작할 수 있습니다.')}catch{notify('저장된 작업을 읽을 수 없어 기본 카드로 시작했습니다. 저장한 템플릿은 유지됩니다.',true);scheduleDraft()}
}
function stopMotion(){if(motionFrame)cancelAnimationFrame(motionFrame);motionFrame=0;if($('playMotion'))$('playMotion').textContent='재생'}
function playMotion(){
  if(recording||state.effect==='none'||$('reduceMotion').checked)return false;
  if(motionFrame){stopMotion();render();return false}
  motionStart=performance.now();
  const frame=now=>{const progress=Math.min(1,(now-motionStart)/3000);draw(state,image,$('preview'),{progress});if(progress<1){motionFrame=requestAnimationFrame(frame);syncStudio();updateSelection()}else{motionFrame=0;render()}};
  motionFrame=requestAnimationFrame(frame);syncStudio();updateSelection();return true;
}
function videoMime(){return typeof MediaRecorder==='function'?['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t)):null}
function videoSupported(){return typeof HTMLCanvasElement.prototype.captureStream==='function'&&!!videoMime()}
async function exportVideo(){
  if(!videoSupported())throw Error('이 브라우저는 WebM 저장을 지원하지 않습니다.');
  if(state.effect==='none'||$('reduceMotion').checked)throw Error('움직임 효과를 선택하고 움직임 줄이기를 꺼 주세요.');
  if(recording)throw Error('영상을 이미 만들고 있습니다.');
  await document.fonts.ready;stopMotion();const card={...state},source=image,c=document.createElement('canvas');draw(card,source,c,{progress:0});
  const stream=c.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:videoMime(),videoBitsPerSecond:6000000}),chunks=[];let frameId=0,abortReason=null;
  recording=true;syncStudio();updateSelection();document.querySelectorAll('.controls input,.controls select,.controls textarea,[data-ratio],[data-preset],[data-effect],#sample,#removeImage,#resetStyle,#createTemplate,#updateTemplate,#exportJSON,#jsonFile').forEach(el=>el.disabled=true);
  const visibility=()=>{if(document.hidden){abortReason=Error('다른 화면으로 이동해 영상 생성을 중단했습니다. 다시 시도해 주세요.');if(recorder.state!=='inactive')recorder.stop()}};
  document.addEventListener('visibilitychange',visibility);
  try{return await new Promise((resolve,reject)=>{
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    recorder.onerror=()=>{abortReason=Error('브라우저가 영상을 만들지 못했습니다. PNG로 저장하거나 다시 시도해 주세요.');if(recorder.state!=='inactive')recorder.stop();else reject(abortReason)};
    recorder.onstop=()=>{cancelAnimationFrame(frameId);const blob=new Blob(chunks,{type:'video/webm'});if(abortReason)reject(abortReason);else if(!blob.size)reject(Error('영상이 비어 있습니다. 다시 시도해 주세요.'));else resolve(blob)};
    recorder.start(100);const start=performance.now();const tick=now=>{try{const p=Math.min(1,(now-start)/3000);draw(card,source,c,{progress:p});draw(card,source,$('preview'),{progress:p});if(p<1)frameId=requestAnimationFrame(tick);else if(recorder.state!=='inactive')recorder.stop()}catch(e){abortReason=e;if(recorder.state!=='inactive')recorder.stop()}};frameId=requestAnimationFrame(tick);
  })}finally{
    cancelAnimationFrame(frameId);stream.getTracks().forEach(t=>t.stop());document.removeEventListener('visibilitychange',visibility);recording=false;
    document.querySelectorAll('.controls input,.controls select,.controls textarea,[data-ratio],[data-preset],[data-effect],#sample,#removeImage,#resetStyle,#createTemplate,#updateTemplate,#exportJSON,#jsonFile').forEach(el=>el.disabled=false);
    if(!db){$('createTemplate').disabled=true;$('jsonFile').disabled=true}$('updateTemplate').disabled=!selected;render();syncStorageControls();
  }
}
function bindStudio(){
  $('retryStorage').onclick=()=>connectStorage();
  $('undo').onclick=()=>run(undo);$('redo').onclick=()=>run(redo);
  $('newCard').onclick=()=>run(async()=>{readSequence++;await configure({...DEFAULT,image:sampleImage()},{normalize:false});selected=null;$('templateName').value='';await refreshTemplates();notify('새 카드를 시작했습니다. 실행 취소로 이전 작업을 복구할 수 있습니다.')});
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>run(()=>applyPreset(b.dataset.preset)));
  $('resetStyle').onclick=()=>run(()=>configure({style:'original',color:'#ffffff',background:'#171922'}));
  const savedMotion=(()=>{try{return localStorage.getItem('frame-lab-reduce-motion')}catch{return null}})();
  $('reduceMotion').checked=savedMotion===null?matchMedia('(prefers-reduced-motion: reduce)').matches:savedMotion==='true';
  $('reduceMotion').onchange=()=>{try{localStorage.setItem('frame-lab-reduce-motion',String($('reduceMotion').checked))}catch{}stopMotion();render()};
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{if(e.matches){$('reduceMotion').checked=true;stopMotion();render()}});
  document.querySelectorAll('[data-effect]').forEach(b=>b.onclick=()=>run(async()=>{await configure({effect:b.dataset.effect});playMotion()}));
  $('playMotion').onclick=()=>playMotion();$('downloadVideo').onclick=()=>run(async()=>{downloadBlob(await exportVideo(),`frame-lab-${state.ratio.replace(':','x')}.webm`);notify('3초 WebM 영상을 저장했습니다.')});
  $('focusMode').onclick=()=>{const active=document.body.classList.toggle('focus-mode');$('focusMode').setAttribute('aria-pressed',String(active));$('focusMode').textContent=active?'편집 패널 보기':'집중 모드';requestAnimationFrame(updateSelection)};
  const selection=$('textSelection');
  selection.addEventListener('pointerdown',e=>{if(e.button!==0||busy||recording)return;e.preventDefault();stopMotion();render();selection.focus();try{selection.setPointerCapture(e.pointerId)}catch{}drag={id:e.pointerId,x:e.clientX,y:e.clientY,shiftX:layout.shiftX,shiftY:layout.shiftY,group:'drag-'+(++dragSequence)};selection.classList.add('dragging')});
  selection.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const r=$('preview').getBoundingClientRect(),dx=(e.clientX-drag.x)*layout.width/r.width,dy=(e.clientY-drag.y)*layout.height/r.height;configure({offsetX:Math.max(-1,Math.min(1,(drag.shiftX+dx)/layout.width)),offsetY:Math.max(-1,Math.min(1,(drag.shiftY+dy)/layout.height))},{group:drag.group}).catch(e=>notify(e.message,true))});
  const endDrag=()=>{drag=null;selection.classList.remove('dragging');lastAction=null};selection.addEventListener('pointerup',endDrag);selection.addEventListener('pointercancel',endDrag);selection.addEventListener('lostpointercapture',endDrag);
  selection.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||recording)return;e.preventDefault();const step=e.shiftKey?20:4;moveText(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0,'keyboard-move').catch(x=>notify(x.message,true))});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focus-mode'))$('focusMode').click();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();run(e.shiftKey?redo:undo)}});
  new ResizeObserver(updateSelection).observe($('canvasWrap'));window.addEventListener('pagehide',()=>{stopMotion();flushDraft().catch(()=>{})});document.addEventListener('visibilitychange',()=>{if(document.hidden){stopMotion();if(!recording)render()}});syncStudio();
}

function bind(){for(const id of ['text','fontSize','position','align','fit','background','scrim','textColor'])$(id).addEventListener('input',()=>{const k=id==='textColor'?'color':id,value=id==='scrim'?$(id).checked:id==='fontSize'?Number($(id).value):$(id).value,next={...state,[k]:value};try{validateState(next);calculateLayout(next,document.createElement('canvas').getContext('2d'));if(recording)throw Error('영상 저장 중에는 편집을 잠시 기다려 주세요.');if(k==='position')next.offsetY=0;if(k==='align')next.offsetX=0;remember(state,next,k);state=next;render();scheduleDraft()}catch(e){syncControls();notify(e.message,true)}});document.querySelectorAll('[data-ratio]').forEach(b=>b.onclick=()=>run(()=>configure({ratio:b.dataset.ratio})));$('sample').onclick=()=>run(()=>configure({image:sampleImage()}));$('removeImage').onclick=()=>run(async()=>{readSequence++;await configure({image:null});$('imageInfo').textContent='이미지 없음 · 단색 배경'});$('download').onclick=()=>run(async()=>{downloadBlob(await exportPNG(),`frame-lab-${state.ratio.replace(':','x')}.png`);notify('PNG 이미지를 내려받았습니다. 미리보기와 같은 배치입니다.')});$('imageFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)run(()=>importImage(f))};$('createTemplate').onclick=()=>run(()=>createTemplate($('templateName').value));$('updateTemplate').onclick=()=>run(()=>updateTemplate(selected,$('templateName').value));$('undoDelete').onclick=()=>run(undoDelete);$('exportJSON').onclick=()=>run(()=>{downloadBlob(new Blob([exportJSON()],{type:'application/json'}),'frame-lab-templates.json');notify('템플릿 JSON을 내려받았습니다.')});$('jsonFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)run(async()=>{if(f.size>MAX_JSON)throw Error('JSON은 최대 32MB까지 지원합니다.');return previewImportJSON(await f.text())})};$('cancelImport').onclick=cancelImportJSON}
bind();await document.fonts.ready;await configure({image:sampleImage()},{normalize:false,record:false});bindStudio();undoStack=[];redoStack=[];syncStudio();syncStorageControls();storageReady=connectStorage({restore:true});
if(LAB)window.FrameLab={whenStorageReady:()=>storageReady,getStorageState:()=>({templates:!!db,drafts:!!draftDB,templateVersion:db?.version,draftVersion:draftDB?.version}),undo,redo,moveText,applyPreset,flushDraft,playMotion,stopMotion,exportVideo,getStudioState:()=>({busy,undo:undoStack.length,redo:redoStack.length,playing:!!motionFrame,recording,reduced:$('reduceMotion').checked}),configure,snapshot,importImage,exportPNG,createTemplate,loadTemplate,updateTemplate,deleteTemplate,undoDelete,importJSON,previewImportJSON,cancelImportJSON,exportJSON,refreshTemplates,sampleImage,normalizeFile,draw,dbName:DBNAME};
if(document.modelContext?.registerTool){const context=document.modelContext,lifecycle=new AbortController();const register=(name,description,properties,required,execute,readOnlyHint=false)=>{try{Promise.resolve(context.registerTool({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint,untrustedContentHint:true},execute},{signal:lifecycle.signal})).catch(()=>{})}catch{}};register('get_card_state','현재 카드 설정과 사용자 템플릿 목록을 읽습니다.',{},[],()=>({ratio:state.ratio,text:state.text,fontSize:state.fontSize,color:state.color,position:state.position,templates:snapshot().templates}),true);register('configure_card','문구·비율·위치를 변경하고 카드 미리보기에 반영합니다.',{text:{type:'string',maxLength:2000},ratio:{type:'string',enum:Object.keys(SIZES)},position:{type:'string',enum:['top','center','bottom']}},[],async input=>{if(!input||Object.keys(input).some(k=>!['text','ratio','position'].includes(k)))throw Error('허용되지 않은 편집 입력입니다.');await configure(input);return {ratio:state.ratio,lineCount:layout.lines.length,effectiveFontSize:layout.effective}});register('create_card_template','현재 카드를 이 브라우저에 새 템플릿으로 저장합니다.',{name:{type:'string',minLength:1,maxLength:40}},['name'],async input=>createTemplate(input.name));window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true})}
