/* Patch (mini app): making the multi-depth card usable for a normal person.
 *
 * 1) The premium-emoji bar used to paste raw `<tg-emoji …>` tags. In a title,
 *    a poll option or a caption those tags can never work (buttons and escaped
 *    contexts show them literally) and inside the body the bot already turns
 *    plain emoji into premium ones by itself. So the bar now inserts the plain
 *    character — nothing to break, same result.
 * 2) «+ جدول» no longer dumps raw HTML nobody can edit. It opens a small visual
 *    table builder: rows × columns, + ردیف / + ستون, and one button that writes
 *    a clean table into the post — and can re-write/edit it later.
 *
 * Idempotent: refuses to run twice. Usage: node patch_app_table.mjs <app.html>
 */
import fs from 'node:fs';

const target = process.argv[2] || '/home/user/cf/rasa/app.html';
let src = fs.readFileSync(target, 'utf8');
const count = (n) => src.split(n).length - 1;
const must = (c, m) => { if (!c) { console.error('✖ ' + m); process.exit(1); } };

must(count('id="intTbBox"') === 0, 'app already has the table builder');

/* ── 1) table builder markup, right under the block buttons ─────────────── */
const BTN_ANCHOR = `      <button class="btn" data-ib="sep">+ جداکننده</button>
    </div>`;
must(count(BTN_ANCHOR) === 1, 'block buttons anchor not found');
const BUILDER = `      <button class="btn" data-ib="sep">+ جداکننده</button>
    </div>
    <div id="intTbBox" style="display:none;margin-top:10px">
      <div class="row" style="justify-content:space-between;align-items:center">
        <b style="font-size:13px">🧮 سازندهٔ جدول</b>
        <small style="color:var(--mu)" id="intTbHint">خانه‌ها را پر کن، بعد «درج در متن»</small>
      </div>
      <div class="row" style="flex-wrap:wrap;gap:6px;margin:6px 0">
        <button class="btn" data-tb="rowAdd">+ ردیف</button>
        <button class="btn" data-tb="colAdd">+ ستون</button>
        <button class="btn" data-tb="rowDel">− ردیف</button>
        <button class="btn" data-tb="colDel">− ستون</button>
        <button class="btn" data-tb="primary">جابه‌جایی سطر عنوان</button>
      </div>
      <div class="row" style="gap:6px;align-items:center;margin-bottom:6px">
        <select class="fld" id="intTbStyle" style="max-width:190px">
          <option value="bordered striped compact">خط‌کشی‌شده و راه‌راه</option>
          <option value="bordered compact">خط‌کشی‌شده</option>
          <option value="striped">راه‌راه</option>
          <option value="">ساده</option>
        </select>
        <label style="font-size:12px;color:var(--mu)"><input type="checkbox" id="intTbHead" checked> سطر اول عنوان باشد</label>
      </div>
      <div id="intTbGrid"></div>
      <div class="row" style="gap:6px;margin-top:8px">
        <button class="btn pri grow" data-tb="insert">درج / به‌روزرسانی جدول در متن</button>
        <button class="btn" data-tb="toFull">هدف: نسخهٔ کامل</button>
      </div>
    </div>`;
src = src.replace(BTN_ANCHOR, BUILDER);

/* ── 2) emoji bar inserts the plain character ───────────────────────────── */
const TAG_INSERT = `        var id=eb.dataset.iid,em=eb.dataset.ie;
        intInsert(id?('<tg-emoji emoji-id="'+id+'">'+em+'</tg-emoji>'):em);
        return;`;
must(count(TAG_INSERT) === 1, 'emoji-bar insert anchor not found');
src = src.replace(TAG_INSERT, `        /* اموجی ساده درج می‌شود؛ خود ربات داخل متن پرمیومش می‌کند و
           برای دکمه‌ها هم آیکن پرمیوم ست می‌شود. تگ خام هیچ‌جا کار نمی‌کند. */
        intInsert(eb.dataset.ie);
        return;`);

const TAG_PICKER = `        if(eb.dataset.ie==='__all'){var t=intFieldOf();if(t){var s=t.selectionStart==null?t.value.length:t.selectionStart;openEmojiSheet(t,s,t.selectionEnd==null?s:t.selectionEnd)}return}`;
must(count(TAG_PICKER) === 1, 'all-emoji picker anchor not found');
src = src.replace(TAG_PICKER, `        if(eb.dataset.ie==='__all'){var t=intFieldOf();if(t){var s=t.selectionStart==null?t.value.length:t.selectionStart;openEmojiSheet(t,s,t.selectionEnd==null?s:t.selectionEnd)}return}`);

/* the block-template click: «جدول» opens the builder instead of pasting HTML */
const BLOCK_CLICK = `      var bb=e.target.closest('[data-ib]');
      if(bb){intInsert(INT_BLK[bb.dataset.ib]||'');}`;
must(count(BLOCK_CLICK) === 1, 'block click anchor not found');
src = src.replace(BLOCK_CLICK, `      var bb=e.target.closest('[data-ib]');
      if(bb){
        if(bb.dataset.ib==='table'){intTableToggle();return}
        intInsert(INT_BLK[bb.dataset.ib]||'');
        return;
      }
      var tb=e.target.closest('[data-tb]');
      if(tb){intTableAction(tb.dataset.tb);}`);

