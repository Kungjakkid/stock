// ===== SHIPMENTS MODULE =====
// Outbound order tracking per platform (Lazada / Shopee / TikTok)
(function(){
  let shipments = [];
  let curPlatform = 'lazada';
  let dateFilter = 'today';
  let shipPdfFile = null;
  let shipRows = [];

  const PF_COLOR={lazada:'var(--plat-lazada)',shopee:'var(--plat-shopee)',tiktok:'var(--text)'};

  async function loadShipments(){
    const {data,error}=await db.from('shipments').select('*').order('ship_date',{ascending:false}).order('created_at',{ascending:false});
    if(error){showToast('โหลดออเดอร์ล้มเหลว','error');return}
    shipments=data;
  }

  function setPlatform(p){
    curPlatform=p; dateFilter='today';
    document.querySelectorAll('#ship-tabs .pf-tab').forEach(b=>b.classList.toggle('active', b.dataset.pf===p));
    renderShipments();
  }
  function setShipDate(v){ dateFilter=v; renderShipments(); }

  function todayISO(){ const d=new Date(); const z=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`; }
  function prettyDate(iso){
    const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m) return iso;
    const months=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${+m[3]} ${months[+m[2]]} ${(+m[1])+543-2500}`.replace(' -','');
  }
  function unitCost(productId){ const p=products.find(x=>x.id===productId); return p?calcProductCost(p.bom):0; }

  function renderShipments(){
    const platformList=shipments.filter(s=>s.platform===curPlatform);
    const allDates=[...new Set(platformList.map(s=>s.ship_date||'-'))].sort().reverse();
    const today=todayISO();
    const datesForFilter=[...new Set([today, ...allDates.filter(d=>d!=='-')])].sort().reverse();

    const mkFBtn=(v,label)=>{
      const list=v==='all'?platformList:platformList.filter(s=>(s.ship_date||'')===v);
      return `<button class="chip ${dateFilter===v?'active':''}" onclick="setShipDate('${v}')">${label}<span class="cnt">${list.length}</span></button>`;
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
    const grand=list.reduce((s,x)=>s+(+x.cost||0),0);
    const totalQty=list.reduce((s,x)=>s+(+x.qty||0),0);
    const label=dateFilter==='all'?'ทั้งหมด':(dateFilter==='today'?'วันนี้':prettyDate(filterKey));

    document.getElementById('ship-summary').innerHTML=`
      <div class="stat hero" style="background:linear-gradient(135deg, color-mix(in srgb,${PF_COLOR[curPlatform]} 14%, var(--surface)), var(--surface));border-color:var(--border)">
        <div class="ico" style="background:color-mix(in srgb,${PF_COLOR[curPlatform]} 16%, transparent);color:${PF_COLOR[curPlatform]}"><svg><use href="#i-ship"/></svg></div>
        <div class="stat-label">${label} · ต้นทุนรวม</div>
        <div class="stat-value" style="color:${PF_COLOR[curPlatform]}">${fmtB(grand)}<span class="stat-unit">฿</span></div>
        <div class="stat-sub">${list.length} ออเดอร์ · ${totalQty} ชิ้น</div>
      </div>
      <div class="stat"><div class="stat-label">ออเดอร์</div><div class="stat-value">${list.length}</div><div class="stat-sub">รายการ</div></div>
      <div class="stat"><div class="stat-label">จำนวนชิ้น</div><div class="stat-value">${totalQty}</div><div class="stat-sub">ชิ้น</div></div>`;

    let html='';
    dates.forEach(d=>{
      const rows=byDate[d];
      const dayCost=rows.reduce((s,x)=>s+(+x.cost||0),0);
      const dayQty=rows.reduce((s,x)=>s+(+x.qty||0),0);
      html+=secLabel(prettyDate(d)||'ไม่ระบุวันที่', `${rows.length} ออเดอร์ · ${dayQty} ชิ้น`);
      html+='<div class="rows">';
      rows.forEach(s=>{
        const meta=[s.recipient,s.province].filter(Boolean).map(x=>`<span>${esc(x)}</span>`).join('<span class="sep">·</span>');
        html+=`<div class="row-card">
          <div class="rc-top">
            <div style="min-width:0">
              <div class="rc-name" style="font-size:14px">${esc(s.product_name)||'(ไม่ระบุสินค้า)'}</div>
              <div class="rc-meta" style="margin-top:5px">
                <span class="chiplet sku">${esc(s.sku)||'-'}</span>
                <span class="mono" style="font-size:11px;color:var(--text-3)">#${esc(s.order_id)}</span>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div class="rc-amt" style="color:var(--accent)">${fmtB(s.cost)} ฿</div>
              <div style="font-size:11px;color:var(--text-3)">×${s.qty}</div>
            </div>
          </div>
          ${meta?`<div class="rc-foot"><div class="rc-meta" style="margin:0">${meta}</div><button class="icon-x" onclick="delShipment('${s.id}')"><svg><use href="#i-x"/></svg></button></div>`
            :`<div class="rc-foot"><span></span><button class="icon-x" onclick="delShipment('${s.id}')"><svg><use href="#i-x"/></svg></button></div>`}
        </div>`;
      });
      html+='</div>';
      html+=`<div class="day-total"><span class="l">รวม ${prettyDate(d)}</span><span class="v">${fmtB(dayCost)} ฿</span></div>`;
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
    shipPdfFile=null; shipRows=[];
    document.getElementById('ship-pdf-file').value='';
    document.getElementById('ship-date-input').value=todayISO();
    document.getElementById('ship-pdf-info').innerHTML='<svg><use href="#i-doc"/></svg>คลิก/ลากไฟล์ PDF ใบปะหน้าพัสดุ';
    document.getElementById('ship-items-wrap').style.display='none';
    document.getElementById('ship-save-btn').style.display='none';
    document.getElementById('ship-items').innerHTML='';
    document.getElementById('ship-progress').style.display='none';
    document.getElementById('ship-pdf-title').textContent='นำเข้าจาก PDF — '+curPlatform.toUpperCase();
    document.getElementById('ship-pdf-modal').classList.add('open');
  }
  function onShipPdfPick(){
    const f=document.getElementById('ship-pdf-file').files[0]; if(!f) return;
    shipPdfFile=f;
    document.getElementById('ship-pdf-info').innerHTML='📎 '+f.name+' ('+(f.size/1024).toFixed(0)+' KB)';
  }

  const dz=document.getElementById('ship-pdf-drop');
  if(dz){
    dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragover')});
    dz.addEventListener('dragleave',()=>dz.classList.remove('dragover'));
    dz.addEventListener('drop',e=>{
      e.preventDefault(); dz.classList.remove('dragover');
      const f=e.dataTransfer.files[0]; if(!f) return;
      const dt=new DataTransfer(); dt.items.add(f);
      document.getElementById('ship-pdf-file').files=dt.files; onShipPdfPick();
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
    return 'คุณกำลังอ่านใบปะหน้าพัสดุ (shipping label) ภาษาไทย หลายออเดอร์ในไฟล์เดียว (1 หน้า = 1 ออเดอร์)\n'+
      'ดึงข้อมูลทุกออเดอร์ออกมาเป็น JSON array เท่านั้น ห้ามมีข้อความอื่น ห้ามมี markdown:\n'+
      '[{"order_id":"เลข Order ID","sku":"Seller SKU เช่น 0001 0008","product_name":"ชื่อสินค้าเต็มตามที่เขียน","qty":จำนวนตัวเลข,"ship_date":"yyyy-mm-dd","recipient":"ชื่อผู้รับ","province":"จังหวัดผู้รับ"}]\n'+
      'หลักการ:\n- คัดลอกตัวอักษรไทยตามที่เห็นเป๊ะๆ ห้ามเดา ห้ามแต่งคำใหม่\n- ถ้าไม่พบ field ให้ใส่ "" หรือ 0 ห้ามข้าม\n- ทุกออเดอร์ในไฟล์ต้องอยู่ใน array (สำคัญมาก ถ้ามี 13 ออเดอร์ ต้องคืน 13 elements)\n';
  }

  async function analyzeShipPdf(){
    if(!shipPdfFile){showToast('กรุณาเลือกไฟล์ PDF','error');return}
    const btn=document.getElementById('ship-analyze-btn');
    const prog=document.getElementById('ship-progress');
    btn.disabled=true; btn.textContent='⏳ กำลังแปลงไฟล์...'; prog.style.display='block';
    try{
      prog.textContent='แปลง PDF เป็นรูป...';
      const allImgs=await renderPdfPagesToImages(shipPdfFile, 2.2);
      const BATCH=5; let merged=[];
      for(let i=0;i<allImgs.length;i+=BATCH){
        const chunk=allImgs.slice(i,i+BATCH);
        prog.textContent=`AI กำลังอ่าน ${i+1}–${Math.min(i+BATCH,allImgs.length)}/${allImgs.length} หน้า...`;
        const resp=await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{'x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
          body:JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:4096, messages:[{role:'user',content:[...chunk,{type:'text',text:platformPrompt()}]}] })
        });
        const json=await resp.json();
        if(!resp.ok) throw new Error(json.error?.message||'API error');
        const text=json.content[0].text.trim().replace(/```json|```/g,'').trim();
        let arr; try{ arr=JSON.parse(text); }catch(e){ const m=text.match(/\[[\s\S]*\]/); arr=m?JSON.parse(m[0]):[]; }
        if(Array.isArray(arr)) merged=merged.concat(arr);
      }
      const fileDate=document.getElementById('ship-date-input').value||todayISO();
      shipRows=merged.map(it=>{
        const p=matchProductBySku(it.sku);
        const unit=p?calcProductCost(p.bom):0;
        return { order_id:it.order_id||'', sku:String(it.sku||''), product_name:it.product_name||'', qty:+it.qty||1,
          ship_date:fileDate, recipient:it.recipient||'', province:it.province||'',
          product_id:p?p.id:null, unit_cost:unit, cost:+(unit*(+it.qty||1)).toFixed(2) };
      });
      renderShipRows();
      document.getElementById('ship-items-wrap').style.display='block';
      document.getElementById('ship-save-btn').style.display='inline-flex';
      showToast('อ่านได้ '+shipRows.length+' ออเดอร์');
    }catch(e){ showToast('วิเคราะห์ไม่สำเร็จ: '+e.message,'error'); }
    finally{ btn.disabled=false; btn.innerHTML='<svg><use href="#i-spark"/></svg> วิเคราะห์ด้วย AI'; prog.style.display='none'; }
  }

  function matchProductBySku(sku){
    if(!sku) return null;
    const s=String(sku).trim().toLowerCase();
    return products.find(p=>(p.sku||'').trim().toLowerCase()===s)||null;
  }

  function renderShipRows(){
    const tb=document.getElementById('ship-items');
    let grand=0;
    tb.innerHTML=shipRows.map((r,i)=>{
      const opts=products.map(p=>`<option value="${p.id}" ${r.product_id===p.id?'selected':''}>${p.name}${p.sku?' ['+p.sku+']':''}</option>`).join('');
      grand+=+r.cost||0;
      const cls=r.product_id?'matched':'unmatched';
      return `<tr class="${cls}">
        <td><input type="text" class="mono" value="${esc(r.order_id)}" onchange="shipUpdate(${i},'order_id',this.value)" style="width:130px"></td>
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
    document.getElementById('ship-count').textContent=shipRows.length;
    document.getElementById('ship-grand').textContent=fmtB(grand);
  }

  function shipUpdate(i,k,v){ shipRows[i][k]=v; }
  function shipAutoMatch(i){ const r=shipRows[i]; const p=matchProductBySku(r.sku); r.product_id=p?p.id:null; shipRecalc(i); renderShipRows(); }
  function shipRecalc(i){ const r=shipRows[i]; const unit=r.product_id?unitCost(r.product_id):0; r.unit_cost=unit; r.cost=+(unit*(+r.qty||0)).toFixed(2); }
  function shipRowDel(i){ shipRows.splice(i,1); renderShipRows(); }

  async function saveShipRows(){
    if(!shipRows.length){showToast('ไม่มีออเดอร์','error');return}
    const btn=document.getElementById('ship-save-btn');
    btn.disabled=true; btn.textContent='กำลังบันทึก...';
    try{
      const rows=shipRows.filter(r=>r.order_id).map(r=>({
        platform:curPlatform, order_id:r.order_id, sku:r.sku, product_name:r.product_name,
        product_id:r.product_id, qty:+r.qty||1, ship_date:r.ship_date,
        recipient:r.recipient, province:r.province, cost:+r.cost||0
      }));
      if(!rows.length){showToast('ไม่มีรายการที่บันทึกได้','error');return}
      const {error}=await db.from('shipments').insert(rows);
      if(error) throw error;
      closeModal('ship-pdf-modal'); await loadShipments(); renderShipments();
      showToast('บันทึก '+rows.length+' ออเดอร์แล้ว');
    }catch(e){ showToast('บันทึกล้มเหลว: '+e.message,'error'); }
    finally{ btn.disabled=false; btn.textContent='บันทึกทั้งหมด'; }
  }

  Object.assign(window,{
    loadShipments, renderShipments, setPlatform, setShipDate,
    openShipPdfModal, onShipPdfPick, analyzeShipPdf,
    shipUpdate, shipAutoMatch, shipRecalc, shipRowDel,
    renderShipRows, saveShipRows, delShipment,
    getAllShipments:()=>shipments
  });
})();
