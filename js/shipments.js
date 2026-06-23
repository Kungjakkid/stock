// ===== SHIPMENTS MODULE =====
// Outbound order tracking per platform (Lazada / Shopee / TikTok)
(function(){
  let shipments = [];
  let curPlatform = 'lazada';
  let dateFilter = 'today';
  let shipPdfFiles = [];
  let shipRows = [];

  const PF_COLOR={lazada:'var(--plat-lazada)',shopee:'var(--plat-shopee)',tiktok:'var(--text)'};
  const PF_LABEL={lazada:'Lazada',shopee:'Shopee',tiktok:'TikTok'};

  /* เดาแพลตฟอร์มจากชื่อไฟล์ */
  function detectPlatform(fname){
    const f=String(fname||'').toLowerCase();
    if(/lazada|laz/.test(f)) return 'lazada';
    if(/shopee|shp|spx/.test(f)) return 'shopee';
    if(/tiktok|tik|tt/.test(f)) return 'tiktok';
    return null;
  }
  /* เดาวันที่จากชื่อไฟล์ เช่น 31:5:69, 30-5-69, 1:6:69 (พ.ศ. 2 หลัก) → yyyy-mm-dd */
  function detectDate(fname){
    const m=String(fname||'').match(/(\d{1,2})\s*[:\-\/.]\s*(\d{1,2})\s*[:\-\/.]\s*(\d{2,4})/);
    if(!m) return null;
    let d=+m[1], mo=+m[2], y=+m[3];
    if(y<100) y+=2500;        // 69 → 2569 (พ.ศ.)
    if(y>2400) y-=543;        // พ.ศ. → ค.ศ.
    if(mo<1||mo>12||d<1||d>31) return null;
    const z=n=>String(n).padStart(2,'0');
    return `${y}-${z(mo)}-${z(d)}`;
  }

  async function loadShipments(){
    const {data,error}=await db.from('shipments').select('*').order('ship_date',{ascending:false}).order('created_at',{ascending:false});
    if(error){showToast('โหลดออเดอร์ล้มเหลว','error');return}
    shipments=data;
  }

  function setPlatform(p){
    curPlatform=p;   // คงวันที่ที่เลือกไว้ (ไม่รีเซ็ตกลับวันนี้)
    document.querySelectorAll('#ship-tabs .pf-tab').forEach(b=>b.classList.toggle('active', b.dataset.pf===p));
    renderShipments();
  }
  function setShipDate(v){ dateFilter=v; renderShipments(); }
  /* ส่งออก CSV ของวันที่เลือก (ทุกแพลตฟอร์ม) → เปิดใน Google Sheets/Excel ได้ */
  function exportShipCSV(){
    const today=todayISO();
    const key = dateFilter==='today'?today:dateFilter;
    const list = dateFilter==='all' ? shipments.slice() : shipments.filter(s=>(s.ship_date||'')===key);
    if(!list.length){ showToast('ไม่มีออเดอร์ในวันที่เลือก','error'); return; }
    list.sort((a,b)=>(a.ship_date+a.platform+a.order_id).localeCompare(b.ship_date+b.platform+b.order_id));
    const PFN={lazada:'Lazada',shopee:'Shopee',tiktok:'TikTok'};
    const head=['วันที่','แพลตฟอร์ม','เลขที่ออเดอร์','สินค้า','จำนวน','ต้นทุน','ต้นทุนรวม','ลูกค้า','จังหวัด'];
    const data=list.map(s=>{
      const c=shipCost(s); const q=+s.qty||1; const unit=q?c/q:c;
      return [s.ship_date||'', PFN[s.platform]||s.platform,
        '="'+(s.order_id||'')+'"',          // กัน Sheets แปลงเป็น 1.1E+15
        s.product_name||'', q, unit.toFixed(2), c.toFixed(2), s.recipient||'', s.province||''];
    });
    const esc=x=>{ const v=String(x); return v.startsWith('=')?v:`"${v.replace(/"/g,'""')}"`; };
    const csv=[head,...data].map(r=>r.map(esc).join(',')).join('\r\n');
    const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`ออเดอร์_${dateFilter==='all'?'ทั้งหมด':key}.csv`; document.body.appendChild(a); a.click(); a.remove();
    showToast(`ส่งออก ${list.length} รายการ`);
  }
  /* คลิกจากตารางสรุปรายวัน → ย้อนดูออเดอร์ของวันนั้น (เลือกแพลตฟอร์มได้) */
  function viewShipDay(date, platform){
    if(platform && platform!==curPlatform){
      curPlatform=platform;
      document.querySelectorAll('#ship-tabs .pf-tab').forEach(b=>b.classList.toggle('active', b.dataset.pf===platform));
    }
    dateFilter=date; renderShipments();
    const el=document.getElementById('ship-days');
    if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function todayISO(){ const d=new Date(); const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  function prettyDate(iso){
    const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m) return iso;
    const months=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${+m[3]} ${months[+m[2]]} ${(+m[1])+543-2500}`.replace(' -','');
  }
  function unitCost(productId){ const p=products.find(x=>x.id===productId); return p?calcProductCost(p.bom):0; }
  /* นับ "คำสั่งซื้อ" ตาม Order ID ที่ไม่ซ้ำ — ออเดอร์ที่มีหลายรายการสินค้านับเป็น 1 */
  function orderCount(list){
    const ids=new Set(); let blanks=0;
    list.forEach(s=>{ const id=String(s.order_id||'').trim(); if(id) ids.add(id); else blanks++; });
    return ids.size+blanks;
  }
  /* ต้นทุนสด: คำนวณจากสินค้าที่ผูก (product_id) หรือ match ด้วย SKU ตอนแสดงผล
     → ถ้ากรอกต้นทุน/BOM ทีหลัง ออเดอร์เก่าจะคิดต้นทุนใหม่ให้อัตโนมัติ
     ถ้าหาสินค้าไม่เจอจริง ๆ ค่อย fallback ใช้ค่าที่บันทึกไว้ */
  function shipCost(s){
    const p = s.product_id ? products.find(x=>x.id===s.product_id) : matchProduct(s.sku, s.product_name, s.platform);
    if(p){ const u=calcProductCost(p.bom); if(u>0) return +(u*(+s.qty||0)).toFixed(2); }
    return +s.cost||0;
  }

  /* ภาพรวมรายวัน — นับออเดอร์ทุกแพลตฟอร์มต่อวัน */
  function renderShipOverview(){
    const el=document.getElementById('ship-overview'); if(!el) return;
    if(!shipments.length){ el.innerHTML=''; return; }
    const today=todayISO();
    const byDate={};
    shipments.forEach(s=>{ const d=s.ship_date||'-'; (byDate[d]=byDate[d]||[]).push(s); });
    const dates=Object.keys(byDate).filter(d=>d!=='-').sort().reverse().slice(0,10);
    const PFS=[['lazada','Lazada'],['shopee','Shopee'],['tiktok','TikTok']];
    const tRows=byDate[today]||[];
    const tQty=tRows.reduce((a,s)=>a+(+s.qty||0),0);
    const tCost=tRows.reduce((a,s)=>a+shipCost(s),0);

    let html=`<div class="stat-grid" style="margin-bottom:12px">
      <div class="stat hero"><div class="ico"><svg><use href="#i-ship"/></svg></div>
        <div class="stat-label">วันนี้ · ${prettyDate(today)}</div>
        <div class="stat-value">${orderCount(tRows)}<span class="stat-unit">ออเดอร์</span></div>
        <div class="stat-sub">${tQty} ชิ้น · ต้นทุน ${fmtB(tCost)} ฿</div></div>
      <div class="stat"><div class="stat-label">ออเดอร์ทั้งหมด</div><div class="stat-value">${orderCount(shipments)}</div><div class="stat-sub">${shipments.length} รายการ · ทุกแพลตฟอร์ม</div></div>
    </div>`;

    const rows=dates.map(d=>{
      const list=byDate[d];
      const counts=PFS.map(([k])=>orderCount(list.filter(s=>s.platform===k)));
      const qty=list.reduce((a,s)=>a+(+s.qty||0),0);
      const cost=list.reduce((a,s)=>a+shipCost(s),0);
      const isToday=d===today;
      const isActive=dateFilter===d || (dateFilter==='today'&&isToday);
      return `<tr class="ship-od-row${isToday?' ship-today':''}${isActive?' ship-active':''}" onclick="viewShipDay('${d}')" title="คลิกเพื่อดูออเดอร์วันนี้">
        <td class="ship-od">${prettyDate(d)}${isToday?' <span class="chiplet">วันนี้</span>':''}</td>
        ${counts.map((c,ci)=>`<td class="mono ${c?'ship-pf-cell':''}" style="text-align:right;color:${c?'var(--text)':'var(--text-3)'}" ${c?`onclick="event.stopPropagation();viewShipDay('${d}','${PFS[ci][0]}')" title="ดู ${PFS[ci][1]} วันนี้"`:''}>${c||'–'}</td>`).join('')}
        <td class="mono" style="text-align:right;font-weight:700">${orderCount(list)}</td>
        <td class="mono" style="text-align:right;color:var(--text-2)">${qty}</td>
        <td class="mono pos" style="text-align:right;font-weight:600">${fmtB(cost)}</td>
      </tr>`;
    }).join('');
    html+=secLabel('ภาพรวมรายวัน · ทุกแพลตฟอร์ม', dates.length+' วัน');
    html+=`<div class="bom-table-wrap"><table class="dtable ship-od-table">
      <thead><tr><th>วันที่</th><th style="text-align:right">Lazada</th><th style="text-align:right">Shopee</th><th style="text-align:right">TikTok</th><th style="text-align:right">รวม</th><th style="text-align:right">ชิ้น</th><th style="text-align:right">ต้นทุน ฿</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
    el.innerHTML=html;
  }

  function renderShipments(){
    renderShipOverview();
    const platformList=shipments.filter(s=>s.platform===curPlatform);
    const allDates=[...new Set(platformList.map(s=>s.ship_date||'-'))].sort().reverse();
    const today=todayISO();
    // รวมวันที่กำลังเลือกไว้ด้วย เผื่อสลับแพลตฟอร์มแล้ววันนั้นไม่มีออเดอร์ ปุ่มจะได้ไม่หาย
    const selDate=/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)?dateFilter:null;
    const datesForFilter=[...new Set([today, ...(selDate?[selDate]:[]), ...allDates.filter(d=>d!=='-')])].sort().reverse();

    const mkFBtn=(v,label)=>{
      const list=v==='all'?platformList:platformList.filter(s=>(s.ship_date||'')===v);
      const act = dateFilter===v || (v==='today'&&dateFilter===today);
      return `<button class="chip ${act?'active':''}" onclick="setShipDate('${v}')">${label}<span class="cnt">${orderCount(list)}</span></button>`;
    };
    let fHTML=mkFBtn('today','วันนี้');
    datesForFilter.filter(d=>d!==today).slice(0,7).forEach(d=>fHTML+=mkFBtn(d,prettyDate(d)));
    fHTML+=mkFBtn('all','ทั้งหมด');
    document.getElementById('ship-date-filter').innerHTML=fHTML;

    const filterKey=dateFilter==='today'?today:dateFilter;
    const list=dateFilter==='all'?platformList:platformList.filter(s=>(s.ship_date||'')===filterKey);

    if(!list.length){
      document.getElementById('ship-summary').innerHTML='';
      const msg=dateFilter==='today'
        ? `วันนี้ยังไม่มีออเดอร์ (${prettyDate(today)})`
        : 'ไม่พบออเดอร์ในวันที่เลือก';
      document.getElementById('ship-days').innerHTML=
        `<div class="empty"><div class="eico"><svg><use href="#i-ship"/></svg></div><p>${msg}</p><div class="hint">กด “นำเข้า PDF” เพื่อเพิ่มออเดอร์</div></div>`;
      return;
    }

    const byDate={};
    list.forEach(s=>{ (byDate[s.ship_date||'-']=byDate[s.ship_date||'-']||[]).push(s); });
    const dates=Object.keys(byDate).sort().reverse();
    const grand=list.reduce((s,x)=>s+shipCost(x),0);
    const totalQty=list.reduce((s,x)=>s+(+x.qty||0),0);
    const label=dateFilter==='all'?'ทั้งหมด':(dateFilter==='today'?'วันนี้':prettyDate(filterKey));

    document.getElementById('ship-summary').innerHTML=`
      <div class="stat hero" style="background:linear-gradient(135deg, color-mix(in srgb,${PF_COLOR[curPlatform]} 14%, var(--surface)), var(--surface));border-color:var(--border)">
        <div class="ico" style="background:color-mix(in srgb,${PF_COLOR[curPlatform]} 16%, transparent);color:${PF_COLOR[curPlatform]}"><svg><use href="#i-ship"/></svg></div>
        <div class="stat-label">${label} · ต้นทุนรวม</div>
        <div class="stat-value" style="color:${PF_COLOR[curPlatform]}">${fmtB(grand)}<span class="stat-unit">฿</span></div>
        <div class="stat-sub">${orderCount(list)} ออเดอร์ · ${totalQty} ชิ้น</div>
      </div>
      <div class="stat"><div class="stat-label">ออเดอร์</div><div class="stat-value">${orderCount(list)}</div><div class="stat-sub">${list.length} รายการ</div></div>
      <div class="stat"><div class="stat-label">จำนวนชิ้น</div><div class="stat-value">${totalQty}</div><div class="stat-sub">ชิ้น</div></div>`;

    let html='';
    dates.forEach(d=>{
      const rows=byDate[d];
      const dayCost=rows.reduce((s,x)=>s+shipCost(x),0);
      const dayQty=rows.reduce((s,x)=>s+(+x.qty||0),0);
      html+=secLabel(prettyDate(d)||'ไม่ระบุวันที่', `${orderCount(rows)} ออเดอร์ · ${dayQty} ชิ้น`);
      // จับกลุ่มรายการตาม Order ID → 1 ออเดอร์ = 1 แถว (มีหลายสินค้าได้)
      const ordMap=new Map();
      rows.forEach(s=>{ const k=String(s.order_id||'').trim()||('_'+s.id); if(!ordMap.has(k)) ordMap.set(k,[]); ordMap.get(k).push(s); });
      let idx=0;
      const body=[...ordMap.values()].map(items=>{
        idx++;
        const first=items[0];
        const oCost=items.reduce((a,s)=>a+shipCost(s),0);
        const oQty=items.reduce((a,s)=>a+(+s.qty||0),0);
        const sub=[first.recipient,first.province].filter(Boolean).join(' · ');
        const prodList=items.map(s=>{
          const unmatched=!s.product_id && !matchProduct(s.sku, s.product_name, s.platform);
          return `<div class="ship-prod">
            <span class="chiplet sku">${esc(s.sku)||'-'}</span>
            <span class="pn">${esc(s.product_name)||'(ไม่ระบุสินค้า)'}</span>
            <span class="pq">×${s.qty}</span>
            ${unmatched?'<span class="ship-warn" title="ยังไม่ match สินค้า">⚠</span>':''}
            <button class="icon-x ship-del1" onclick="delShipment('${s.id}')" title="ลบรายการนี้"><svg><use href="#i-x"/></svg></button>
          </div>`;
        }).join('');
        const multi=items.length>1?`<span class="chiplet" style="margin-left:6px;background:var(--accent-soft);color:var(--accent)">${items.length} รายการ</span>`:'';
        return `<tr>
          <td class="mono ship-i">${idx}</td>
          <td class="ship-order">
            <div class="ship-oid2">#${esc(first.order_id)||'<span style="color:var(--red)">ไม่มี ID</span>'}${multi}</div>
            ${sub?`<div class="sub">${esc(sub)}</div>`:''}
            <div class="ship-prods">${prodList}</div>
          </td>
          <td class="mono ship-qty">×${oQty}</td>
          <td class="mono ship-cost ${oCost>0?'pos':'zero'}">${fmtB(oCost)}</td>
        </tr>`;
      }).join('');
      html+=`<div class="bom-table-wrap"><table class="dtable ship-dtable">
        <thead><tr><th class="ship-i">#</th><th>ออเดอร์ / สินค้าที่ขาย</th><th style="text-align:right">จำนวน</th><th style="text-align:right">ต้นทุน ฿</th></tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><td colspan="2" style="text-align:right;font-weight:600">รวม ${prettyDate(d)} · ${orderCount(rows)} ออเดอร์ · ${dayQty} ชิ้น</td><td class="mono" style="text-align:right">×${dayQty}</td><td class="mono" style="text-align:right;font-weight:700;color:var(--accent)">${fmtB(dayCost)}</td></tr></tfoot>
      </table></div>`;
    });
    document.getElementById('ship-days').innerHTML=html;
  }

  async function delShipment(id){
    if(!confirm('ลบออเดอร์นี้?')) return;
    await db.from('shipments').delete().eq('id',id);
    await loadShipments(); renderShipments();
  }

  // ---------- PDF Import ----------
  function openShipPdfModal(){
    shipPdfFiles=[]; shipRows=[];
    document.getElementById('ship-pdf-file').value='';
    document.getElementById('ship-date-input').value=todayISO();
    document.getElementById('ship-pdf-info').innerHTML='<svg><use href="#i-doc"/></svg>คลิก/ลากไฟล์ PDF — เลือกได้หลายไฟล์ ระบบเดาแพลตฟอร์ม+วันจากชื่อไฟล์';
    document.getElementById('ship-items-wrap').style.display='none';
    document.getElementById('ship-save-btn').style.display='none';
    document.getElementById('ship-items').innerHTML='';
    document.getElementById('ship-progress').style.display='none';
    document.getElementById('ship-pdf-title').textContent='นำเข้าออเดอร์จาก PDF';
    document.getElementById('ship-pdf-modal').classList.add('open');
  }
  function showPickedFiles(){
    if(!shipPdfFiles.length){ document.getElementById('ship-pdf-info').innerHTML='<svg><use href="#i-doc"/></svg>คลิก/ลากไฟล์ PDF — เลือกได้หลายไฟล์'; return; }
    const rows=shipPdfFiles.map(f=>{
      const pf=detectPlatform(f.name), dt=detectDate(f.name);
      const pfTxt=pf?`<b style="color:${PF_COLOR[pf]}">${PF_LABEL[pf]}</b>`:'<span style="color:var(--red)">? แพลตฟอร์ม</span>';
      const dTxt=dt?prettyDate(dt):'<span style="color:var(--text-3)">วันตาม default</span>';
      return `<div style="font-size:12px;padding:2px 0">📎 ${esc(f.name)} → ${pfTxt} · ${dTxt}</div>`;
    }).join('');
    document.getElementById('ship-pdf-info').innerHTML=`<div style="text-align:left">${rows}</div>`;
  }
  function addShipFiles(fileList){
    for(const f of fileList){ if(f && f.type==='application/pdf') shipPdfFiles.push(f); }
    showPickedFiles();
  }
  function onShipPdfPick(){
    shipPdfFiles=[];
    addShipFiles(document.getElementById('ship-pdf-file').files);
  }

  const dz=document.getElementById('ship-pdf-drop');
  if(dz){
    dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragover')});
    dz.addEventListener('dragleave',()=>dz.classList.remove('dragover'));
    dz.addEventListener('drop',e=>{
      e.preventDefault(); dz.classList.remove('dragover');
      addShipFiles(e.dataTransfer.files);
    });
  }

  async function renderPdfPagesToImages(file, scale=2.5){
    const buf=await file.arrayBuffer();
    const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
    const out=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const vp=page.getViewport({scale});
      const canvas=document.createElement('canvas'); canvas.width=vp.width; canvas.height=vp.height;
      await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
      out.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:canvas.toDataURL('image/jpeg',0.85).split(',')[1]}});
    }
    return out;
  }

  function platformPrompt(){
    return 'นี่คือใบปะหน้าพัสดุ (shipping label) ภาษาไทย "หน้านี้คือ 1 ออเดอร์เท่านั้น (order_id เดียว)"\n'+
      'สำคัญมาก: บนใบมีหลายเลข เช่น เลขคำสั่งซื้อ/Order ID, เลขพัสดุ/Tracking, เลขใต้บาร์โค้ด — ให้ใช้ "เลขคำสั่งซื้อ/Order ID" อันเดียวเท่านั้น ห้ามแยกเลขพัสดุหรือ barcode เป็นออเดอร์ใหม่ ห้ามคืนหลาย order_id\n'+
      'คืนเป็น JSON array: ปกติ 1 element ต่อหน้า. จะมีหลาย element ได้เฉพาะกรณี "ออเดอร์เดียวกันสั่งหลายสินค้า/หลาย SKU" และทุก element ต้องใช้ order_id เดียวกัน. ห้ามมีข้อความอื่น ห้ามมี markdown:\n'+
      '[{"order_id":"เลขคำสั่งซื้อ/Order ID","sku":"Seller SKU เช่น 0001 0008","product_name":"ชื่อสินค้าเต็มตามที่เขียน","qty":จำนวนตัวเลข,"recipient":"ชื่อผู้รับ","province":"จังหวัดผู้รับ"}]\n'+
      'หลักการ:\n- คัดลอกตัวอักษรไทยตามที่เห็นเป๊ะๆ ห้ามเดา\n- order_id อ่านให้ได้เสมอ ถ้าอ่านไม่ออกใส่ ""\n- ไม่พบ field อื่นใส่ "" หรือ 0\n- ต้องคืนอย่างน้อย 1 element ห้ามคืน array ว่าง\n';
  }

  async function callAI(imgs){
    const text=(await window.geminiVision(imgs, platformPrompt())).replace(/```json|```/g,'').trim();
    let arr; try{ arr=JSON.parse(text); }catch(e){ const m=text.match(/\[[\s\S]*\]/); arr=m?JSON.parse(m[0]):[]; }
    return Array.isArray(arr)?arr:[];
  }

  async function analyzeShipPdf(){
    if(!shipPdfFiles.length){showToast('กรุณาเลือกไฟล์ PDF','error');return}
    const btn=document.getElementById('ship-analyze-btn');
    const prog=document.getElementById('ship-progress');
    btn.disabled=true; btn.textContent='⏳ กำลังแปลงไฟล์...'; prog.style.display='block';
    const fallbackDate=document.getElementById('ship-date-input').value||todayISO();
    try{
      const merged=[]; let totalPages=0; const failedFiles=[]; let failedPages=0;
      for(let fi=0; fi<shipPdfFiles.length; fi++){
        const file=shipPdfFiles[fi];
        const platform=detectPlatform(file.name)||curPlatform;
        const fileDate=detectDate(file.name)||fallbackDate;
        let allImgs;
        try{
          prog.textContent=`(${fi+1}/${shipPdfFiles.length}) แปลง ${file.name}...`;
          allImgs=await renderPdfPagesToImages(file, 2.2);
        }catch(e){ failedFiles.push(file.name); continue; }   // ไฟล์นี้พัง → ข้าม ไม่ล้มทั้งชุด
        const pages=allImgs.length; totalPages+=pages;
        for(let i=0;i<pages;i++){
          prog.textContent=`(${fi+1}/${shipPdfFiles.length}) ${PF_LABEL[platform]} ${prettyDate(fileDate)} หน้า ${i+1}/${pages}...`;
          let arr=[];
          // ลองอ่านสูงสุด 2 รอบ (กัน rate limit ทำให้หน้าตกหล่น)
          for(let t=0;t<2 && !arr.length;t++){
            try{ arr=await callAI([allImgs[i]]); }catch(e){ if(t===0) await new Promise(r=>setTimeout(r,8000)); }
          }
          if(!arr.length){ arr=[{order_id:'',sku:'',product_name:'',qty:1}]; failedPages++; }
          const pageOid=(arr.find(x=>String(x.order_id||'').trim())||{}).order_id||'';
          const seenSku={};
          arr.forEach(it=>{
            const k=String(it.sku||'').trim().toLowerCase()||String(it.product_name||'').trim().toLowerCase()||'_';
            if(seenSku[k]) return; seenSku[k]=1;
            merged.push({...it, order_id:pageOid, platform, ship_date:fileDate, __page:i+1, __file:file.name});
          });
        }
      }
      shipRows=merged.map(it=>{
        const p=matchProduct(it.sku, it.product_name, it.platform);
        const unit=p?calcProductCost(p.bom):0;
        return { order_id:it.order_id||'', sku:String(it.sku||''), product_name:it.product_name||'', qty:+it.qty||1,
          platform:it.platform, ship_date:it.ship_date, recipient:it.recipient||'', province:it.province||'', __page:it.__page,
          product_id:p?p.id:null, unit_cost:unit, cost:+(unit*(+it.qty||1)).toFixed(2) };
      });
      renderShipRows();
      document.getElementById('ship-items-wrap').style.display='block';
      document.getElementById('ship-save-btn').style.display='inline-flex';
      const gotOrders=orderCount(shipRows);
      const noId=shipRows.filter(r=>!String(r.order_id||'').trim()).length;
      const warn=[];
      if(failedFiles.length) warn.push(`เปิดไม่ได้ ${failedFiles.length} ไฟล์: ${failedFiles.join(', ')}`);
      if(failedPages) warn.push(`${failedPages} หน้าอ่านไม่ได้ (อาจติด rate limit — แก้ Order ID แถวแดงเอง หรืออัปไฟล์นั้นซ้ำ)`);
      if(noId) warn.push(`${noId} แถวไม่มี Order ID`);
      if(warn.length){
        showToast(`⚠ อ่านได้ ${gotOrders} ออเดอร์ · ${warn.join(' · ')}`,'error');
      } else {
        showToast(`อ่านได้ครบ ${gotOrders} ออเดอร์ จาก ${shipPdfFiles.length} ไฟล์`);
      }
    }catch(e){ showToast('วิเคราะห์ไม่สำเร็จ: '+e.message,'error'); }
    finally{ btn.disabled=false; btn.innerHTML='<svg><use href="#i-spark"/></svg> วิเคราะห์ด้วย AI'; prog.style.display='none'; }
  }

  function matchProductBySku(sku){
    if(!sku) return null;
    const s=String(sku).trim().toLowerCase();
    return products.find(p=>(p.sku||'').trim().toLowerCase()===s)||null;
  }
  /* normalize ชื่อไทยให้ทนการสะกดเพี้ยนจากใบปะหน้า (โดยเฉพาะ Shopee):
     ำ→า, ตัดวรรณยุกต์/สระบน-ล่าง/พินทุ, ตัดช่องว่าง/อักขระคั่น */
  function normName(s){
    return String(s||'').toLowerCase().replace(/ำ/g,'า').replace(/[ัิ-ฺ็-๎]/g,'').replace(/[\s_·.,()\-]/g,'').trim();
  }
  function lcsLen(a,b){
    let best=0; const n=a.length,m=b.length; let prev=new Array(m+1).fill(0);
    for(let i=1;i<=n;i++){ const cur=new Array(m+1).fill(0);
      for(let j=1;j<=m;j++){ if(a[i-1]===b[j-1]){ cur[j]=prev[j-1]+1; if(cur[j]>best)best=cur[j]; } }
      prev=cur; }
    return best;
  }
  /* match สินค้า: SKU ก่อน → ถ้าไม่มี/ไม่ตรง ใช้ชื่อ (เทียบช่วงต้นชื่อ ตัวระบุสินค้า)
     ใช้กับ Shopee ที่ใบไม่พิมพ์ SKU จึงต้อง match ด้วยชื่อตามแพลตฟอร์ม */
  function matchProduct(sku, name, platform){
    const m=matchProductBySku(sku); if(m) return m;
    const aFull=normName(name); if(aFull.length<4) return null;
    const pf=(platform||'')+'_name';
    // 1) จับคู่แบบเป๊ะจาก alias ที่ผู้ใช้เชื่อมไว้ (ชื่อแพลตฟอร์ม คั่นได้หลายชื่อด้วย |)
    for(const p of products){
      for(const al of String(p[pf]||'').split('|')){
        const b=normName(al); if(b.length<4) continue;
        if(b===aFull || b.slice(0,18)===aFull.slice(0,18)) return p;
      }
    }
    // 2) จับคู่แบบใกล้เคียง (LCS) เทียบช่วงต้นชื่อ
    const a=aFull.slice(0,18); if(a.length<6) return null;
    let best=null,bestScore=0;
    for(const p of products){
      let sc=0;
      for(const c of [p[pf], p.name]){
        for(const al of String(c||'').split('|')){
          const b=normName(al); if(b.length<6) continue;
          const l=lcsLen(a,b); if(l>sc) sc=l;
        }
      }
      if(sc>bestScore){ bestScore=sc; best=p; }
    }
    return bestScore>=8 ? best : null;
  }
  window.matchProduct = matchProduct;
  /* รายการนี้ซ้ำในฐานข้อมูลไหม — เช็ค Order ID + SKU ร่วมกัน
     (ออเดอร์เดียวกันที่มีหลายสินค้า/SKU ต่างกัน = ไม่ซ้ำ, แต่อัปไฟล์เดิมซ้ำ = ซ้ำ) */
  function isDupOrder(orderId, sku, platform){
    const id=String(orderId||'').trim();
    if(!id) return false;
    const sk=String(sku||'').trim().toLowerCase();
    const pf=platform||curPlatform;
    return shipments.some(s=>s.platform===pf && String(s.order_id||'').trim()===id && String(s.sku||'').trim().toLowerCase()===sk);
  }

  function renderShipRows(){
    const tb=document.getElementById('ship-items');
    let grand=0, dupCount=0;
    const seen={};
    tb.innerHTML=shipRows.map((r,i)=>{
      const opts=products.map(p=>`<option value="${p.id}" ${r.product_id===p.id?'selected':''}>${p.name}${p.sku?' ['+p.sku+']':''}</option>`).join('');
      const oid=String(r.order_id||'').trim();
      const pf=r.platform||curPlatform;
      const key=pf+'|'+oid+'|'+String(r.sku||'').trim().toLowerCase();
      const dup=!!oid && (isDupOrder(oid,r.sku,pf) || !!seen[key]);
      if(oid) seen[key]=1;
      if(dup) dupCount++; else grand+=+r.cost||0;
      const cls=dup?'dup':(r.product_id?'matched':'unmatched');
      return `<tr class="${cls}">
        <td style="white-space:nowrap"><span class="chiplet" style="background:${PF_COLOR[pf]};color:#fff;font-size:10px">${PF_LABEL[pf]||pf}</span><div class="muted" style="font-size:10px;margin-top:2px">${r.ship_date?prettyDate(r.ship_date):''}</div></td>
        <td><input type="text" class="mono" value="${esc(r.order_id)}" onchange="shipUpdate(${i},'order_id',this.value);renderShipRows()" style="width:120px" placeholder="${r.__page?'หน้า '+r.__page:''}">${dup?'<span class="dup-badge">ซ้ำ</span>':(!oid?'<span class="dup-badge" style="background:var(--red)">ไม่มี ID</span>':'')}</td>
        <td><input type="text" value="${esc(r.sku)}" onchange="shipUpdate(${i},'sku',this.value);shipAutoMatch(${i})" style="width:64px"></td>
        <td><input type="text" value="${esc(r.product_name)}" onchange="shipUpdate(${i},'product_name',this.value)" style="min-width:130px"></td>
        <td><input type="number" class="num" value="${r.qty}" step="1" onchange="shipUpdate(${i},'qty',parseFloat(this.value)||1);shipRecalc(${i});renderShipRows()" style="width:54px;text-align:right"></td>
        <td><input type="text" value="${esc(r.recipient)}" onchange="shipUpdate(${i},'recipient',this.value)" style="width:90px"></td>
        <td><input type="text" value="${esc(r.province)}" onchange="shipUpdate(${i},'province',this.value)" style="width:84px"></td>
        <td><select onchange="shipUpdate(${i},'product_id',this.value||null);shipRecalc(${i});renderShipRows()" style="min-width:150px"><option value="">— ไม่ match —</option>${opts}</select></td>
        <td class="mono pos" style="text-align:right;font-weight:600">${fmtB(r.cost)}</td>
        <td><button class="icon-x" onclick="shipRowDel(${i})"><svg><use href="#i-x"/></svg></button></td>
      </tr>`;
    }).join('');
    document.getElementById('ship-count').textContent=dupCount?`${shipRows.length-dupCount} (ซ้ำ ${dupCount} จะข้าม)`:shipRows.length;
    document.getElementById('ship-grand').textContent=fmtB(grand);
  }

  function shipUpdate(i,k,v){ shipRows[i][k]=v; }
  function shipAutoMatch(i){ const r=shipRows[i]; const p=matchProduct(r.sku, r.product_name, r.platform||curPlatform); r.product_id=p?p.id:null; shipRecalc(i); renderShipRows(); }
  function shipRecalc(i){ const r=shipRows[i]; const unit=r.product_id?unitCost(r.product_id):0; r.unit_cost=unit; r.cost=+(unit*(+r.qty||0)).toFixed(2); }
  function shipRowDel(i){ shipRows.splice(i,1); renderShipRows(); }

  async function saveShipRows(){
    if(!shipRows.length){showToast('ไม่มีออเดอร์','error');return}
    const btn=document.getElementById('ship-save-btn');
    btn.disabled=true; btn.textContent='กำลังบันทึก...';
    try{
      const seen={}; let dupCount=0;
      const rows=[];
      const noId=shipRows.filter(r=>!String(r.order_id||'').trim()).length;
      if(noId && !confirm(`มี ${noId} แถวที่ไม่มี Order ID จะไม่ถูกบันทึก (จำนวนออเดอร์จะขาด)\nกรอก Order ID ให้ครบก่อนจะดีกว่า — กดตกลงเพื่อบันทึกเฉพาะแถวที่มี ID, ยกเลิกเพื่อกลับไปแก้`)){ btn.disabled=false; btn.textContent='บันทึกทั้งหมด'; return; }
      shipRows.filter(r=>r.order_id).forEach(r=>{
        const oid=String(r.order_id).trim();
        const pf=r.platform||curPlatform;
        const key=pf+'|'+oid+'|'+String(r.sku||'').trim().toLowerCase();
        if(isDupOrder(oid,r.sku,pf) || seen[key]){ dupCount++; return; }   // ข้ามรายการซ้ำ (แพลตฟอร์ม+Order ID+SKU)
        seen[key]=1;
        rows.push({
          platform:pf, order_id:r.order_id, sku:r.sku, product_name:r.product_name,
          product_id:r.product_id, qty:+r.qty||1, ship_date:r.ship_date||todayISO(),
          recipient:r.recipient, province:r.province, cost:+r.cost||0
        });
      });
      if(!rows.length){ showToast(dupCount?`ทุกออเดอร์มีอยู่แล้ว (ซ้ำ ${dupCount})`:'ไม่มีรายการที่บันทึกได้','error'); return; }
      const {error}=await db.from('shipments').insert(rows);
      if(error) throw error;
      closeModal('ship-pdf-modal'); await loadShipments(); renderShipments();
      const nOrders=orderCount(rows);
      showToast(`บันทึก ${nOrders} ออเดอร์ (${rows.length} รายการ)${dupCount?` · ข้ามซ้ำ ${dupCount}`:''}`);
    }catch(e){ showToast('บันทึกล้มเหลว: '+e.message,'error'); }
    finally{ btn.disabled=false; btn.textContent='บันทึกทั้งหมด'; }
  }

  Object.assign(window,{
    loadShipments, renderShipments, setPlatform, setShipDate, viewShipDay, exportShipCSV,
    openShipPdfModal, onShipPdfPick, analyzeShipPdf,
    shipUpdate, shipAutoMatch, shipRecalc, shipRowDel,
    renderShipRows, saveShipRows, delShipment,
    getAllShipments:()=>shipments.map(s=>({...s, cost:shipCost(s)}))
  });
})();
