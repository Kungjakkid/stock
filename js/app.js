/* ===== ระบบต้นทุนสินค้า — core app ===== */

const ANTHROPIC_KEY = 'sk-ant-api03-63Z11B4NL5CjEv5xtYBqE5IYcTk1-' +
  'JjE5O9PeWrPCibOYsT9Myuo99vQ-xRI0mIPrzR6u1TyeB' +
  'sFis8dkCvhYg-qUP9ZwAA';
const SUPABASE_URL = 'https://pahfjtmzytcokxmlblea.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaGZqdG16eXRjb2t4bWxibGVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTQ5NTEsImV4cCI6MjA5MzMzMDk1MX0' +
  '.dDhTJq4Y7jeMx8UXu8yB07xQE2M1pFC1eLzZW53aBis';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const fmtB = n => (+n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s==null?'':s).replace(/"/g,'&quot;').replace(/</g,'&lt;');

let materials = [];
let expenses = [];
let products = [];
let editingProdId = null;
let expMonthFilter = 'all';

const PAGE_TITLES={dashboard:'ภาพรวม',expenses:'ค่าใช้จ่าย',materials:'วัตถุดิบ',purchases:'ราคาซื้อ',products:'สินค้า',shipments:'ส่งออก'};
const TH_MONTH_SHORT={'มกราคม':'ม.ค.','กุมภาพันธ์':'ก.พ.','มีนาคม':'มี.ค.','เมษายน':'เม.ย.','พฤษภาคม':'พ.ค.','มิถุนายน':'มิ.ย.','กรกฎาคม':'ก.ค.','สิงหาคม':'ส.ค.','กันยายน':'ก.ย.','ตุลาคม':'ต.ค.','พฤศจิกายน':'พ.ย.','ธันวาคม':'ธ.ค.'};
const shortMonth = m => (TH_MONTH_SHORT[String(m).split(' ')[0]]||String(m).split(' ')[0]);

const TH_MONTHS=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function currentMonthLabel(){ const d=new Date(); return TH_MONTHS[d.getMonth()]+' '+(d.getFullYear()+543); }
function genMonthOptions(selected){
  const d=new Date(); const items=[];
  for(let off=2; off>=-18; off--){ const dd=new Date(d.getFullYear(), d.getMonth()+off, 1); items.push(TH_MONTHS[dd.getMonth()]+' '+(dd.getFullYear()+543)); }
  if(selected && !items.includes(selected)) items.unshift(selected);
  return items.map(l=>`<option value="${l}" ${l===selected?'selected':''}>${l}</option>`).join('');
}
function populateMonthSelects(selected){
  const def=selected||currentMonthLabel();
  ['ef-month','pf-month'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=genMonthOptions(def); });
}

/* ---------- UI helpers ---------- */
function showToast(msg, type='success'){
  const t=document.getElementById('toast');
  document.getElementById('toast-msg').textContent=msg;
  t.className='toast show '+(type==='error'?'error':'');
  clearTimeout(t._t); t._t=setTimeout(()=>t.className='toast',2700);
}
function setLoading(btnId, loading){
  const b=document.getElementById(btnId);
  if(!b) return;
  b.disabled=loading;
  if(loading){ b.dataset.label=b.textContent; b.textContent='กำลังบันทึก...'; }
  else b.textContent=b.dataset.label||'บันทึก';
}
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
function openLightbox(url){ document.getElementById('lightbox-img').src=url; document.getElementById('lightbox').classList.add('open'); }

function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light';
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('cost-theme',next)}catch(e){}
  const mt=document.querySelector('meta[name=theme-color]');
  if(mt) mt.setAttribute('content', next==='dark'?'#15140f':'#f4f2ee');
}

function secLabel(t,meta){return `<div class="sec-label"><span class="dot"></span><span class="t">${t}</span><span class="line"></span>${meta?`<span class="meta">${meta}</span>`:''}</div>`}
function emptyState(icon,msg,hint){return `<div class="empty"><div class="eico"><svg><use href="#${icon}"/></svg></div><p>${msg}</p>${hint?`<div class="hint">${hint}</div>`:''}</div>`}

