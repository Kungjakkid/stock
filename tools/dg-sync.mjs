// ดึงออเดอร์จาก DataGlass → upsert เข้า Supabase dg_orders
// ใช้: DG_TOKEN=dg_pat_xxx node tools/dg-sync.mjs 2026-06-01 2026-06-30
import fs from 'fs';
const TOKEN=process.env.DG_TOKEN;
if(!TOKEN){ console.error('ตั้ง DG_TOKEN ก่อน เช่น  DG_TOKEN=dg_pat_xxx node tools/dg-sync.mjs 2026-06-01 2026-06-30'); process.exit(1); }
const FROM=process.argv[2]||'2026-06-01', TO=process.argv[3]||'2026-06-30';
const DGB='https://prod-api.dataglasslabs.com';

const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const SB_URL=(app.match(/SUPABASE_URL\s*=\s*'([^']+)'/)||[])[1];
const SB_KEY=app.match(/SUPABASE_KEY\s*=\s*([\s\S]*?);/)[1].split('+').map(s=>s.trim().replace(/^'|'$/g,'')).join('');

const intDate = s => +s.replace(/-/g,'');                 // 2026-06-01 → 20260601
const toISO = n => { const s=String(n); return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; };

async function fetchOrders(){
  const out=[]; let cur=null, lastId=null;
  for(let guard=0; guard<2000; guard++){
    const body={ fromDate:intDate(FROM), toDate:intDate(TO), pageSize:200 };
    if(cur){ body.cursorCanonicalOrderId=cur.canonicalOrderId; body.cursorCreateTime=cur.createTime; }
    let j;
    for(let attempt=0; attempt<8; attempt++){
      const r=await fetch(`${DGB}/api/canonical-order-controller/canonical/orders/fetch-paginated`,{
        method:'POST', headers:{'Authorization':'Bearer '+TOKEN,'content-type':'application/json'}, body:JSON.stringify(body)});
      j=await r.json();
      if(j.status==='SUCCESS') break;
      if(/rate limit/i.test(j.message||'')){ await new Promise(x=>setTimeout(x, 1500*(attempt+1))); continue; }
      throw new Error('DataGlass: '+(j.message||r.status));
    }
    if(j.status!=='SUCCESS') throw new Error('DataGlass: '+(j.message||'rate limit'));
    await new Promise(x=>setTimeout(x,250));
    const rows=j.data?.data||[]; out.push(...rows);
    const nc=j.data?.nextCursor;
    process.stdout.write(`\rดึงแล้ว ${out.length} ออเดอร์...`);
    if(!rows.length || !nc || !nc.canonicalOrderId || nc.canonicalOrderId===lastId) break;
    lastId=nc.canonicalOrderId; cur=nc;
  }
  console.log('');
  return out;
}

function mapRow(o){
  return {
    dg_order_key:String(o.canonicalOrderId),
    platform:(o.platform==='tiktok_shop'?'tiktok':o.platform), order_id:String(o.sourceOrderId||o.orderNumber||''),
    order_status:o.normalizedStatus||o.orderStatus,
    order_date: o.createDatadate?toISO(o.createDatadate):null,
    buyer_paid:o.totalDiscountedPrice, net_revenue:o.totalOrderRevenue,
    platform_fee:o.totalOrderFee, shipping_fee:o.totalShippingFee,
    dg_cogs:o.totalOrderCogs, dg_profit:o.totalOrderProfit,
    unit_count:o.unitCount, buyer_name:o.buyerName, shop_name:o.sourceShopName
  };
}

async function upsert(rows){
  for(let i=0;i<rows.length;i+=200){
    const chunk=rows.slice(i,i+200);
    const r=await fetch(`${SB_URL}/rest/v1/dg_orders?on_conflict=dg_order_key`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'content-type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(chunk)});
    if(!r.ok){ throw new Error('Supabase upsert '+r.status+': '+await r.text()); }
    process.stdout.write(`\rบันทึกแล้ว ${Math.min(i+200,rows.length)}/${rows.length}...`);
  }
  console.log('');
}

const orders=await fetchOrders();
const rows=orders.map(mapRow).filter(r=>r.order_id);
await upsert(rows);
console.log(`เสร็จ: sync ${rows.length} ออเดอร์ (${FROM} → ${TO})`);
