/* Patch (mini app): the multi-depth post card gets what it was missing —
   a live Telegram-like preview (real tables, folded blocks, premium emoji),
   one-tap block helpers, and a one-tap premium emoji bar. The poll and
   slideshow cards get the same emoji bar.
 *
 * Idempotent: refuses to run twice.
 * Usage: node patch_app_levels.mjs <app.html>
 */
import fs from 'node:fs';

const target = process.argv[2] || '/home/user/cf/rasa/app.html';
let src = fs.readFileSync(target, 'utf8');
const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('id="intLvPv"') === 0, 'app already has the levels extras');

/* ── 1) preview styles ───────────────────────────────────────────────────── */
const STYLE = `<style>
.ipv{background:var(--card2,#141b1d);border:1px solid var(--line,#25302f);border-radius:14px;padding:12px 14px;font-size:13.5px;line-height:1.9;overflow-x:auto}
.ipv h1,.ipv h2,.ipv h3,.ipv h4{margin:6px 0 8px;font-size:15.5px;line-height:1.7}
.ipv p{margin:6px 0}
.ipv table.ipv-t{width:100%;border-collapse:collapse;margin:8px 0;font-size:12.5px}
.ipv table.ipv-t th,.ipv table.ipv-t td{border:1px solid var(--line,#2b3735);padding:5px 7px;text-align:start}
.ipv table.ipv-t th{background:rgba(255,255,255,.04)}
.ipv caption.ipv-c{color:var(--mu,#8b9a98);font-size:12px;padding:3px 0;text-align:start}
.ipv .ipv-q{border-inline-start:3px solid var(--mint,#3df2c0);padding:4px 10px;margin:8px 0;color:var(--fg,#e7f2ef)}
.ipv .ipv-ci{color:var(--mu,#8b9a98);display:block;font-size:11.5px}
.ipv .ipv-d{border:1px dashed var(--line,#2b3735);border-radius:10px;padding:8px 10px;margin:8px 0}
.ipv .ipv-s{color:var(--mint,#3df2c0)}
.ipv pre{background:rgba(0,0,0,.25);border-radius:8px;padding:8px;white-space:pre-wrap;font-size:11.5px;direction:ltr}
.ipv ul,.ipv ol{padding-inline-start:20px;margin:6px 0}
.ipv img.ce{display:inline-block}
.chip.ie{border:0;background:transparent;font-size:18px;padding:2px 4px;cursor:pointer;border-radius:8px}
.chip.ie[data-iid=""]{opacity:.55}
</style>
`;

/* ── 2) levels card: labels, helpers, emoji bar, preview ─────────────────── */
const LV_OLD = `    <h3>📚 پست چندحالته</h3>
    <p style="color:var(--mu);font-size:12.5px">یک پیام، سه عمق. خواننده با دکمه انتخاب می‌کند چقدر بخواند؛ همه‌اش در همان پیام.</p>`;
const LV_NEW = `    <h3>📚 پست چندحالته</h3>
    <p style="color:var(--mu);font-size:12.5px">یک پیام، سه عمق. خواننده با دکمه انتخاب می‌کند چقدر بخواند؛ همه‌اش در همان پیام. جدول، تیتر و بخش تاشو پشتیبانی می‌شود و اموجی‌هایی که ربات می‌شناسد خودکار پرمیوم می‌شوند.</p>`;
must(count(LV_OLD) === 1, 'levels card head not found');
src = src.replace(LV_OLD, LV_NEW);

const MID_OLD = '<span class="lbl">📖 نسخهٔ متوسط (اختیاری)</span>';
must(count(MID_OLD) === 1, 'mid label not found');
src = src.replace(MID_OLD, '<span class="lbl">📚 نسخهٔ متوسط (اختیاری)</span>');

const BTN_OLD = `    <button class="btn pri" id="intLvBtn" style="width:100%;margin-top:10px">انتشار پست چندحالته</button>`;
const BTN_NEW = `    <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px" id="intBlk">
      <button class="btn" data-ib="table">+ جدول</button>
      <button class="btn" data-ib="details">+ بخش تاشو</button>
      <button class="btn" data-ib="quote">+ نقل‌قول</button>
      <button class="btn" data-ib="list">+ فهرست</button>
      <button class="btn" data-ib="head">+ تیتر</button>
      <button class="btn" data-ib="sep">+ جداکننده</button>
    </div>
    <span class="lbl">اموجی پرمیوم — روی هر فیلد که کرسر هست درج می‌شود</span>
    <div class="row" id="intEmo1" style="flex-wrap:wrap;gap:2px"></div>
    <div id="intLvPv" style="margin-top:10px"></div>
    <button class="btn pri" id="intLvBtn" style="width:100%;margin-top:10px">انتشار پست چندحالته</button>`;
must(count(BTN_OLD) === 1, 'levels publish button not found');
src = src.replace(BTN_OLD, BTN_NEW);

