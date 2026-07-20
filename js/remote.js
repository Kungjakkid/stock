/* ============================================================
   ควบคุมร้าน — Order Manager Remote
   ใช้ Supabase project เดียวกับระบบต้นทุน (รวมมาแล้ว) จึงใช้ client db ร่วมกัน
   ============================================================ */

const RM_POLL_MS = 5000;
const rmdb = typeof db !== 'undefined' ? db : null;

let rmMode = 'normal';
let rmSending = false;     // กันกดปุ่มซ้ำระหว่างส่งคำสั่ง
let rmBusy = false;        // กัน refresh ซ้อนกันตอนเน็ตช้า
let rmSeq = 0;             // กันผลลัพธ์รอบเก่ากลับมาทับข้อมูลใหม่
let rmTimer = null;

const rmEsc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rmAction = v => ({'all-platforms':'ทุกแพลตฟอร์ม',shopee:'Shopee',lazada:'Lazada',tiktok:'TikTok'}[v]||v);
const rmStatus = v => ({queued:'รอ Mac รับงาน',running:'กำลังทำงาน',completed:'เสร็จแล้ว',failed:'ไม่สำเร็จ'}[v]||v);
const rmPlat   = v => ({shopee:'Shopee',lazada:'Lazada',tiktok:'TikTok'}[v]||v);
const rmMoney  = v => Number(v||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const rmTime   = v => {const d=v?new Date(v):null;return d&&!isNaN(d)?d.toLocaleString('th-TH'):'-'};
const rmStatCls= v => ['queued','running','completed','failed'].includes(v)?v:'';

// เขียน DOM เฉพาะตอนเนื้อหาเปลี่ยนจริง กันจอกระพริบ/scroll เด้งตอน poll
function rmSet(id, html){const el=document.getElementById(id); if(el && el.innerHTML!==html) el.innerHTML=html}
function rmTxt(id, text){const el=document.getElementById(id); if(el && el.textContent!==text) el.textContent=text}

function rmSetOnline(text, online){
  const el=document.getElementById('rm-conn'); if(!el) return;
  el.textContent=text;
  el.className='rm-conn '+(online?'on':'off');
}

function rmRenderJobs(jobs){
  if(!jobs || !jobs.length) return emptyState('i-doc','ยังไม่มีคำสั่ง','กดปุ่มด้านบนเพื่อสั่งงาน Mac');
  return `<div class="rm-list">`+jobs.map(j=>`
    <div class="rm-job">
      <div class="rm-job-top">
        <span>${rmEsc(rmAction(j.action))}</span>
        <span class="rm-badge ${rmStatCls(j.status)}">${rmEsc(rmStatus(j.status))}</span>
      </div>
      <div class="rm-job-sub">${rmEsc(rmTime(j.created_at))} · ${j.mode==='all'?'รวบรวมทั้งหมด':'ออเดอร์ใหม่'}</div>
      ${j.message?`<div class="rm-job-sub">${rmEsc(j.message)}</div>`:''}
    </div>`).join('')+`</div>`;
}

function rmRenderFiles(files){
  if(!files || !files.length) return emptyState('i-doc','ยังไม่มีไฟล์จาก Mac','ไฟล์ PDF จะขึ้นที่นี่หลังทำออเดอร์เสร็จ');
  return `<div class="rm-list">`+files.map(f=>`
    <div class="rm-file">
      <div class="rm-file-name">${rmEsc(f.filename)}<span>${(Number(f.size_bytes||0)/1048576).toFixed(1)} MB</span></div>
      <a class="btn" href="${rmEsc(f.download_url)}" target="_blank" rel="noopener"><svg><use href="#i-doc"/></svg> ดาวน์โหลด</a>
    </div>`).join('')+`</div>`;
}

function rmRenderOrders(history, costMap){
  if(!history.length) return emptyState('i-box','ยังไม่มีรายละเอียดที่ซิงก์จาก Mac','สั่งทำออเดอร์แล้วข้อมูลจะซิงก์มาเอง');
  return history.map(day=>`
    <div class="rm-day">
      ${secLabel(rmEsc(day.date), `${rmEsc(day.orders)} ออเดอร์ · ${rmEsc(day.items)} ชิ้น`)}
      ${(day.rows||[]).map(o=>{
        const cost=costMap.get(String(o.order_id));
        const products=(o.products||[]).map(p=>`${rmEsc(p.name||'ไม่ระบุสินค้า')} ×${rmEsc(p.qty||1)}${p.sku?` · SKU ${rmEsc(p.sku)}`:''}`).join('<br>');
        return `<div class="rm-order">
          <div class="rm-order-head">
            <span><span class="chiplet" style="background:var(--plat-${rmEsc(o.platform)});color:#fff">${rmEsc(rmPlat(o.platform))}</span> #${rmEsc(o.order_id)}</span>
            <span class="rm-cost">${cost?.matched?rmMoney(cost.cost)+' ฿':'<span class="rm-nocost">ยังไม่มีต้นทุน</span>'}</span>
          </div>
          <div class="rm-order-items">${products}</div>
        </div>`;
      }).join('')}
    </div>`).join('');
}

async function rmRefresh(){
  if(!rmdb || rmBusy) return false;
  rmBusy = true;
  const seq = ++rmSeq;
  const stale = () => seq !== rmSeq;
  try{
    const {data:device,error:devErr} = await rmdb.from('order_manager_devices')
      .select('id,name,last_seen_at,status_detail').limit(1).maybeSingle();
    if(stale()) return false;

    if(devErr || !device){
      rmSetOnline('ไม่พบ Mac', false);
      rmTxt('rm-detail', devErr ? 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ' : 'ยังไม่เคยเชื่อมต่อ');
      return false;
    }
    const last = device.last_seen_at ? new Date(device.last_seen_at) : null;
    const online = !!last && !isNaN(last) && Date.now()-last.getTime() < 20000;
    rmSetOnline(online?'Mac ออนไลน์':'Mac ออฟไลน์', online);
    rmTxt('rm-state', online?'พร้อมรับคำสั่ง':'ยังติดต่อ Mac ไม่ได้');
    rmTxt('rm-detail', device.status_detail || (last?'ออนไลน์ล่าสุด '+rmTime(device.last_seen_at):'ยังไม่เคยเชื่อมต่อ'));

    const [{data:jobs},{data:files},{data:snap}] = await Promise.all([
      rmdb.from('order_manager_commands').select('*').order('created_at',{ascending:false}).limit(10),
      rmdb.from('order_manager_files').select('*').order('created_at',{ascending:false}),
      rmdb.from('order_manager_snapshots').select('*').limit(1).maybeSingle()
    ]);
    if(stale()) return false;

    rmSet('rm-jobs', rmRenderJobs(jobs));
    rmSet('rm-files', rmRenderFiles(files));
    rmTxt('rm-file-count', (files||[]).length+' ไฟล์');

    const costMap = new Map((snap?.costs?.orders||[]).map(o=>[String(o.orderId), o]));
    const history = Array.isArray(snap?.history) ? snap.history : [];
    rmTxt('rm-order-count', history.reduce((s,d)=>s+Number(d.orders||0),0)+' ออเดอร์');
    rmSet('rm-orders', rmRenderOrders(history, costMap));
    return true;
  }catch(err){
    console.error('remote refresh failed', err);
    if(!stale()){
      rmSetOnline('เชื่อมต่อไม่ได้', false);
      rmTxt('rm-detail','เน็ตหลุดหรือเซิร์ฟเวอร์ไม่ตอบ กำลังลองใหม่…');
    }
    return false;
  }finally{
    rmBusy = false;
  }
}

function rmSetMode(mode, btn){
  rmMode = mode;
  document.querySelectorAll('#rm-mode .chip').forEach(b=>b.classList.toggle('active', b===btn));
}

async function rmSend(action){
  if(!rmdb || rmSending) return;
  rmSending = true;
  document.querySelectorAll('.rm-act').forEach(b=>b.disabled=true);
  try{
    const {error} = await rmdb.rpc('queue_order_manager_command',{requested_action:action, requested_mode:rmMode});
    if(error){ showToast('ส่งคำสั่งไม่สำเร็จ','error'); return; }
    showToast('ส่งคำสั่งไปที่ Mac แล้ว');
    await rmRefresh();
  }catch(err){
    console.error('remote send failed', err);
    showToast('ส่งคำสั่งไม่สำเร็จ','error');
  }finally{
    rmSending = false;
    document.querySelectorAll('.rm-act').forEach(b=>b.disabled=false);
  }
}

// poll เฉพาะตอนอยู่หน้านี้จริงๆ — ไม่กินเน็ต/แบตตอนดูหน้าอื่น
function rmStartPolling(){
  if(!rmdb || rmTimer) return;
  rmTimer = setInterval(()=>{
    if(document.hidden) return;
    if(!document.getElementById('page-remote')?.classList.contains('active')) return;
    rmRefresh();
  }, RM_POLL_MS);
}
function rmStopPolling(){ clearInterval(rmTimer); rmTimer=null; }

function renderRemote(){
  if(!rmdb){
    rmSetOnline('โหลดไม่สำเร็จ', false);
    rmTxt('rm-state','เปิดหน้านี้ไม่ได้');
    rmTxt('rm-detail','โหลดไลบรารี Supabase ไม่สำเร็จ ตรวจสอบสัญญาณแล้วรีเฟรชหน้าใหม่');
    return;
  }
  rmRefresh();
  rmStartPolling();
}

document.addEventListener('visibilitychange', ()=>{
  if(!document.hidden && document.getElementById('page-remote')?.classList.contains('active')) rmRefresh();
});
window.addEventListener('online', ()=>{
  if(document.getElementById('page-remote')?.classList.contains('active')) rmRefresh();
});
