// ดึง line items (สินค้าต่อออเดอร์) จาก DataGlass → เก็บ dg_orders.items
// ใช้: DG_TOKEN=dg_pat_xxx node tools/dg-items.mjs [fromDate] [toDate]
import fs from 'fs';
const TOKEN=process.env.DG_TOKEN; if(!TOKEN){console.error('ตั้ง DG_TOKEN');process.exit(1);}
const FROM=process.argv[2]||null, TO=process.argv[3]||null;
const DGB='https://prod-api.dataglasslabs.com';
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const SB=(app.match(/SUPABASE_URL\s*=\s*'([^']+)'/)||[])[1];
const SK=app.match(/SUPABASE_KEY\s*=\s*([\s\S]*?);/)[1].split('+').map(s=>s.trim().replace(/^'|'$/g,'')).join('');
const SBH={'apikey':SK,'Authorization':'Bearer '+SK,'content-type':'application/json'};

async function dgGet(path){
  for(let a=0;a<6;a++){
    const r=await fetch(DGB+path,{headers:{'Authorization':'Bearer '+TOKEN}});
    const j=await r.json();
    if(j.status==='SUCCESS') return j.data;
    if(/rate limit/i.test(j.message||'')){ await new Promise(x=>setTimeout(x,1500*(a+1))); continue; }
    throw new Error(j.message||r.status);
  }
  throw new Error('rate limit');
}

// ดึง dg_orders ที่ยังไม่มี items
let dateFilter='';
if(FROM&&TO) dateFilter=`&order_date=gte.${FROM}&order_date=lte.${TO}`;
const todo=[];
for(let off=0;;off+=1000){
  const r=await fetch(`${SB}/rest/v1/dg_orders?select=dg_order_key,order_id,platform&items=is.null${dateFilter}&order=order_date.desc&offset=${off}&limit=1000`,{headers:SBH});
  const rows=await r.json(); if(!rows.length) break; todo.push(...rows); if(rows.length<1000) break;
}
console.log('ต้องดึง items:',todo.length,'ออเดอร์');

let done=0;
for(const o of todo){
  try{
    const d=await dgGet('/api/canonical-order-controller/canonical/orders/'+o.dg_order_key);
    const items=(d.lineItems||[]).map(li=>({sku:(li.sellerSku||li.sourceSku||'').trim(), name:li.itemName||li.canonicalProductName||'', qty:+li.quantity||1}));
    await fetch(`${SB}/rest/v1/dg_orders?dg_order_key=eq.${encodeURIComponent(o.dg_order_key)}`,{method:'PATCH',headers:{...SBH,'Prefer':'return=minimal'},body:JSON.stringify({items})});
  }catch(e){ /* ข้ามออเดอร์นี้ */ }
  done++; if(done%50===0) process.stdout.write(`\r${done}/${todo.length}...`);
  await new Promise(x=>setTimeout(x,120));
}
console.log(`\nเสร็จ: ${done} ออเดอร์`);