/* ── 3) poll + slideshow cards: emoji bars ──────────────────────────────── */
const POLL_OLD = `    <div class="row">
      <button class="btn" id="intPlAdd">+ گزینه</button>`;
const POLL_NEW = `    <span class="lbl">اموجی پرمیوم</span>
    <div class="row" id="intEmo2" style="flex-wrap:wrap;gap:2px"></div>
    <div class="row">
      <button class="btn" id="intPlAdd">+ گزینه</button>`;
must(count(POLL_OLD) === 1, 'poll add-row not found');
src = src.replace(POLL_OLD, POLL_NEW);

const SL_OLD = `    <input class="fld" id="intSlCaption" placeholder="کپشن اسلایدشو (اختیاری)">`;
const SL_NEW = `    <span class="lbl">اموجی پرمیوم در کپشن</span>
    <div class="row" id="intEmo3" style="flex-wrap:wrap;gap:2px"></div>
    <input class="fld" id="intSlCaption" placeholder="کپشن اسلایدشو (اختیاری)">`;
must(count(SL_OLD) === 1, 'slideshow caption field not found');
src = src.replace(SL_OLD, SL_NEW);

/* ── 4) logic ────────────────────────────────────────────────────────────── */
const JS_ANCHOR = `if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',intBind);else intBind();`;
must(count(JS_ANCHOR) === 1, 'section bootstrap anchor not found');

const JS = `
/* ── پیش‌نمایش تلگرامی: جدول، تیتر، بخش تاشو، اموجی پرمیوم ── */
var INT_EMO=['🚀','⚡','📚','✅','🎯','💎','📈','✨','🔥','🗳','📸','⏰','🏷','🔔','🌍','💬','🙌','📌','🔖','🧠'];
var INT_BLK={
  table:'<table bordered striped compact>\\n<tr><th>عنوان</th><th>توضیح</th></tr>\\n<tr><td>—</td><td>—</td></tr>\\n</table>\\n',
  details:'<details><summary>عنوان بخش</summary>\\n<p>متن پنهان</p>\\n</details>\\n',
  quote:'<blockquote>جمله‌ای که باید بماند<cite>منبع</cite></blockquote>\\n',
  list:'<ul>\\n<li>مورد اول</li>\\n<li>مورد دوم</li>\\n</ul>\\n',
  head:'<h2>تیتر</h2>\\n',
  sep:'<hr>\\n'
};
function intPrem(){
  var m={};
  try{(EM.packs||[]).forEach(function(p){(p.items||[]).forEach(function(i){
    if(!i||!i.e||!i.id)return;var k=String(i.e);m[k]=i.id;m[k.replace(/[\\uFE0E\\uFE0F]/g,'')]=i.id})})}catch(e){}
  return m;
}
function intImg(id,alt){return '<img class="ce" src="'+qa(emImg(id))+'" alt="'+qa(alt)+'" style="width:18px;height:18px;vertical-align:-3px">'}
function intTags(s){
  return s.replace(/&lt;(\\/?)(h[1-6]|p|br|table|tr|th|td|caption|blockquote|cite|details|summary|ul|ol|li|pre|code|b|i|u|s|mark|hr|aside|footer|tg-spoiler|tg-emoji|tg-time)\\b((?:[^&]|&(?!gt;))*?)&gt;/gi,
    function(_,c,tag,attrs){return '<'+c+tag+String(attrs||'').replace(/&quot;/g,'"')+'>'});
}
function intRender(val){
  var s=intTags(esc(String(val||''))),stash=[];
  s=s.replace(/<tg-emoji\\b[^>]*>([\\s\\S]*?)<\\/tg-emoji>/gi,function(full,inner){
    var m=/emoji-id="?(\\d+)"?/i.exec(full);stash.push(m?intImg(m[1],inner):inner);return '\\u0001'+(stash.length-1)+'\\u0001'});
  var map=intPrem(),n=0;
  for(var k in map)n++;n=n>0?1:0;
  if(n)s=s.replace(/(\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic})*)/gu,function(ch){
    var id=map[ch]||map[ch.replace(/[\\uFE0E\\uFE0F]/g,'')];return id?intImg(id,ch):ch});
  s=s.replace(/\\u0001(\\d+)\\u0001/g,function(_,i){return stash[+i]});
  s=s.replace(/<tg-time[^>]*>([\\s\\S]*?)<\\/tg-time>/gi,'$1');
  s=s.replace(/<table[^>]*>/gi,'<table class="ipv-t">').replace(/<caption[^>]*>/gi,'<caption class="ipv-c">');
  s=s.replace(/<details[^>]*>/gi,'<div class="ipv-d">').replace(/<\\/details>/gi,'</div>');
  s=s.replace(/<summary[^>]*>/gi,'<b class="ipv-s">').replace(/<\\/summary>/gi,'</b><br>');
  s=s.replace(/<blockquote[^>]*>/gi,'<div class="ipv-q">').replace(/<\\/blockquote>/gi,'</div>');
  s=s.replace(/<cite[^>]*>/gi,'<i class="ipv-ci">').replace(/<\\/cite>/gi,'</i>');
  return s;
}
function intPreview(){
  var box=document.getElementById('intLvPv');if(!box)return;
  var src=document.getElementById('intLvFull').value.trim();
  if(!src){box.innerHTML='<small style="color:var(--mu)">نسخهٔ کامل که بنویسی، همین‌جا شبیه تلگرام می‌بینی.</small>';return}
  box.innerHTML='<div class="ipv">'+intRender(src)+'</div>';
}
function intEmoPaint(){
  var map=intPrem();
  var html=INT_EMO.map(function(e){var id=map[e]||map[e.replace(/[\\uFE0E\\uFE0F]/g,'')]||'';
    return '<button class="chip ie" data-ie="'+qa(e)+'" data-iid="'+qa(id)+'" title="'+(id?'پرمیوم':'عادی')+'">'+e+'</button>'}).join('')
    +'<button class="chip ie" data-ie="__all" title="همهٔ اموجی‌های پرمیوم">😀…</button>';
  ['intEmo1','intEmo2','intEmo3'].forEach(function(k){var b=document.getElementById(k);if(b)b.innerHTML=html});
}
function intFieldOf(){var f=INT.field;if(f&&document.contains(f))return f;
  return document.getElementById('intLvFull')||document.querySelector('#v-inter textarea')||document.querySelector('#v-inter input');}
function intInsert(txt){
  var t=intFieldOf();if(!t)return;
  var s=(t.selectionStart==null)?t.value.length:t.selectionStart,e=(t.selectionEnd==null)?s:t.selectionEnd;
  try{t.setRangeText(txt,s,e,'end')}catch(x){t.value=t.value.slice(0,s)+txt+t.value.slice(e)}
  t.dispatchEvent(new Event('input',{bubbles:true}));t.focus();hap('pick');
}
function intEmoBind(){
  var sec=document.getElementById('v-inter');
  if(sec&&!sec.__intEmo){
    sec.__intEmo=1;
    sec.addEventListener('focusin',function(e){var t=e.target;if(t&&(t.tagName==='TEXTAREA'||t.tagName==='INPUT'))INT.field=t});
    sec.addEventListener('click',function(e){
      var eb=e.target.closest('[data-ie]');
      if(eb){
        if(eb.dataset.ie==='__all'){var t=intFieldOf();if(t){var s=t.selectionStart==null?t.value.length:t.selectionStart;openEmojiSheet(t,s,t.selectionEnd==null?s:t.selectionEnd)}return}
        var id=eb.dataset.iid,em=eb.dataset.ie;
        intInsert(id?('<tg-emoji emoji-id="'+id+'">'+em+'</tg-emoji>'):em);
        return;
      }
      var bb=e.target.closest('[data-ib]');
      if(bb){intInsert(INT_BLK[bb.dataset.ib]||'');}
    });
  }
  var tT=null;
  ['intLvShort','intLvMid','intLvFull'].forEach(function(k){
    var t=document.getElementById(k);if(!t)return;
    t.addEventListener('input',function(){clearTimeout(tT);tT=setTimeout(intPreview,180)});
  });
  /* پک‌های پرمیوم: اگر آنلاین هستیم یک‌بار تازه بگیر، وگرنه از حافظه/نمونه */
  try{
    if(S.online&&!INT.emoFresh&&typeof emReload==='function'){INT.emoFresh=1;emReload(function(){intEmoPaint();intPreview()})}
    else if(typeof emLoad==='function')emLoad(function(){intEmoPaint();intPreview()});
  }catch(e){}
  intEmoPaint();intPreview();
}
`;

