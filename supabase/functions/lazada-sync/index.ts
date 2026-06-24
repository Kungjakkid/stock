// Lazada live sync: ดึง Order API สด → อัปเดต lazada_status (สถานะจริงตาม Seller)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const KEY=Deno.env.get("LAZADA_APP_KEY")!, SECRET=Deno.env.get("LAZADA_APP_SECRET")!;
const sb=createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const AUTH="https://auth.lazada.com/rest";
const API="https://api.lazada.co.th/rest";   // TH region
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST,OPTIONS"};

const enc=(s:string)=>new TextEncoder().encode(s);
async function sign(apiPath:string, params:Record<string,string>){
  const base=apiPath+Object.keys(params).sort().map(k=>k+params[k]).join("");
  const key=await crypto.subtle.importKey("raw",enc(SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,enc(base));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
}
async function lzCall(host:string, apiPath:string, extra:Record<string,string>){
  const params:Record<string,string>={ app_key:KEY, sign_method:"sha256", timestamp:String(Date.now()), ...extra };
  params.sign=await sign(apiPath, params);
  return await (await fetch(`${host}${apiPath}?${new URLSearchParams(params)}`)).json();
}

Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const { data:tok }=await sb.from("app_tokens").select("*").eq("provider","lazada").maybeSingle();
    if(!tok?.refresh_token) return Response.json({ok:false,error:"ยังไม่ได้เชื่อม Lazada (ทำ OAuth ก่อน)"},{status:400,headers:cors});
    // refresh ถ้าใกล้หมดอายุ (เหลือ < 1 วัน)
    let access=tok.access_token;
    if(!tok.expires_at || new Date(tok.expires_at).getTime()-Date.now() < 86400000){
      const r=await lzCall(AUTH,"/auth/token/refresh",{ refresh_token:tok.refresh_token });
      if(r.access_token){ access=r.access_token;
        await sb.from("app_tokens").update({access_token:r.access_token, refresh_token:r.refresh_token||tok.refresh_token,
          expires_at:new Date(Date.now()+(+r.expires_in||0)*1000).toISOString(), updated_at:new Date().toISOString()}).eq("provider","lazada");
      }
    }
    const days=(await req.json().catch(()=>({})))?.days ?? 10;
    const after=new Date(Date.now()-days*86400000).toISOString();
    let offset=0, total=0, rows:any[]=[];
    for(let g=0; g<40; g++){
      const r=await lzCall(API,"/orders/get",{ access_token:access, created_after:after, sort_by:"created_at", sort_direction:"DESC", offset:String(offset), limit:"50" });
      const orders=r?.data?.orders||[];
      if(!orders.length) break;
      for(const o of orders){
        const st=(o.statuses&&o.statuses[0])||"";
        rows.push({ order_id:String(o.order_id||o.order_number||""), raw_status:st, order_status:st.toUpperCase(),
          order_date:(o.created_at||"").slice(0,10)||null, updated_at:new Date().toISOString() });
      }
      total+=orders.length; offset+=50;
      if(orders.length<50) break;
    }
    rows=rows.filter(r=>r.order_id);
    for(let i=0;i<rows.length;i+=200) await sb.from("lazada_status").upsert(rows.slice(i,i+200),{onConflict:"order_id"});
    return Response.json({ ok:true, fetched:total, saved:rows.length },{headers:cors});
  }catch(e){ return Response.json({ok:false,error:String(e?.message||e)},{status:500,headers:cors}); }
});