function showPage(name, btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg=document.getElementById('page-'+name); if(pg) pg.classList.add('active');
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active', b.dataset.page===name));
  document.getElementById('topbar-title').textContent=PAGE_TITLES[name]||'';
  window.scrollTo({top:0});
  if(name==='dashboard') renderDashboard();
  if(name==='expenses') renderExpenses();
  if(name==='materials') renderMaterials();
  if(name==='purchases') renderPurchases();
  if(name==='products') renderProducts();
  if(name==='shipments') renderShipments();
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function kfmt(n){ n=+n||0; if(n>=1000) return (n/1000).toFixed(n>=10000?0:1).replace(/\.0$/,'')+'k'; return Math.round(n).toString(); }

function barChart(data){
  if(!data.length) return `<div class="empty" style="padding:30px"><div class="hint">ยังไม่มีข้อมูล</div></div>`;
  const max=Math.max(1,...data.map(d=>d.value));
  return `<div class="bars">`+data.map(d=>{
    const h=Math.round((d.value/max)*100);
    return `<div class="bar-col"><div class="v">${kfmt(d.value)}</div><div class="bar-track"><div class="bar" style="height:${Math.max(h,3)}%"></div></div><div class="lab">${d.label}</div></div>`;
  }).join('')+`</div>`;
}

function donutChart(segs, big, small){
  const total=segs.reduce((s,x)=>s+x.value,0);
  const r=52, c=2*Math.PI*r; let off=0;
  const circles = total>0 ? segs.filter(s=>s.value>0).map(s=>{
    const len=(s.value/total)*c;
    const el=`<circle cx="65" cy="65" r="${r}" fill="none" stroke="${s.color}" stroke-width="15" stroke-dasharray="${len} ${c-len}" stroke-dashoffset="${-off}" stroke-linecap="butt"/>`;
    off+=len; return el;
  }).join('') : '';
  return `<div class="donut"><svg width="130" height="130" viewBox="0 0 130 130">
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="15"/>${circles}
  </svg><div class="donut-center"><div class="big">${big}</div><div class="small">${small}</div></div></div>`;
}

function renderDashboard(){
  const el=document.getElementById('dash-content');
  const ships=(window.getAllShipments?window.getAllShipments():[])||[];
  const months=[...new Set(expenses.map(e=>e.month))];
  const byMonth={}; months.forEach(m=>byMonth[m]=expenses.filter(e=>e.month===m).reduce((s,e)=>s+(+e.total),0));
  const grandExp=expenses.reduce((s,e)=>s+(+e.total),0);
  const latestMonth=months[months.length-1];
  const monthTotal=latestMonth?byMonth[latestMonth]:0;

  const plats=[
    {key:'lazada',name:'Lazada',color:'var(--plat-lazada)'},
    {key:'shopee',name:'Shopee',color:'var(--plat-shopee)'},
    {key:'tiktok',name:'TikTok',color:'var(--text)'}
  ];
  plats.forEach(p=>{ p.value=ships.filter(s=>s.platform===p.key).reduce((a,b)=>a+(+b.cost||0),0); p.orders=ships.filter(s=>s.platform===p.key).length; });
  const shipCost=ships.reduce((s,x)=>s+(+x.cost||0),0);
  const shipOrders=ships.length;

  const avgCost=products.length?products.reduce((s,p)=>s+calcProductCost(p.bom),0)/products.length:0;

  document.getElementById('dash-sub').textContent=latestMonth?('ล่าสุด · '+latestMonth):'สรุปต้นทุนและการส่งออก';

  let html=`
  <div class="stat-grid">
    <div class="stat hero">
      <div class="ico"><svg><use href="#i-coin"/></svg></div>
      <div class="stat-label">ค่าใช้จ่ายรวมทั้งหมด</div>
      <div class="stat-value">${fmtB(grandExp)}<span class="stat-unit">฿</span></div>
      <div class="stat-sub">${expenses.length} รายการ${latestMonth?' · '+shortMonth(latestMonth)+' '+fmtB(monthTotal)+' ฿':''}</div>
    </div>
    <div class="stat"><div class="ico"><svg><use href="#i-material"/></svg></div><div class="stat-label">วัตถุดิบ</div><div class="stat-value">${materials.length}</div><div class="stat-sub">รายการ</div></div>
    <div class="stat"><div class="ico"><svg><use href="#i-product"/></svg></div><div class="stat-label">สินค้า</div><div class="stat-value">${products.length}</div><div class="stat-sub">฿${fmtB(avgCost)} เฉลี่ย/ชิ้น</div></div>
  </div>

  <div class="chart-grid">
    <div class="panel">
      <div class="panel-head"><div class="panel-title">ค่าใช้จ่ายรายเดือน</div><div class="panel-meta">บาท</div></div>
      ${barChart(months.map(m=>({label:shortMonth(m),value:byMonth[m]})))}
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title">ต้นทุนส่งออกตามแพลตฟอร์ม</div></div>
      <div class="donut-wrap">
        ${donutChart(plats.map(p=>({label:p.name,value:p.value,color:p.color})), fmtB(shipCost).split('.')[0], shipOrders+' ออเดอร์')}
        <div class="legend">
          ${plats.map(p=>`<div class="legend-row"><span class="legend-dot" style="background:${p.color}"></span><span class="lname">${p.name}</span><span class="lval">${fmtB(p.value)}</span></div>`).join('')}
        </div>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head"><div class="panel-title">รายการล่าสุด</div><button class="btn btn-sm btn-ghost" onclick="showPage('expenses')">ดูทั้งหมด</button></div>
    <div class="rows">${[...expenses].slice(-5).reverse().map(miniExpRow).join('')||emptyState('i-expense','ยังไม่มีรายการ','')}</div>
  </div>`;
  el.innerHTML=html;
  // animate bars
  requestAnimationFrame(()=>el.querySelectorAll('.bar').forEach(b=>{ const h=b.style.height; b.style.height='0'; requestAnimationFrame(()=>b.style.height=h); }));
}

function miniExpRow(e){
  const name=(e.name||'').replace(/\s*\(VAT 7%\)/g,'');
  return `<div class="row-card" style="padding:11px 14px">
    <div class="rc-top">
      <div><div class="rc-name" style="font-size:14px">${name||'(ไม่มีชื่อ)'}</div>
      <div class="rc-meta" style="margin-top:3px">${[e.shop,shortMonth(e.month)].filter(Boolean).map(x=>`<span>${x}</span>`).join('<span class="sep">·</span>')}</div></div>
      <div class="rc-amt">${fmtB(e.total)} ฿</div>
    </div>
  </div>`;
}

/* ============================================================
   EXPENSES
   ============================================================ */
async function loadExpenses(){
  const {data,error}=await db.from('expenses').select('*').order('created_at');
  if(error){showToast('โหลดค่าใช้จ่ายล้มเหลว','error');return}
  expenses=data;
}

/* แปลงข้อความจำนวน (เช่น "175 kg", "500 g") → จำนวน kg */
function qtyKg(qty){
  if(!qty) return null;
  const s=String(qty).toLowerCase().replace(/,/g,'');
  const m=s.match(/([\d.]+)\s*(kg|กก|กิโล|g|gram|กรัม|ml|มล|l|ลิตร)?/);
  if(!m) return null;
  const n=parseFloat(m[1]); if(!n) return null;
  const u=m[2]||'';
  if(/kg|กก|กิโล/.test(u))      return n;
  if(/^g|gram|กรัม/.test(u))    return n/1000;
  if(/^l|ลิตร/.test(u))         return n;       // ลิตร ≈ kg (เคมีเหลว)
  if(/ml|มล/.test(u))           return n/1000;
  return null;
}
function expRow(e){
  const hasVat=/\(VAT 7%\)/.test(e.name||'');
  const name=(e.name||'').replace(/\s*\(VAT 7%\)/g,'');
  const ppk=e.price_per_kg;
  const kg=qtyKg(e.qty);
  return `<tr>
    <td class="exp-nm"><div class="nm">${esc(name)||'(ไม่มีชื่อ)'}</div></td>
    <td class="exp-qty">${esc(e.qty||'')}</td>
    <td class="mono exp-kg-col">${kg!=null?fmtB(kg):'–'}</td>
    <td class="mono exp-kg">${ppk?fmtB(ppk):'–'}</td>
    <td class="exp-vat"><span class="vat-pill ${hasVat?'':'off'}" onclick="toggleExpVat('${e.id}')" title="คลิกเพื่อ${hasVat?'ลบ':'บวก'} VAT 7%">VAT</span></td>
    <td class="mono pos exp-amt">${fmtB(e.total)}</td>
    <td class="exp-act"><button class="icon-x" onclick="delExpense('${e.id}')"><svg><use href="#i-x"/></svg></button></td>
  </tr>`;
}
/* บิลหนึ่งใบ = หลายรายการที่มาจากใบกำกับเดียวกัน */
function renderBill(rows){
  const first=rows[0];
  const shop=rows.map(r=>r.shop).find(Boolean)||'(ไม่ระบุร้าน)';
  const date=rows.map(r=>r.date).find(Boolean)||'';
  const total=rows.reduce((s,e)=>s+(+e.total),0);
  const totalKg=rows.reduce((s,e)=>s+(qtyKg(e.qty)||0),0);
  const img=first.image_url?`<img class="exp-thumb" src="${first.image_url}" onclick="openLightbox('${first.image_url}')" title="ดูใบกำกับ">`:'';
  const slip=first.slip_url?`<img class="exp-thumb" src="${first.slip_url}" onclick="openLightbox('${first.slip_url}')" title="ดูสลิป">`:'';
  return `<div class="bill">
    <div class="bill-head">
      <div class="bill-info">
        <div class="bill-shop">${esc(shop)}</div>
        <div class="bill-meta">${date?esc(date)+' · ':''}${rows.length} รายการ${totalKg>0?' · รวม '+fmtB(totalKg)+' kg':''}</div>
      </div>
      <div class="bill-thumbs">${img}${slip}</div>
      <div class="bill-total">${fmtB(total)} <span>฿</span></div>
    </div>
    <div class="bom-table-wrap"><table class="dtable exp-dtable">
      <thead><tr><th>รายการ</th><th>จำนวน</th><th style="text-align:right">kg</th><th style="text-align:right">฿/kg</th><th style="text-align:center">VAT</th><th style="text-align:right">ยอด ฿</th><th></th></tr></thead>
      <tbody>${rows.map(expRow).join('')}</tbody>
    </table></div>
  </div>`;
}

function renderExpenses(){
  const wrap=document.getElementById('exp-list');
  if(!expenses.length){
    document.getElementById('exp-summary').innerHTML='';
    document.getElementById('exp-month-filter').innerHTML='';
    wrap.innerHTML=emptyState('i-expense','ยังไม่มีรายการค่าใช้จ่าย','กด “เพิ่ม” หรือ “PDF” เพื่อเริ่ม');
    return;
  }
  const months=[...new Set(expenses.map(e=>e.month))];
  const grand=expenses.reduce((s,e)=>s+(+e.total),0);
  const byMonth={}; months.forEach(m=>byMonth[m]=expenses.filter(e=>e.month===m).reduce((s,e)=>s+(+e.total),0));

  const chip=(v,label,val)=>`<button class="chip ${expMonthFilter===v?'active':''}" onclick="setExpMonth('${v}')">${label}<span class="cnt">${fmtB(val)}฿</span></button>`;
  let f=chip('all','ทั้งหมด',grand);
  months.forEach(m=>f+=chip(m,shortMonth(m),byMonth[m]));
  document.getElementById('exp-month-filter').innerHTML=f;

  const visibleMonths=expMonthFilter==='all'?months:[expMonthFilter];
  const visibleTotal=visibleMonths.reduce((s,m)=>s+byMonth[m],0);
  const cnt=expenses.filter(e=>visibleMonths.includes(e.month)).length;
  let sum=`<div class="stat hero"><div class="stat-label">${expMonthFilter==='all'?'รวมทั้งสิ้น':expMonthFilter}</div><div class="stat-value">${fmtB(visibleTotal)}<span class="stat-unit">฿</span></div><div class="stat-sub">${cnt} รายการ</div></div>`;
  if(expMonthFilter==='all'){
    months.slice(-2).forEach(m=>{ sum+=`<div class="stat" onclick="setExpMonth('${m}')" style="cursor:pointer"><div class="stat-label">${shortMonth(m)}</div><div class="stat-value" style="font-size:19px">${fmtB(byMonth[m])}</div><div class="stat-sub">บาท</div></div>`; });
  }
  document.getElementById('exp-summary').innerHTML=sum;

  let html='';
  visibleMonths.forEach(m=>{
    const monthRows=expenses.filter(e=>e.month===m);
    const total=monthRows.reduce((s,e)=>s+(+e.total),0);
    html+=secLabel(m, fmtB(total)+' ฿');
    // จัดกลุ่มเป็นบิล: ใช้ใบกำกับ(image_url) ร่วมกัน = บิลเดียวกัน, ไม่มีรูป = รายการเดี่ยว
    const groups=[]; const idx={};
    monthRows.forEach(e=>{
      const k=e.image_url||('single:'+e.id);
      if(idx[k]==null){ idx[k]=groups.length; groups.push([]); }
      groups[idx[k]].push(e);
    });
    groups.forEach(g=>{ html+=renderBill(g); });
  });
  wrap.innerHTML=html;
}

function setExpMonth(v){ expMonthFilter=v; renderExpenses(); }

async function toggleExpVat(id){
  const e=expenses.find(x=>x.id===id); if(!e) return;
  const has=/\(VAT 7%\)/.test(e.name||'');
  let newTotal, newName;
  if(has){ newTotal=+(+e.total/1.07).toFixed(2); newName=(e.name||'').replace(/\s*\(VAT 7%\)/g,''); }
  else{ newTotal=+(+e.total*1.07).toFixed(2); newName=(e.name||'')+' (VAT 7%)'; }
  const newPpk=computePerKg(e.qty,newTotal);
  const {error}=await db.from('expenses').update({total:newTotal,name:newName,price_per_kg:newPpk}).eq('id',id);
  if(error){showToast('อัปเดตล้มเหลว: '+error.message,'error');return}
  await loadExpenses(); renderExpenses();
  showToast(has?'ลบ VAT แล้ว':'บวก VAT 7% แล้ว');
}

function previewImage(input){
  const file=input.files[0]; if(!file) return;
  const url=URL.createObjectURL(file);
  document.getElementById('img-preview').src=url;
  document.getElementById('img-preview-wrap').style.display='block';
  document.getElementById('img-placeholder').style.display='none';
}
function showOcrBtn(){ document.getElementById('ocr-btn').style.display='flex'; }

async function readReceiptOCR(){
  const file=document.getElementById('ef-image').files[0];
  if(!file){showToast('กรุณาเลือกรูปก่อน','error');return}
  const btn=document.getElementById('ocr-btn');
  btn.disabled=true; btn.textContent='⏳ กำลังอ่าน...';
  try{
    const b64=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });
    const resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:512,
        messages:[{role:'user',content:[
          {type:'image',source:{type:'base64',media_type:file.type,data:b64}},
          {type:'text',text:'นี่คือใบเสร็จหรือสลิป กรุณาอ่านข้อมูลและตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น: {"date":"วันที่ dd/mm/yy หรือ dd/mm/yyyy","shop":"ชื่อร้านค้า","name":"ชื่อสินค้าหลัก","qty":"จำนวนและหน่วย","total":ยอดรวมตัวเลขเท่านั้น} ถ้าไม่พบข้อมูลใดให้ใส่ "" หรือ 0'}
        ]}] })
    });
    const json=await resp.json();
    if(!resp.ok) throw new Error(json.error?.message||'API error');
    const text=json.content[0].text.trim();
    const data=JSON.parse(text.replace(/```json|```/g,'').trim());
    if(data.date) document.getElementById('ef-date').value=data.date;
    if(data.shop) document.getElementById('ef-shop').value=data.shop;
    if(data.name) document.getElementById('ef-name').value=data.name;
    if(data.qty) document.getElementById('ef-qty').value=data.qty;
    if(data.total) document.getElementById('ef-total').value=data.total;
    updateExpVatPreview();
    showToast('อ่านใบเสร็จสำเร็จ');
  }catch(e){ showToast('อ่านไม่สำเร็จ: '+e.message,'error'); }
  finally{ btn.disabled=false; btn.innerHTML='<svg><use href="#i-spark"/></svg> อ่านข้อความจากรูปด้วย AI'; }
}