src = src.replace(JS_ANCHOR, JS + '\n' + JS_ANCHOR);

/* paintInter() must refresh the new bits too */
const PI_OLD = `function paintInter(){intPaintTargets();intOptionsPaint();paintInterList();intLoad()}`;
const PI_NEW = `function paintInter(){intPaintTargets();intOptionsPaint();paintInterList();intLoad();intBindExtras()}`;
must(count(PI_OLD) === 1, 'paintInter not found');
src = src.replace(PI_OLD, PI_NEW);

const BIND_OLD = `if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',intBind);else intBind();`;
const BIND_NEW = `function intBindExtras(){intEmoBind()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){intBind();intBindExtras()});else{intBind();intBindExtras()}`;
must(count(BIND_OLD) === 1, 'bootstrap anchor gone');
src = src.replace(BIND_OLD, BIND_NEW);

/* ── 5) sanity ───────────────────────────────────────────────────────────── */
must(count('id="intLvPv"') === 1, 'preview box missing');
must(count('function intRender(') === 1, 'renderer missing');
must(count('id="intEmo1"') === 1 && count('id="intEmo2"') === 1 && count('id="intEmo3"') === 1, 'emoji bars missing');
must(count('data-ib="table"') === 1, 'block helpers missing');
fs.writeFileSync(target, src);
console.log('✔ levels extras patched →', Buffer.byteLength(src), 'bytes');
