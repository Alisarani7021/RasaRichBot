/* Patch: the interactive-templates section inside the mini app.
   Adds a «🧩 قالبهای تعاملی» view with three ready forms — multi-depth post,
   native slideshow, live poll — plus the list of what the owner published.
   Idempotent: refuses to run twice.
   Usage: node patch_app_templates.mjs <app.html>                               */
import fs from 'node:fs';

const target = process.argv[2] || '/home/user/cf/rasa/app.html';
let src = fs.readFileSync(target, 'utf8');
const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count("id=\"v-inter\"") === 0, 'app already has the interactive section');

/* ---------- 1) the section markup ---------- */
const SECTION = `
<section class="view" id="v-inter">
  <div class="card">
    <h2>🧩 قالب‌های تعاملی</h2>
    <p style="color:var(--mu)">سه قالب آماده — پست چندحالته، اسلایدشو و نظرسنجی زنده. مقصد را انتخاب کن، پر کن و منتشر کن؛ همه چیز همان لحظه در مقصد منتشر می‌شود و از همین صفحه مدیریت می‌شود.</p>
    <span class="lbl">مقصد انتشار</span>
    <select class="fld" id="intTarget"></select>
    <div id="intVerdict"></div>
  </div>

  <div class="card" style="margin-top:12px">
    <h3>📚 پست چندحالته</h3>
    <p style="color:var(--mu);font-size:12.5px">یک پیام، سه عمق. خواننده با دکمه انتخاب می‌کند چقدر بخواند؛ همه‌اش در همان پیام.</p>
    <input class="fld" id="intLvTitle" placeholder="عنوان (اختیاری)">
    <span class="lbl">⚡ خلاصهٔ ۳۰ ثانیه (لازم)</span>
    <textarea class="ta" id="intLvShort" rows="2" placeholder="جانِ مطلب در دو خط"></textarea>
    <span class="lbl">📖 نسخهٔ متوسط (اختیاری)</span>
    <textarea class="ta" id="intLvMid" rows="3" placeholder="برای کسی که وقت دارد"></textarea>
    <span class="lbl">✅ نسخهٔ کامل (لازم)</span>
    <textarea class="ta" id="intLvFull" rows="5" placeholder="کل مطلب"></textarea>
    <button class="btn pri" id="intLvBtn" style="width:100%;margin-top:10px">انتشار پست چندحالته</button>
  </div>

  <div class="card" style="margin-top:12px">
    <h3>🎞 اسلایدشو نیتیو</h3>
    <p style="color:var(--mu);font-size:12.5px">۲ تا ۸ عکس؛ تلگرام خودش بین‌شان می‌چرخد و همه در یک پیام می‌مانند.</p>
    <input type="file" id="intSlFiles" accept="image/*" multiple class="fld">
    <div id="intSlThumbs" class="row" style="flex-wrap:wrap;gap:6px;margin:6px 0"></div>
    <input class="fld" id="intSlCaption" placeholder="کپشن اسلایدشو (اختیاری)">
    <button class="btn pri" id="intSlBtn" style="width:100%;margin-top:10px">انتشار اسلایدشو</button>
  </div>

  <div class="card" style="margin-top:12px">
    <h3>🗳 نظرسنجی زنده</h3>
    <p style="color:var(--mu);font-size:12.5px">نمودار داخل خودِ پیام بالا و پایین می‌رود؛ رأی قابل تغییر است و مهلت را هم می‌توانی بگذاری.</p>
    <input class="fld" id="intPlTitle" placeholder="سؤال نظرسنجی">
    <input class="fld" id="intPlSub" placeholder="توضیح کوتاه (اختیاری)">
    <div id="intPlOpts"></div>
    <div class="row">
      <button class="btn" id="intPlAdd">+ گزینه</button>
      <select class="fld grow" id="intPlMin">
        <option value="0">بدون مهلت</option>
        <option value="10">۱۰ دقیقه</option>
        <option value="60">۱ ساعت</option>
        <option value="1440">۲۴ ساعت</option>
      </select>
    </div>
    <button class="btn pri" id="intPlBtn" style="width:100%;margin-top:10px">انتشار نظرسنجی</button>
  </div>

  <div class="card" style="margin-top:12px">
    <h3>منتشرشده‌های من</h3>
    <div id="intList"></div>
    <button class="btn" id="intRefresh" style="width:100%;margin-top:10px">تازه‌سازی فهرست</button>
  </div>
</section>
`;

const SEC_ANCHOR = '<section class="view" id="v-schedule">';
must(count(SEC_ANCHOR) === 1, 'schedule section anchor not unique');
src = src.replace(SEC_ANCHOR, SECTION + '\n' + SEC_ANCHOR);