function openExpModal(){
  ['ef-date','ef-name','ef-shop','ef-qty','ef-total'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('ef-vat').checked=false;
  document.getElementById('ef-image').value='';
  document.getElementById('img-preview-wrap').style.display='none';
  document.getElementById('img-placeholder').style.display='block';
  document.getElementById('ocr-btn').style.display='none';
  populateMonthSelects();
  updateExpVatPreview();
  document.getElementById('exp-modal').classList.add('open');
}

function updateExpVatPreview(){
  const sub=parseFloat(document.getElementById('ef-total').value)||0;
  const vat=document.getElementById('ef-vat').checked;
  const net=vat?+(sub*1.07).toFixed(2):sub;
  const ppk=computePerKg(document.getElementById('ef-qty').value,net);
  document.getElementById('ef-net').textContent=fmtB(net);
  document.getElementById('ef-ppk').textContent=ppk?fmtB(ppk):'–';
}

async function saveExpense(){
  const sub=parseFloat(document.getElementById('ef-total').value)||0;
  const vat=document.getElementById('ef-vat').checked;
  const net=vat?+(sub*1.07).toFixed(2):sub;
  const qty=document.getElementById('ef-qty').value;
  const name=document.getElementById('ef-name').value;
  const row={
    date:document.getElementById('ef-date').value,
    month:document.getElementById('ef-month').value,
    name:name+(vat?' (VAT 7%)':''),
    shop:document.getElementById('ef-shop').value,
    qty, total:net, price_per_kg:computePerKg(qty,net)
  };
  if(!row.name||!row.total){alert('กรุณากรอกรายการและราคา');return}
  setLoading('exp-save-btn',true);
  const file=document.getElementById('ef-image').files[0];
  if(file){
    const ext=file.name.split('.').pop();
    const path=`expenses/${Date.now()}.${ext}`;
    const {error:upErr}=await db.storage.from('expense-images').upload(path,file,{cacheControl:'3600',upsert:false});
    if(upErr){showToast('อัปโหลดรูปล้มเหลว: '+upErr.message,'error');setLoading('exp-save-btn',false);return}
    const {data:urlData}=db.storage.from('expense-images').getPublicUrl(path);
    row.image_url=urlData.publicUrl;
  }
  const {error}=await db.from('expenses').insert(row);
  setLoading('exp-save-btn',false);
  if(error){showToast('บันทึกล้มเหลว: '+error.message,'error');return}
  closeModal('exp-modal'); await loadExpenses(); renderExpenses();
  showToast('บันทึกรายการแล้ว');
}

async function delExpense(id){
  if(!confirm('ลบรายการนี้?')) return;
  const exp=expenses.find(e=>e.id===id);
  if(exp?.image_url){ const path=exp.image_url.split('/expense-images/')[1]; if(path) await db.storage.from('expense-images').remove([path]); }
  await db.from('expenses').delete().eq('id',id);
  await loadExpenses(); renderExpenses();
}

/* ============================================================
   MATERIALS
   ============================================================ */
/* แปลงหน่วยที่กรอก → ตัวคูณให้เป็น "ต่อ 1 kg"
   คืน null ถ้าหน่วยไม่ใช่หน่วยน้ำหนัก (เช่น ใบ/ถุง/ชิ้น) */
function kgFactor(unit){
  const u=String(unit||'').toLowerCase().trim();
  if(!u) return null;
  if(/^(kg|กก|กิโล|กิโลกรัม)/.test(u)) return 1;        // ราคาต่อ kg อยู่แล้ว
  if(/^(ขีด)/.test(u)) return 10;                        // 1 ขีด = 100g → 10 ขีด = 1kg
  if(/^(g|gram|กรัม|ก\.)/.test(u)) return 1000;          // ราคาต่อ g → ×1000 = ต่อ kg
  return null;
}
/* ราคาต่อ 1 kg จากราคา/หน่วย */
function matPerKg(price, unit){
  const f=kgFactor(unit); if(f==null) return null;
  return +((+price||0)*f).toFixed(2);
}
/* ตารางแบ่งย่อย ฿ ต่อ 1kg / 100g / 10g / 1g */
function portionBreakdown(perKg){
  if(perKg==null) return '';
  const parts=[['1 kg',perKg],['100 g',perKg/10],['10 g',perKg/100],['1 g',perKg/1000]];
  return parts.map(([l,v])=>`<span class="chiplet" style="margin-right:6px">${l} = <b style="color:var(--accent)">${fmtB(v)}</b>฿</span>`).join('');
}
async function loadMaterials(){
  const {data,error}=await db.from('materials').select('*').order('created_at');
  if(error){showToast('โหลดวัตถุดิบล้มเหลว','error');return}
  materials=data;
}
let editingMatId=null;

function matDetail(m){
  if(m.buy_qty&&m.buy_total) return `ซื้อ ${(+m.buy_qty).toLocaleString('th-TH')} ${m.unit||''} รวม ${fmtB(m.buy_total)} ฿`;
  return m.note||'';
}
/* ราคามาตรฐานตามชนิดหน่วย: น้ำหนัก→฿/kg, ปริมาตร→฿/ลิตร, นับชิ้น→null */
function matNorm(m){
  const info=unitInfo(m.unit);
  if(info.cat==='c') return null;
  return { label: info.cat==='w'?'฿/kg':'฿/ลิตร', value:+((+m.price||0)*(1000/info.toBase)).toFixed(2) };
}
function renderMaterials(){
  const wrap=document.getElementById('mat-list');
  if(!materials.length){ wrap.innerHTML=emptyState('i-material','ยังไม่มีวัตถุดิบ','กด “เพิ่ม” เพื่อสร้างฐานข้อมูลราคา'); return; }

  // ----- การ์ดสรุปด้านบน -----
  const weightMats=materials.filter(m=>unitInfo(m.unit).cat==='w');
  const normed=weightMats.map(m=>({m,v:matNorm(m).value})).filter(x=>x.v>0);
  const avgKg=normed.length?normed.reduce((s,x)=>s+x.v,0)/normed.length:0;
  const maxItem=normed.length?normed.reduce((a,b)=>b.v>a.v?b:a):null;
  const summary=`<div class="stat-grid" style="margin-bottom:14px">
    <div class="stat hero"><div class="ico"><svg><use href="#i-material"/></svg></div>
      <div class="stat-label">วัตถุดิบทั้งหมด</div>
      <div class="stat-value">${materials.length}<span class="stat-unit">รายการ</span></div>
      <div class="stat-sub">${weightMats.length} ชนิดชั่งน้ำหนัก</div></div>
    <div class="stat"><div class="ico"><svg><use href="#i-coin"/></svg></div>
      <div class="stat-label">ราคาเฉลี่ย</div>
      <div class="stat-value" style="font-size:21px">${fmtB(avgKg)}<span class="stat-unit">฿/kg</span></div>
      <div class="stat-sub">เฉพาะวัตถุดิบชั่งน้ำหนัก</div></div>
    ${maxItem?`<div class="stat"><div class="ico"><svg><use href="#i-trend"/></svg></div>
      <div class="stat-label">แพงสุด/kg</div>
      <div class="stat-value" style="font-size:19px">${fmtB(maxItem.v)}<span class="stat-unit">฿</span></div>
      <div class="stat-sub">${esc(maxItem.m.name)}</div></div>`:''}
  </div>`;

  // ----- จัดกลุ่มตามชนิดหน่วย -----
  const cats=[
    {key:'w', label:'วัตถุดิบ · ชั่งน้ำหนัก', color:'var(--accent)'},
    {key:'v', label:'ของเหลว · ปริมาตร',     color:'var(--blue)'},
    {key:'c', label:'บรรจุภัณฑ์ / อื่น ๆ',   color:'var(--text-3)'}
  ];
  let html=summary;
  cats.forEach(c=>{
    const items=materials.filter(m=>unitInfo(m.unit).cat===c.key);
    if(!items.length) return;
    const hasNorm=c.key!=='c';
    const rows=items.map(m=>{
      const norm=matNorm(m);
      const sub=[m.shop,(m.buy_qty&&m.buy_total)?`ซื้อ ${(+m.buy_qty).toLocaleString('th-TH')}${esc(m.unit||'')}/${fmtB(m.buy_total)}฿`:''].filter(Boolean).join(' · ');
      return `<tr>
        <td class="mat-nm"><span class="mat-dot" style="background:${c.color}"></span><div class="mat-nmwrap"><div class="nm">${esc(m.name)}</div>${sub?`<div class="sub">${esc(sub)}</div>`:''}</div></td>
        <td class="mat-pr"><input type="number" step="0.01" class="price-input" value="${(+m.price).toFixed(2)}" onchange="updateMatPrice('${m.id}',this.value)"><span class="u">฿/${esc(m.unit||'?')}</span></td>
        ${hasNorm?`<td class="mono mat-kg">${norm?fmtB(norm.value):'–'}<span class="ku"> ${norm?norm.label:''}</span></td>`:''}
        <td class="mat-act">
          <button class="icon-btn" onclick="openMatModal('${m.id}')" title="แก้ไข"><svg><use href="#i-edit"/></svg></button>
          <button class="icon-x" onclick="delMaterial('${m.id}')"><svg><use href="#i-x"/></svg></button>
        </td>
      </tr>`;
    }).join('');
    html+=secLabel(c.label, items.length+' รายการ');
    html+=`<div class="bom-table-wrap"><table class="dtable mat-dtable">
      <thead><tr><th>วัตถุดิบ</th><th>ราคา / หน่วย</th>${hasNorm?`<th style="text-align:right">${c.key==='w'?'฿/kg':'฿/ลิตร'}</th>`:''}<th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  });
  wrap.innerHTML=html;
}
/* ===== หน้า "ราคาซื้อ" — ราคาซื้อล่าสุด + เครื่องคิดเลขแปลงหน่วย ===== */
/* หน่วยที่เลือกได้ใน dropdown ตามชนิดของวัตถุดิบ */
function unitOptionsFor(m){
  const info=unitInfo(m.unit);
  if(info.cat==='w') return ['kg','ขีด','กรัม'];
  if(info.cat==='v') return ['ลิตร','มล'];
  return [m.unit||'ชิ้น'];
}
/* คำนวณต้นทุนสด ๆ ในแถว (ไม่บันทึก ไม่แก้ราคาจริง) */
function calcBuyCost(el){
  const tr=el.closest('tr'); const id=tr.dataset.mat;
  const m=materials.find(x=>x.id===id); if(!m) return;
  const qty=parseFloat(tr.querySelector('.calc-qty').value)||0;
  const unit=tr.querySelector('.calc-unit').value;
  const used=unitsUsed(qty,unit,m.unit);
  const n=(used==null)?qty:used;
  const cost=(+m.price||0)*n;
  tr.querySelector('.calc-out').textContent=fmtB(cost);
}
function renderPurchases(){
  const wrap=document.getElementById('buy-list');
  const sumEl=document.getElementById('buy-summary');
  if(!materials.length){ sumEl.innerHTML=''; wrap.innerHTML=emptyState('i-coin','ยังไม่มีข้อมูลราคาซื้อ','กด “เพิ่ม” เพื่อบันทึกวัตถุดิบและราคาที่ซื้อมา'); return; }
  const withBuy=materials.filter(m=>m.buy_qty&&m.buy_total);
  const totalSpent=withBuy.reduce((s,m)=>s+(+m.buy_total||0),0);
  sumEl.innerHTML=`
    <div class="stat hero"><div class="ico"><svg><use href="#i-coin"/></svg></div>
      <div class="stat-label">มูลค่าซื้อรวม (ล็อตล่าสุด)</div>
      <div class="stat-value">${fmtB(totalSpent)}<span class="stat-unit">฿</span></div>
      <div class="stat-sub">${withBuy.length}/${materials.length} รายการมีบันทึกการซื้อ</div></div>
    <div class="stat"><div class="ico"><svg><use href="#i-material"/></svg></div>
      <div class="stat-label">วัตถุดิบทั้งหมด</div>
      <div class="stat-value">${materials.length}</div><div class="stat-sub">รายการ</div></div>`;

  const rows=materials.map(m=>{
    const unit=m.unit||'?';
    const buyTxt=(m.buy_qty&&m.buy_total)
      ? `${(+m.buy_qty).toLocaleString('th-TH')} ${esc(unit)} · <b>${fmtB(m.buy_total)}</b> ฿`
      : `<span class="muted">–</span>`;
    const opts=unitOptionsFor(m);
    const initUnit=opts[0];
    const initUsed=unitsUsed(1,initUnit,m.unit);
    const initCost=(+m.price||0)*((initUsed==null)?1:initUsed);
    const optHtml=opts.map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join('');
    return `<tr data-mat="${m.id}">
      <td class="mat-nm"><div class="mat-nmwrap"><div class="nm">${esc(m.name)}</div>${m.shop?`<div class="sub">${esc(m.shop)}</div>`:''}</div></td>
      <td class="buy-last">${buyTxt}</td>
      <td class="mat-pr"><input type="number" step="0.01" class="price-input" value="${(+m.price).toFixed(2)}" onchange="updateMatPrice('${m.id}',this.value)"><span class="u">฿/${esc(unit)}</span></td>
      <td class="buy-calc">
        <input type="number" class="calc-qty num" value="1" step="0.001" min="0" oninput="calcBuyCost(this)">
        <select class="calc-unit" onchange="calcBuyCost(this)">${optHtml}</select>
        <span class="calc-eq">=</span>
        <span class="calc-out mono">${fmtB(initCost)}</span><span class="calc-baht">฿</span>
      </td>
      <td class="mat-act"><button class="btn btn-sm" onclick="openMatModal('${m.id}')"><svg><use href="#i-edit"/></svg> อัปเดตซื้อ</button></td>
    </tr>`;
  }).join('');
  wrap.innerHTML=`<div class="bom-table-wrap"><table class="dtable buy-dtable">
    <thead><tr><th>วัตถุดิบ</th><th>ซื้อล่าสุด</th><th>ราคา/หน่วย</th><th>คิดต้นทุน (เลือกหน่วย)</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
function openMatModal(id){
  editingMatId=id||null;
  const m=id?materials.find(x=>x.id===id):null;
  document.getElementById('mat-modal-title').textContent=m?'แก้ไขวัตถุดิบ':'เพิ่มวัตถุดิบ';
  document.getElementById('mf-name').value=m?m.name:'';
  document.getElementById('mf-shop').value=m?(m.shop||''):'';
  document.getElementById('mf-unit').value=m?(m.unit||''):'';
  document.getElementById('mf-buyqty').value=(m&&m.buy_qty)?m.buy_qty:'';
  document.getElementById('mf-buytotal').value=(m&&m.buy_total)?m.buy_total:'';
  document.getElementById('mf-price').value=m?(+m.price).toFixed(2):'';
  document.getElementById('mf-note').value=m?(m.note||''):'';
  updateMatPreview();
  document.getElementById('mat-modal').classList.add('open');
}
function updateMatPreview(){
  const q=parseFloat(document.getElementById('mf-buyqty').value)||0;
  const t=parseFloat(document.getElementById('mf-buytotal').value)||0;
  const unit=document.getElementById('mf-unit').value.trim()||'หน่วย';
  document.getElementById('mf-unit-echo').textContent=unit;
  const hint=document.getElementById('mf-calc-hint');
  const priceVal=parseFloat(document.getElementById('mf-price').value)||0;
  if(q>0&&t>0){
    const p=+(t/q).toFixed(2);
    document.getElementById('mf-price').value=p;
    const perKg=matPerKg(p,unit);
    const bd=perKg!=null?`<div style="margin-top:6px">${portionBreakdown(perKg)}</div>`:'';
    hint.innerHTML=`ซื้อ <b>${q.toLocaleString('th-TH')} ${esc(unit)}</b> รวม <b>${fmtB(t)} ฿</b> → <b style="color:var(--accent)">${fmtB(p)} ฿/${esc(unit)}</b>${bd}`;
  } else {
    const perKg=matPerKg(priceVal,unit);
    if(perKg!=null&&priceVal>0){
      hint.innerHTML=`<b style="color:var(--accent)">${fmtB(perKg)} ฿/kg</b><div style="margin-top:6px">${portionBreakdown(perKg)}</div>`;
    } else {
      hint.textContent='ใส่จำนวนที่ซื้อ + ราคารวม แล้วระบบคำนวณ ฿/หน่วย ให้อัตโนมัติ (หรือกรอกราคา/หน่วยเองก็ได้)';
    }
  }
}
function autoNote(q,t,unit,shop){
  let s='';
  if(q&&t) s='ซื้อ '+q+(unit?' '+unit:'')+' = '+fmtB(t)+'฿';
  if(shop) s=(s?s+' · ':'')+shop;
  return s;
}
async function upsertMaterial(full, legacyNote){
  const run = p => editingMatId ? db.from('materials').update(p).eq('id',editingMatId) : db.from('materials').insert(p);
  let {error}=await run(full);
  if(error && /column|schema cache|could not find|does not exist|find the/i.test(error.message||'')){
    const legacy={name:full.name,unit:full.unit,price:full.price,note:legacyNote};
    ({error}=await run(legacy));
    if(!error) showToast('บันทึกแบบพื้นฐาน — เพิ่มคอลัมน์ใน DB เพื่อเก็บรายละเอียดเต็ม','error');
  }
  if(error){ showToast('บันทึกล้มเหลว: '+error.message,'error'); return false; }
  return true;
}
async function saveMaterial(){
  const name=document.getElementById('mf-name').value.trim();
  if(!name){alert('กรุณากรอกชื่อวัตถุดิบ');return}
  const unit=document.getElementById('mf-unit').value.trim();
  const shop=document.getElementById('mf-shop').value.trim();
  const note=document.getElementById('mf-note').value.trim();
  const buy_qty=parseFloat(document.getElementById('mf-buyqty').value)||null;
  const buy_total=parseFloat(document.getElementById('mf-buytotal').value)||null;
  let price=parseFloat(document.getElementById('mf-price').value)||0;
  if((!price)&&buy_qty&&buy_total) price=+(buy_total/buy_qty).toFixed(2);
  setLoading('mat-save-btn',true);
  const full={name,unit,price,note,shop,buy_qty,buy_total};
  const legacyNote = note || autoNote(buy_qty,buy_total,unit,shop);
  const ok = await upsertMaterial(full, legacyNote);
  setLoading('mat-save-btn',false);
  if(!ok) return;
  closeModal('mat-modal'); await loadMaterials(); renderMaterials(); renderPurchases(); renderProducts(); window.renderShipments&&window.renderShipments();
  showToast(editingMatId?'แก้ไขวัตถุดิบแล้ว':'เพิ่มวัตถุดิบแล้ว');
}
async function updateMatPrice(id,val){ await db.from('materials').update({price:parseFloat(val)||0}).eq('id',id); await loadMaterials(); renderPurchases(); renderProducts(); window.renderShipments&&window.renderShipments(); }
async function delMaterial(id){ if(!confirm('ลบวัตถุดิบนี้?'))return; await db.from('materials').delete().eq('id',id); await loadMaterials(); renderMaterials(); renderPurchases(); renderProducts(); }

/* ============================================================
   PRODUCTS
   ============================================================ */
/* ---- แปลงหน่วยสำหรับคำนวณต้นทุน BOM ----
   จัด unit เป็น 3 ชนิด: น้ำหนัก(w) / ปริมาตร(v) / นับชิ้น(c)
   toBase = แปลงเป็นหน่วยฐาน (กรัม / มล. / ชิ้น) */
function unitInfo(u){
  const s=String(u||'').toLowerCase().trim();
  if(/^(kg|กก|กิโล)/.test(s))            return {cat:'w',toBase:1000};
  if(/^(ขีด)/.test(s))                    return {cat:'w',toBase:100};
  if(/^(g|gram|กรัม|ก\.)/.test(s))        return {cat:'w',toBase:1};
  if(/^(l|ลิตร|ลิ)/.test(s))              return {cat:'v',toBase:1000};
  if(/^(ml|มล|มิลลิ|ซีซี|cc)/.test(s))    return {cat:'v',toBase:1};
  return {cat:'c',toBase:1};   // ชิ้น/อัน/ใบ/ถุง/ออเดอร์ ฯลฯ = นับเป็นชิ้น
}
/* จำนวน "หน่วยของวัตถุดิบ" ที่ถูกใช้ไป (เพื่อคูณกับราคา/หน่วย)
   คืน null ถ้าหน่วยคนละชนิดแปลงไม่ได้ */
function unitsUsed(qty, usageUnit, matUnit){
  const used=+qty||0;
  const U=unitInfo(usageUnit||matUnit), M=unitInfo(matUnit);
  if(U.cat!==M.cat) return null;
  return (used*U.toBase)/M.toBase;
}
function calcItemCost(b){
  const m=materials.find(x=>x.id===b.matId);
  const price=(b.price!=null&&b.price!=='')?(+b.price||0):(m?+m.price||0:0); // ราคาที่กรอกทับ > ราคาวัตถุดิบ
  const matUnit=m?m.unit:b.unit;
  const u=unitsUsed(b.qty, b.unit, matUnit);
  const n=(u==null)?(+b.qty||0):u;          // แปลงไม่ได้ → ใช้จำนวนตรงๆ
  const base=price*n;
  return b.vat?base*1.07:base;
}
function calcProductCost(bom){ return (bom||[]).reduce((s,b)=>s+calcItemCost(b),0); }

async function loadProducts(){
  const {data,error}=await db.from('products').select('*').order('created_at');
  if(error){showToast('โหลดสินค้าล้มเหลว','error');return}
  products=data;
}

function renderProducts(){
  const list=document.getElementById('prod-list');
  if(!products.length){ list.innerHTML=emptyState('i-product','ยังไม่มีสินค้า','กด “เพิ่ม” เพื่อสร้างสูตร BOM'); return; }
  list.innerHTML=products.map(p=>{
    const total=calcProductCost(p.bom);
    const bom=(p.bom||[]);
    const rows=bom.map((b,i)=>{
      const m=materials.find(x=>x.id===b.matId);
      const cost=calcItemCost(b);
      const usageUnit=b.unit||b.label||(m?m.unit:'')||'';
      const priceShown=(b.price!=null&&b.price!=='')?+b.price:(m?+m.price:null);
      const priceUnit=m?(m.unit||'?'):(usageUnit||'?');
      return `<tr>
        <td class="mono" style="text-align:center;color:var(--text-3)">${i+1}</td>
        <td>${m?esc(m.name):'(ลบแล้ว)'}${b.vat?' <span class="chiplet gold">VAT</span>':''}</td>
        <td class="mono" style="text-align:right">${priceShown!=null?fmtB(priceShown):'?'}</td>
        <td style="color:var(--text-2)">฿/${esc(priceUnit)}</td>
        <td class="mono" style="text-align:right">${(+b.qty).toLocaleString('th-TH')}</td>
        <td style="color:var(--text-2)">${esc(usageUnit)}</td>
        <td class="mono pos" style="text-align:right;font-weight:600">${fmtB(cost)}</td>
      </tr>`;
    }).join('');
    const pf=`<span class="pf-letters">
      ${p.lazada_name?`<span class="pf-letter" style="background:var(--plat-lazada)" title="${esc(p.lazada_name)}">L</span>`:''}
      ${p.shopee_name?`<span class="pf-letter" style="background:var(--plat-shopee)" title="${esc(p.shopee_name)}">S</span>`:''}
      ${p.tiktok_name?`<span class="pf-letter" style="background:var(--text-3)" title="${esc(p.tiktok_name)}">T</span>`:''}
    </span>`;
    return `<div class="prod" id="prod-${p.id}">
      <div class="prod-head" onclick="toggleProduct('${p.id}')">
        <span class="prod-chev"><svg><use href="#i-chev"/></svg></span>
        <div class="prod-id">
          <div class="prod-name">${p.name} ${pf}</div>
          <div class="prod-sub">${p.sku?`<span class="chiplet sku">${esc(p.sku)}</span>`:''}<span>${bom.length} วัตถุดิบ</span></div>
        </div>
        <div class="prod-cost"><div class="c">${fmtB(total)} ฿</div><div class="cl">ต้นทุน/ชิ้น</div></div>
        <div class="prod-actions" onclick="event.stopPropagation()">
          <button class="icon-btn" style="width:34px;height:34px" onclick="openEditProd('${p.id}')" title="แก้ไข"><svg style="width:16px;height:16px"><use href="#i-edit"/></svg></button>
          <button class="icon-x" onclick="delProduct('${p.id}')"><svg><use href="#i-x"/></svg></button>
        </div>
      </div>
      <div class="prod-body" id="body-${p.id}" style="max-height:2000px">
        <div class="bom-table-wrap">
          ${bom.length?`<table class="dtable bom-dtable">
            <thead><tr><th style="width:34px">#</th><th>วัตถุดิบ</th><th style="text-align:right">ราคา</th><th>หน่วย</th><th style="text-align:right">จำนวนใช้</th><th>หน่วยใช้</th><th style="text-align:right">ต้นทุน</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td colspan="6" style="text-align:right;font-weight:600">รวมต้นทุนต่อชิ้น/ออเดอร์</td><td class="mono" style="text-align:right;font-weight:700;color:var(--accent)">${fmtB(total)} ฿</td></tr></tfoot>
          </table>`:'<div class="bd" style="padding:14px 16px;color:var(--text-3)">ไม่มีวัตถุดิบ</div>'}
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleProduct(id){ document.getElementById('prod-'+id).classList.toggle('collapsed'); }

function openProdModal(){
  editingProdId=null;
  document.getElementById('prod-modal-title').textContent='เพิ่มสินค้าสำเร็จรูป';
  ['pf-name','pf-sku','pf-lazada','pf-shopee','pf-tiktok'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('bom-rows').innerHTML=''; addBOMRow();
  document.getElementById('prod-modal').classList.add('open');
}
function openEditProd(id){
  editingProdId=id;
  const p=products.find(x=>x.id===id);
  document.getElementById('prod-modal-title').textContent='แก้ไข: '+p.name;
  document.getElementById('pf-name').value=p.name;
  document.getElementById('pf-sku').value=p.sku||'';
  document.getElementById('pf-lazada').value=p.lazada_name||'';
  document.getElementById('pf-shopee').value=p.shopee_name||'';
  document.getElementById('pf-tiktok').value=p.tiktok_name||'';
  document.getElementById('bom-rows').innerHTML='';
  (p.bom||[]).forEach(b=>addBOMRow(b));
  document.getElementById('prod-modal').classList.add('open');
}
/* datalist สำหรับพิมพ์ค้นหาวัตถุดิบในสูตร */
function ensureMatDatalist(){
  let dl=document.getElementById('mat-datalist');
  if(!dl){ dl=document.createElement('datalist'); dl.id='mat-datalist'; document.body.appendChild(dl); }
  dl.innerHTML=materials.map(m=>`<option value="${esc(m.name)}">${fmtB(m.price)} ฿/${esc(m.unit||'?')}</option>`).join('');
}
function matByName(name){
  const n=String(name||'').trim().toLowerCase();
  if(!n) return null;
  return materials.find(m=>(m.name||'').trim().toLowerCase()===n)||null;
}
function addBOMRow(data){
  ensureMatDatalist();
  const div=document.createElement('div');
  div.className='bom-edit-row';
  const m0 = (data&&data.matId) ? materials.find(m=>m.id===data.matId) : null;
  const priceVal = (data&&data.price!=null&&data.price!=='') ? data.price : (m0?(+m0.price||0):'');
  div.innerHTML=`
    <input type="text" class="bom-mat bmat" list="mat-datalist" placeholder="พิมพ์หาวัตถุดิบ…" value="${m0?esc(m0.name):''}" oninput="onBomMatChange(this)" autocomplete="off">
    <input type="number" class="bom-price num" placeholder="ราคา" step="0.01" value="${priceVal}" style="text-align:right" oninput="updateBomTotal()">
    <input type="number" class="bom-qty num" placeholder="จำนวน" step="0.001" value="${data?data.qty:''}" style="text-align:right" oninput="updateBomTotal()">
    <input type="text" class="bom-unit" placeholder="หน่วยที่ใช้" value="${data?esc(data.unit||data.label||''):''}" oninput="updateBomTotal()">
    <label class="vcell"><input type="checkbox" class="bom-vat" ${data&&data.vat?'checked':''} onchange="updateBomTotal()"></label>
    <button class="icon-x xcell" onclick="this.closest('.bom-edit-row').remove();updateBomTotal()"><svg><use href="#i-x"/></svg></button>`;
  document.getElementById('bom-rows').appendChild(div);
  const unitInput=div.querySelector('.bom-unit');
  if(!unitInput.value && m0) unitInput.placeholder='เช่น '+(m0.unit||'หน่วย');
  updateBomTotal();
}
/* พิมพ์/เลือกวัตถุดิบ → ถ้าตรงชื่อเป๊ะ เติมราคา+placeholder หน่วยให้ (แก้ได้) */
function onBomMatChange(el){
  const row=el.closest('.bom-edit-row');
  const m=matByName(el.value);
  if(m){
    row.querySelector('.bom-unit').placeholder='เช่น '+(m.unit||'หน่วย');
    row.querySelector('.bom-price').value=+m.price||0;
  }
  updateBomTotal();
}
/* คำนวณต้นทุนรวมสด ๆ ในหน้าต่างแก้ไข */
function updateBomTotal(){
  const rows=document.querySelectorAll('#bom-rows .bom-edit-row');
  let total=0;
  rows.forEach(r=>{
    const m=matByName(r.querySelector('.bom-mat').value);
    total+=calcItemCost({
      matId:m?m.id:null,
      price:r.querySelector('.bom-price').value,
      qty:parseFloat(r.querySelector('.bom-qty').value)||0,
      unit:r.querySelector('.bom-unit').value,
      vat:r.querySelector('.bom-vat').checked
    });
  });
  const el=document.getElementById('bom-total');
  if(el) el.textContent=fmtB(total);
}
async function saveProduct(){
  const name=document.getElementById('pf-name').value.trim();
  if(!name){alert('กรุณากรอกชื่อสินค้า');return}
  const rows=document.querySelectorAll('#bom-rows .bom-edit-row');
  const bom=[];
  let unmatched=0;
  rows.forEach(r=>{
    const matName=r.querySelector('.bom-mat').value.trim();
    const m=matByName(matName);
    const price=parseFloat(r.querySelector('.bom-price').value);
    const qty=parseFloat(r.querySelector('.bom-qty').value)||0;
    const unit=r.querySelector('.bom-unit').value.trim();
    const vat=r.querySelector('.bom-vat').checked;
    if(matName && !m) unmatched++;                       // พิมพ์ชื่อแต่ไม่ตรงวัตถุดิบที่มี
    if(m&&qty>0) bom.push({matId:m.id,price:isNaN(price)?null:price,qty,unit,vat});
  });
  if(unmatched){ alert(`มีวัตถุดิบ ${unmatched} แถวที่พิมพ์ชื่อไม่ตรงกับฐานข้อมูล — เลือกจากรายการที่ขึ้นมาให้ หรือไปเพิ่มวัตถุดิบก่อน`); return; }
  if(!bom.length){alert('กรุณาเพิ่มวัตถุดิบอย่างน้อย 1 รายการ');return}
  setLoading('prod-save-btn',true);
  const sku=document.getElementById('pf-sku').value.trim();
  const lazada_name=document.getElementById('pf-lazada').value.trim();
  const shopee_name=document.getElementById('pf-shopee').value.trim();
  const tiktok_name=document.getElementById('pf-tiktok').value.trim();
  const payload={name,bom,sku,lazada_name,shopee_name,tiktok_name};
  let error;
  if(editingProdId){ ({error}=await db.from('products').update(payload).eq('id',editingProdId)); }
  else { ({error}=await db.from('products').insert(payload)); }
  setLoading('prod-save-btn',false);
  if(error){showToast('บันทึกล้มเหลว: '+error.message,'error');return}
  closeModal('prod-modal'); await loadProducts(); renderProducts(); window.renderShipments&&window.renderShipments();
  showToast(editingProdId?'แก้ไขสินค้าแล้ว':'เพิ่มสินค้าแล้ว');
}
async function delProduct(id){ if(!confirm('ลบสินค้านี้?'))return; await db.from('products').delete().eq('id',id); await loadProducts(); renderProducts(); }

/* ============================================================
   PDF IMPORT (expenses)
   ============================================================ */
let pdfFile=null, slipFile=null, pdfRows=[];

function openPdfModal(){
  pdfFile=null; slipFile=null; pdfRows=[];
  populateMonthSelects();
  document.getElementById('pf-pdf').value=''; document.getElementById('pf-slip').value='';
  document.getElementById('pf-date').value='';
  document.getElementById('pdf-info').innerHTML='<svg><use href="#i-doc"/></svg>คลิก/ลากไฟล์มาวาง';
  document.getElementById('slip-info').innerHTML='<svg><use href="#i-upload"/></svg>คลิก/ลากสลิปมาวาง';
  document.getElementById('slip-preview').style.display='none';
  document.getElementById('pdf-items-wrap').style.display='none';
  document.getElementById('pdf-save-btn').style.display='none';
  document.getElementById('pdf-items').innerHTML='';
  document.getElementById('pdf-modal').classList.add('open');
}
function onPdfPick(){ const f=document.getElementById('pf-pdf').files[0]; if(!f)return; pdfFile=f; document.getElementById('pdf-info').innerHTML='📎 '+f.name+' ('+(f.size/1024).toFixed(0)+' KB)'; }
function onSlipPick(){ const f=document.getElementById('pf-slip').files[0]; if(!f)return; slipFile=f; document.getElementById('slip-info').innerHTML='📎 '+f.name; const img=document.getElementById('slip-preview'); img.src=URL.createObjectURL(f); img.style.display='block'; }

async function pdfToImages(file){
  const buf=await file.arrayBuffer();
  const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
  const images=[]; const pages=Math.min(pdf.numPages,5);
  for(let i=1;i<=pages;i++){
    const page=await pdf.getPage(i);
    const viewport=page.getViewport({scale:3.5});
    const canvas=document.createElement('canvas'); canvas.width=viewport.width; canvas.height=viewport.height;
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    images.push({type:'image',source:{type:'base64',media_type:'image/png',data:canvas.toDataURL('image/png').split(',')[1]}});
  }
  return images;
}
async function fileToImagePart(file){
  const b64=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });
  return {type:'image',source:{type:'base64',media_type:file.type,data:b64}};
}
function computePerKg(qty,total){
  if(!qty||!total) return null;
  const s=String(qty).toLowerCase().replace(/,/g,'');
  const m=s.match(/([\d.]+)\s*(kg|kilo|กิโล|กก|g|gram|กรัม|ก\.|ml|มล|l|ลิตร|ลบ)?/);
  if(!m) return null;
  const n=parseFloat(m[1]); if(!n) return null;
  const u=m[2]||''; let kg=null;
  if(/kg|kilo|กิโล|กก/.test(u)) kg=n;
  else if(/^g|gram|กรัม|ก\./.test(u)) kg=n/1000;
  else if(/^l|ลิตร/.test(u)) kg=n;
  else if(/ml|มล/.test(u)) kg=n/1000;
  if(!kg) return null;
  return +(total/kg).toFixed(2);
}

async function analyzePdf(){
  if(!pdfFile){showToast('กรุณาเลือกไฟล์ใบเสร็จก่อน','error');return}
  const btn=document.getElementById('pdf-analyze-btn');
  btn.disabled=true; btn.textContent='⏳ กำลังแปลงไฟล์...';
  try{
    let imgParts = pdfFile.type==='application/pdf' ? await pdfToImages(pdfFile) : [await fileToImagePart(pdfFile)];
    btn.textContent='⏳ AI กำลังอ่าน...';
    const prompt='นี่คือใบเสร็จ/ใบกำกับภาษีภาษาไทย\n'+
      'สำคัญมาก: ให้คัดลอกข้อความภาษาไทยจากเอกสาร "ตามที่เห็นเป๊ะๆ" ทุกตัวอักษร ห้ามเดา ห้ามแต่ง ห้ามแปลงเป็นคำใกล้เคียง\n'+
      'ถ้าตัวอักษรไม่ชัด ให้ตอบเครื่องหมาย ? ในตำแหน่งนั้น แต่ห้ามแต่งคำใหม่ขึ้นมา\n'+
      'ตัวอย่างคำที่มักอ่านผิด: "กรดกำมะถัน" ไม่ใช่ "กาแฟ", "ไนตริก แอซิด" ไม่ใช่ "โอวัลติน", "กรดเกลือ" ไม่ใช่ "กาแฟ"\n'+
      'ในช่อง qty ให้ดูที่คอลัมน์ "รายละเอียด/Description" เพื่อหาน้ำหนัก เช่น (3x35 kg) = "105 kg", (5x35 kg) = "175 kg"\n'+
      'ตอบเป็น JSON เท่านั้น ห้ามใส่ markdown ห้ามมีข้อความอื่น:\n'+
      'ชื่อร้าน (shop) = ชื่อบริษัท/ร้านผู้ขายที่อยู่ด้านบนสุดของเอกสาร (มักมีคำว่า บริษัท/หจก./ร้าน และมีเลขประจำตัวผู้เสียภาษี) — ห้ามใช้ชื่อ "ลูกค้า/Customer/รหัสลูกค้า/Code" ที่อยู่ในกล่องผู้ซื้อโดยเด็ดขาด\n'+
      '{"shop":"ชื่อบริษัทผู้ขายด้านบน","date":"dd/mm/yy","items":['+
      '{"name":"ชื่อสินค้าตามที่เขียน รวมรายละเอียดในวงเล็บ","qty":"น้ำหนักรวม+หน่วย เช่น 105 kg","total":ราคาจำนวนเงินรวมตัวเลขเท่านั้น}'+
      ']}';
    const resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:4096, messages:[{role:'user',content:[...imgParts,{type:'text',text:prompt}]}] })
    });
    const json=await resp.json();
    if(!resp.ok) throw new Error(json.error?.message||'API error');
    const text=json.content[0].text.trim().replace(/```json|```/g,'').trim();
    const data=JSON.parse(text);
    const shop=data.shop||'';
    const date=document.getElementById('pf-date').value||data.date||'';
    document.getElementById('pf-date').value=date;
    pdfRows=(data.items||[]).map(it=>({ name:it.name||'', shop, qty:it.qty||'', total:+it.total||0, vat:!!it.vat }));
    renderPdfRows();
    document.getElementById('pdf-items-wrap').style.display='block';
    document.getElementById('pdf-save-btn').style.display='inline-flex';
    showToast('อ่านได้ '+pdfRows.length+' รายการ');
  }catch(e){ showToast('วิเคราะห์ไม่สำเร็จ: '+e.message,'error'); }
  finally{ btn.disabled=false; btn.innerHTML='<svg><use href="#i-spark"/></svg> วิเคราะห์ด้วย AI'; }
}

function renderPdfRows(){
  const tb=document.getElementById('pdf-items');
  let grand=0;
  tb.innerHTML=pdfRows.map((r,i)=>{
    const sub=+r.total||0;
    const net=r.vat?+(sub*1.07).toFixed(2):sub;
    const ppk=computePerKg(r.qty,net);
    r.price_per_kg=ppk; r.net_total=net; grand+=net;
    return `<tr>
      <td><input type="text" value="${esc(r.name)}" onchange="pdfRows[${i}].name=this.value" style="min-width:150px"></td>
      <td><input type="text" value="${esc(r.shop)}" onchange="pdfRows[${i}].shop=this.value" style="width:100px"></td>
      <td><input type="text" value="${esc(r.qty)}" onchange="pdfRows[${i}].qty=this.value;renderPdfRows()" style="width:84px"></td>
      <td><input type="number" class="num" value="${sub}" onchange="pdfRows[${i}].total=parseFloat(this.value)||0;renderPdfRows()" style="width:80px;text-align:right"></td>
      <td style="text-align:center"><input type="checkbox" ${r.vat?'checked':''} onchange="pdfRows[${i}].vat=this.checked;renderPdfRows()" style="width:18px;height:18px;accent-color:var(--accent)"></td>
      <td class="mono pos" style="text-align:right;font-weight:600">${fmtB(net)}</td>
      <td class="mono" style="text-align:right;color:var(--blue)">${ppk?fmtB(ppk):'–'}</td>
      <td><button class="icon-x" onclick="pdfRows.splice(${i},1);renderPdfRows()"><svg><use href="#i-x"/></svg></button></td>
    </tr>`;
  }).join('');
  document.getElementById('pdf-grand').textContent=fmtB(grand);
}
function addPdfRow(){ pdfRows.push({name:'',shop:'',qty:'',total:0,vat:false}); renderPdfRows(); }

async function uploadFile(folder,file){
  const ext=(file.name.split('.').pop()||'bin');
  const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`;
  const {error}=await db.storage.from('expense-images').upload(path,file,{cacheControl:'3600',upsert:false});
  if(error) throw error;
  const {data}=db.storage.from('expense-images').getPublicUrl(path);
  return data.publicUrl;
}

async function savePdfRows(){
  const btn=document.getElementById('pdf-save-btn');
  btn.disabled=true; btn.textContent='กำลังบันทึก...';
  try{
    const date=document.getElementById('pf-date').value;
    const month=document.getElementById('pf-month').value;
    let image_url=null, slip_url=null;
    if(pdfFile) image_url=await uploadFile('invoices',pdfFile);
    if(slipFile) slip_url=await uploadFile('slips',slipFile);
    const rows=pdfRows.filter(r=>r.name&&r.total).map(r=>({
      date, month, name:r.name+(r.vat?' (VAT 7%)':''), shop:r.shop, qty:r.qty,
      total:r.vat?+((+r.total||0)*1.07).toFixed(2):(+r.total||0),
      price_per_kg:computePerKg(r.qty, r.vat?(+r.total||0)*1.07:(+r.total||0)),
      image_url, slip_url
    }));
    if(!rows.length){showToast('กรุณาตรวจสอบรายการ','error');return}
    const {error}=await db.from('expenses').insert(rows);
    if(error) throw error;
    closeModal('pdf-modal'); await loadExpenses(); renderExpenses();
    showToast('บันทึก '+rows.length+' รายการแล้ว');
  }catch(e){ showToast('บันทึกล้มเหลว: '+e.message,'error'); }
  finally{ btn.disabled=false; btn.textContent='บันทึกทั้งหมด'; }
}

/* ---------- drag & drop wiring ---------- */
function wireDrop(zoneId, inputId, after){
  const z=document.getElementById(zoneId); if(!z) return;
  z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('dragover')});
  z.addEventListener('dragleave',()=>z.classList.remove('dragover'));
  z.addEventListener('drop',e=>{
    e.preventDefault(); z.classList.remove('dragover');
    const f=e.dataTransfer.files[0]; if(!f) return;
    const dt=new DataTransfer(); dt.items.add(f);
    document.getElementById(inputId).files=dt.files;
    after();
  });
}
wireDrop('img-drop-zone','ef-image',()=>previewImage(document.getElementById('ef-image')));
wireDrop('pdf-drop','pf-pdf',onPdfPick);
wireDrop('slip-drop','pf-slip',onSlipPick);

document.querySelectorAll('.modal-bg').forEach(m=>{ m.addEventListener('click',e=>{ if(e.target===m) m.classList.remove('open'); }); });

/* ---------- Init ---------- */
window.addEventListener('DOMContentLoaded', async ()=>{
  populateMonthSelects();
  await Promise.all([loadExpenses(),loadMaterials(),loadProducts(), window.loadShipments?window.loadShipments():Promise.resolve()]);
  renderDashboard();
});
