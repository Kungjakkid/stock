// Supabase Edge Function: dg-sync
// ปุ่ม "Sync ตอนนี้" ในแอป → ฟังก์ชันนี้ดึงจาก DataGlass (token ฝั่งเซิร์ฟเวอร์) → upsert dg_orders
// ตั้ง secrets: DG_TOKEN, (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY มีให้อัตโนมัติ)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DG = "https://prod-api.dataglasslabs.com";
const TOKEN = Deno.env.get("DG_TOKEN")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*, authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST,OPTIONS" };

const intDate = (d: Date) => +`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
const toISO = (n:number) => { const s=String(n); return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; };
const roundISO = (datadate:number, hour:number) => { if(!datadate) return null; const y=Math.floor(datadate/10000), m=Math.floor(datadate/100)%100, d=datadate%100; let dt=new Date(Date.UTC(y,m-1,d)); if((+hour||0)>=12) dt=new Date(dt.getTime()+86400000); return dt.toISOString().slice(0,10); };
const pf = (p:string) => p==="tiktok_shop" ? "tiktok" : p;

async function dgPost(path:string, body:unknown){
  for(let a=0;a<6;a++){
    const r=await fetch(DG+path,{method:"POST",headers:{Authorization:"Bearer "+TOKEN,"content-type":"application/json"},body:JSON.stringify(body)});
    const j=await r.json();
    if(j.status==="SUCCESS") return j.data;
    if(/rate limit/i.test(j.message||"")){ await new Promise(x=>setTimeout(x,1200*(a+1))); continue; }
    throw new Error(j.message||("HTTP "+r.status));
  }
  throw new Error("rate limit");
}
async function dgGet(path:string){
  for(let a=0;a<6;a++){
    const r=await fetch(DG+path,{headers:{Authorization:"Bearer "+TOKEN}});
    const j=await r.json();
    if(j.status==="SUCCESS") return j.data;
    if(/rate limit/i.test(j.message||"")){ await new Promise(x=>setTimeout(x,1200*(a+1))); continue; }
    throw new Error(j.message||("HTTP "+r.status));
  }
  throw new Error("rate limit");
}

Deno.serve(async (req) => {
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const days = (await req.json().catch(()=>({})))?.days ?? 35;
    const to=new Date(), from=new Date(Date.now()-days*86400000);
    // 1) ดึงเฉพาะออเดอร์ช่วงล่าสุด (ผลเรียงใหม่→เก่า หยุดเมื่อเกินช่วงวัน → เร็ว)
    const fromInt=intDate(from);
    let cur:any=null, lastId=null, fetched=0;
    for(let g=0; g<200; g++){
      const body:any={ pageSize:200 };
      if(cur){ body.cursorCanonicalOrderId=cur.canonicalOrderId; body.cursorCreateTime=cur.createTime; }
      const d=await dgPost("/api/canonical-order-controller/canonical/orders/fetch-paginated", body);
      const rows=d?.data||[]; if(!rows.length) break;
      const inRange=rows.filter((o:any)=>(o.createDatadate||0)>=fromInt);
      const recs=inRange.map((o:any)=>({
        dg_order_key:String(o.canonicalOrderId), platform:pf(o.platform), order_id:String(o.sourceOrderId||o.orderNumber||""),
        order_status:o.normalizedStatus||o.orderStatus, order_date:o.createDatadate?toISO(o.createDatadate):null, round_date:roundISO(o.createDatadate,o.createDatahour),
        buyer_paid:o.totalDiscountedPrice, net_revenue:o.totalOrderRevenue, platform_fee:o.totalOrderFee, shipping_fee:o.totalShippingFee,
        dg_cogs:o.totalOrderCogs, dg_profit:o.totalOrderProfit, unit_count:o.unitCount, buyer_name:o.buyerName, shop_name:o.sourceShopName
      })).filter((r:any)=>r.order_id);
      if(recs.length) await sb.from("dg_orders").upsert(recs,{onConflict:"dg_order_key"});
      fetched+=recs.length;
      // ถึงออเดอร์ที่เก่ากว่าช่วงแล้ว → หยุด
      const oldest=rows[rows.length-1]?.createDatadate||0;
      if(oldest<fromInt) break;
      const nc=d?.nextCursor; if(!nc?.canonicalOrderId || nc.canonicalOrderId===lastId) break; lastId=nc.canonicalOrderId; cur=nc;
    }
    // 2) เติม items ให้ออเดอร์ที่ยังไม่มี (จำกัดต่อรอบ กันหมดเวลา)
    const { data: need } = await sb.from("dg_orders").select("dg_order_key").is("items",null).order("order_date",{ascending:false}).limit(50);
    let itemsFilled=0;
    for(const o of (need||[])){
      try{
        const det=await dgGet("/api/canonical-order-controller/canonical/orders/"+o.dg_order_key);
        const items=(det.lineItems||[]).map((li:any)=>({ sku:(li.sellerSku||li.sourceSku||"").trim(), name:li.itemName||li.canonicalProductName||"", qty:+li.quantity||1 }));
        await sb.from("dg_orders").update({items}).eq("dg_order_key",o.dg_order_key);
        itemsFilled++;
      }catch(_){}
    }
    return Response.json({ ok:true, ordersSynced:fetched, itemsFilled, itemsRemaining:(need?.length||0)-itemsFilled }, {headers:cors});
  }catch(e){
    return Response.json({ ok:false, error:String(e?.message||e) }, {status:500, headers:cors});
  }
});