/* ── 3) the builder itself ──────────────────────────────────────────────── */
const JS_ANCHOR = `function intBindExtras(){intEmoBind()}`;
must(count(JS_ANCHOR) === 1, 'extras anchor not found');
const TABLE_JS = `
/* ── سازندهٔ جدول: بدون HTML خام ── */
INT.tbl={rows:2,cols:2,cells:[['',''],['','']],last:'',open:false};
function intTableTarget(){
  var z=INT.tblField;if(z&&document.contains(z))return z;
  return document.getElementById('intLvFull');
}
function intTablePaint(){
  var g=document.getElementById('intTbGrid');if(!g)return;
  var t=INT.tbl,h='';
  for(var r=0;r<t.rows;r++){
    h+='<div class="row" style="gap:4px;margin-bottom:4px">';
    for(var c=0;c<t.cols;c++){
      var v=(t.cells[r]&&t.cells[r][c]!=null)?t.cells[r][c]:'';
      var head=(r===0&&document.getElementById('intTbHead').checked);
      h+='<input class="fld" dir="auto" data-tc="'+r+':'+c+'" value="'+qa(v)+'" placeholder="'+(head?('عنوان '+(c+1)):((r+1)+'×'+(c+1)))+'" style="min-width:0;flex:1'+(head?';font-weight:700':'')+'">';
    }
    h+='</div>';
  }
  g.innerHTML=h;
}
function intTableToggle(){
  INT.tbl.open=!INT.tbl.open;
  document.getElementById('intTbBox').style.display=INT.tbl.open?'block':'none';
  if(INT.tbl.open){INT.tblField=intFieldOf();intTablePaint();hap('pick')}
}
function intTableHtml(){
  var t=INT.tbl,head=document.getElementById('intTbHead').checked;
  var style=document.getElementById('intTbStyle').value;
  var html='<table'+(style?' '+style:'')+'>';
  for(var r=0;r<t.rows;r++){
    html+='\\n<tr>';
    for(var c=0;c<t.cols;c++){
      var v=(t.cells[r]&&t.cells[r][c])||'';
      var tag=(head&&r===0)?'th':'td';
      html+='<'+tag+'>'+(v||'—')+'</'+tag+'>';
    }
    html+='</tr>';
  }
  return html+'\\n</table>';
}
function intTableAction(a){
  var t=INT.tbl,f;
  var read=function(){[].forEach.call(document.querySelectorAll('[data-tc]'),function(i){
    var p=i.dataset.tc.split(':'),r=+p[0],c=+p[1];(t.cells[r]=t.cells[r]||[])[c]=i.value})};
  if(a!=='toFull')read();   /* قبل از هر عمل، مقادیر فعلی خانه‌ها خوانده می‌شود */
  if(a==='rowAdd'){t.rows++;t.cells[t.rows-1]=t.cells[t.rows-1]||[];intTablePaint()}
  else if(a==='colAdd'){t.cols++;intTablePaint()}
  else if(a==='rowDel'&&t.rows>2){t.rows--;t.cells.length=t.rows;intTablePaint()}
  else if(a==='colDel'&&t.cols>2){t.cols--;intTablePaint()}
  else if(a==='toFull'){INT.tblField=document.getElementById('intLvFull');toast('جدول داخل «نسخهٔ کامل» درج می‌شود')}
  else if(a==='insert'){
    f=intTableTarget();if(!f){toast('اول یک فیلد متن را انتخاب کن');hap('err');return}
    var html=intTableHtml();
    if(t.last&&f.value.indexOf(t.last)>=0){f.value=f.value.replace(t.last,html)}
    else{
      var s=(f.selectionStart==null)?f.value.length:f.selectionStart;
      f.value=f.value.slice(0,s)+(s&&f.value[s-1]!=='\\n'?'\\n':'')+html+'\\n'+f.value.slice(s);
    }
    t.last=html;f.dispatchEvent(new Event('input',{bubbles:true}));
    toast('جدول در متن نشست');hap('ok');
  }
  hap('pick');
}
`;
src = src.replace(JS_ANCHOR, JS_ANCHOR + '\n' + TABLE_JS);

/* keep the table field in sync with the focused input */
const FOCUS_ANCHOR = `sec.addEventListener('focusin',function(e){var t=e.target;if(t&&(t.tagName==='TEXTAREA'||t.tagName==='INPUT'))INT.field=t});`;
must(count(FOCUS_ANCHOR) === 1, 'focusin anchor not found');
src = src.replace(FOCUS_ANCHOR, `sec.addEventListener('focusin',function(e){var t=e.target;if(t&&(t.tagName==='TEXTAREA'||t.tagName==='INPUT')){if(!t.dataset.tc)INT.field=t;if(t.id==='intLvShort'||t.id==='intLvMid'||t.id==='intLvFull')INT.tblField=t}});`);

/* paint the grid when the view opens */
const PI_ANCHOR = `function intBindExtras(){intEmoBind()}`;
src = src.replace(PI_ANCHOR, `function intBindExtras(){intEmoBind();if(document.getElementById('intTbBox')&&INT.tbl&&INT.tbl.open)intTablePaint()}`);

/* ── 4) sanity ──────────────────────────────────────────────────────────── */
must(count('id="intTbBox"') === 1, 'builder box missing');
must(count('function intTableHtml()') === 1, 'builder html fn missing');
must(count("if(bb.dataset.ib==='table')") === 1, 'builder toggle not wired');
must(count("intInsert(eb.dataset.ie);") === 1, 'plain-emoji insert not wired');
fs.writeFileSync(target, src);
console.log('✔ table builder + plain emoji patched →', Buffer.byteLength(src), 'bytes');