/* ---------- 2) register the view ---------- */
const VIEWS = "var VIEWS=['home','build','preview','library','channels','conn','friends','brand','schedule','ai','import','about'];";
must(count(VIEWS) === 1, 'VIEWS line not unique');
src = src.replace(VIEWS, "var VIEWS=['home','build','preview','library','channels','conn','friends','brand','schedule','ai','import','about','inter'];");

const PAINT = "if(v==='import')paintImport();";
must(count(PAINT) === 1, 'paint dispatch anchor not unique');
src = src.replace(PAINT, PAINT + "if(v==='inter')paintInter();");

const EXTRA = "var EXTRA_NAV=[['conn','کانال‌ها','channel'],";
must(count(EXTRA) === 1, 'EXTRA_NAV anchor not unique');
src = src.replace(EXTRA, "var EXTRA_NAV=[['inter','قالب‌های تعاملی','spark'],['conn','کانال‌ها','channel'],");

const MV = "['library','channels','friends','brand','schedule','ai','import','about'].forEach(function(v){var e=document.getElementById('v-'+v);if(e)e.classList.add('mv')});";
must(count(MV) === 1, 'mv list anchor not unique');
src = src.replace(MV, "['library','channels','friends','brand','schedule','ai','import','about','inter'].forEach(function(v){var e=document.getElementById('v-'+v);if(e)e.classList.add('mv')});");

/* ---------- 3) the section logic ---------- */
const JS = `
/* ═══════════ قالب‌های تعاملی ═══════════ */
var INT={files:[],items:[],busy:false};
function intTargetValue(){var s=document.getElementById('intTarget');return s&&s.value?s.value:'me'}
function intPaintTargets(){
  var s=document.getElementById('intTarget');if(!s)return;
  var ch=(typeof S!=='undefined'&&S.channels)?S.channels:[];
  var keep=s.value;
  s.innerHTML='<option value="me">پیوی خودم (آزمایش)</option>'+ch.map(function(c){
    var v=(c.username?'@'+c.username:String(c.chat));
    return '<option value="'+qa(v)+'">'+esc(c.title||v)+' — '+esc(v)+'</option>'}).join('');
  if(keep&&[].some.call(s.options,function(o){return o.value===keep}))s.value=keep;
}
function intOptionsPaint(n){
  var box=document.getElementById('intPlOpts');if(!box)return;
  var cur=box.querySelectorAll('input');var vals=[];for(var i=0;i<cur.length;i++)vals.push(cur[i].value);
  if(n==null)n=Math.max(2,cur.length||3);
  var h='';
  for(var k=0;k<n;k++)h+='<div class="row"><input class="fld grow" data-io="'+k+'" placeholder="گزینهٔ '+(k+1)+'" value="'+qa(vals[k]||'')+'"></div>';
  box.innerHTML=h;
}
function intRow(it){
  var when=new Date(it.at||Date.now());
  var time=('0'+when.getHours()).slice(-2)+':'+('0'+when.getMinutes()).slice(-2);
  var kind=it.kind==='poll'?'🗳 نظرسنجی':it.kind==='levels'?'📚 چندحالته':'🎞 اسلایدشو';
  var extra=it.kind==='poll'&&it.votes!=null?' — '+it.votes+' رأی':'';
  var link=it.link?'<a class="btn" style="text-decoration:none" href="'+qa(it.link)+'" target="_blank">مشاهده</a>':'';
  var end=it.kind==='poll'?'<button class="btn" data-it="end" data-id="'+qa(it.id)+'">پایان رأی‌گیری</button>':'';
  return '<div class="opt"><span class="grow"><b>'+kind+'</b><small>'+esc(it.title||'')+extra+' · '+time+'</small></span>'
    +link+end+'<button class="btn red" data-it="rm" data-id="'+qa(it.id)+'" data-kind="'+qa(it.kind)+'">حذف</button></div>';
}
function paintInterList(items){
  var box=document.getElementById('intList');if(!box)return;
  if(items)INT.items=items;
  box.innerHTML=(INT.items&&INT.items.length)?INT.items.map(intRow).join(''):'<p style="color:var(--mu)">هنوز چیزی منتشر نکرده‌ای.</p>';
}
function intLoad(){
  api('/api/interactive/list',{}).then(function(r){if(r&&r.ok)paintInterList(r.items||[])}).catch(function(){});
}
function paintInter(){intPaintTargets();intOptionsPaint();paintInterList();intLoad()}
function intPublish(route,payload,label){
  if(INT.busy)return;INT.busy=true;
  var t=intTargetValue();
  api('/api/interactive/'+route,Object.assign({target:t},payload)).then(function(r){
    INT.busy=false;
    if(!r||!r.ok){
      var why=(r&&r.verdict&&r.verdict.h)?r.verdict.h:(r&&r.error)?r.error:'انتشار نشد';
      document.getElementById('intVerdict').innerHTML='<div class="vd bad">'+esc(why)+'</div>';
      toast('انتشار نشد');hap('err');return;
    }
    document.getElementById('intVerdict').innerHTML='<div class="vd good">✅ '+esc(label)+' منتشر شد</div>';
    toast(label+' منتشر شد');hap('ok');
    if(r.link){try{tg.openLink(r.link)}catch(e){}}
    paintInterList();intLoad();
  }).catch(function(){INT.busy=false;toast('خطای شبکه');hap('err')});
}
function intBind(){
  var lv=document.getElementById('intLvBtn');
  if(lv)lv.onclick=function(){
    var short=document.getElementById('intLvShort').value.trim();
    var full=document.getElementById('intLvFull').value.trim();
    if(!short||!full){toast('خلاصه و نسخهٔ کامل لازم است');hap('err');return}
    intPublish('levels',{title:document.getElementById('intLvTitle').value.trim(),levels:{short:short,mid:document.getElementById('intLvMid').value.trim(),full:full}},'پست چندحالته');
  };
  var add=document.getElementById('intPlAdd');
  if(add)add.onclick=function(){var n=document.getElementById('intPlOpts').querySelectorAll('input').length;if(n>=6){toast('حداکثر ۶ گزینه');return}intOptionsPaint(n+1);hap('pick')};
  var pb=document.getElementById('intPlBtn');
  if(pb)pb.onclick=function(){
    var opts=[];[].forEach.call(document.getElementById('intPlOpts').querySelectorAll('input'),function(i){if(i.value.trim())opts.push(i.value.trim())});
    if(opts.length<2){toast('حداقل دو گزینه');hap('err');return}
    intPublish('poll',{title:document.getElementById('intPlTitle').value.trim(),subtitle:document.getElementById('intPlSub').value.trim(),options:opts,minutes:Number(document.getElementById('intPlMin').value)||0},'نظرسنجی');
  };
  var fi=document.getElementById('intSlFiles');
  if(fi)fi.onchange=function(){
    var files=[].slice.call(this.files||[]).slice(0,8);
    if(!files.length)return;
    var box=document.getElementById('intSlThumbs');
    box.innerHTML='<small style="color:var(--mu)">در حال آپلود '+files.length+' عکس…</small>';
    INT.files=[];
    var done=0;
    files.forEach(function(f){
      var fd=new FormData();fd.append('file',f);
      var h={};if(typeof token!=='undefined'&&token)h['x-rasa-token']=token;
      fetch('/api/media/upload',{method:'POST',headers:h,body:fd}).then(function(r){return r.json()}).then(function(j){
        if(j&&j.ok&&j.media&&j.media.fileId)INT.files.push(j.media.fileId);
      }).catch(function(){}).then(function(){
        done++;
        if(done===files.length){
          box.innerHTML=INT.files.length?('<small style="color:var(--mint)">'+INT.files.length+' عکس آماده شد</small>'):'<small style="color:var(--mu)">آپلود نشد؛ دوباره تلاش کن</small>';
          hap(INT.files.length?'ok':'err');
        }
      });
    });
  };
  var sb=document.getElementById('intSlBtn');
  if(sb)sb.onclick=function(){
    if(INT.files.length<2){toast('حداقل دو عکس آپلود کن');hap('err');return}
    intPublish('slideshow',{media:INT.files.map(function(f){return {fileId:f}}),caption:document.getElementById('intSlCaption').value.trim()},'اسلایدشو');
  };
  var rf=document.getElementById('intRefresh');
  if(rf)rf.onclick=function(){intLoad();toast('تازه شد');hap('pick')};
  var list=document.getElementById('intList');
  if(list)list.addEventListener('click',function(e){
    var b=e.target.closest('button[data-it]');if(!b)return;
    var act=b.dataset.it,id=b.dataset.id,kind=b.dataset.kind;
    b.disabled=true;
    if(act==='end')api('/api/interactive/end',{id:id}).then(function(){toast('رأی‌گیری بسته شد');intLoad()});
    else api('/api/interactive/remove',{id:id,kind:kind}).then(function(){toast('حذف شد');intLoad()});
    hap(act==='end'?'ok':'pick');
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',intBind);else intBind();
`;

const JS_ANCHOR = "$('#brand').onclick=function(){setView('home')};";
must(count(JS_ANCHOR) === 1, 'js anchor not unique');
src = src.replace(JS_ANCHOR, JS + '\n' + JS_ANCHOR);

/* ---------- 4) sanity ---------- */
must(count('id="v-inter"') === 1, 'section missing');
must(count("'inter'") >= 2, 'view registration missing');
must(count('function paintInter()') === 1, 'paintInter missing');
must(count("'/api/interactive/") >= 4, 'api calls missing');
fs.writeFileSync(target, src);
console.log('✔ app patched →', Buffer.byteLength(src), 'bytes');
