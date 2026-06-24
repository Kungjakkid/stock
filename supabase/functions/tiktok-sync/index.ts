// TikTok Shop live sync: ดึง Order API สด → tiktok_status
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const KEY=Deno.env.get("TIKTOK_APP_KEY")!, SECRET=Deno.env.get("TIKTOK_APP_SECRET")!;
const sb=createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const AUTH="https://auth.tiktok-shops.com/api/v2";
const API="https://open-api.tiktokglobalshop.com";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST,OPTIONS"};

const enc=(s:string)=>new TextEncoder().encode(s);
async function hmac(secret:string,msg:string){
  const k=await crypto.subtle.importKey("raw",enc(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const s=await crypto.subtle.sign("HMAC",k,enc(msg));
  return [...new Uint8Array(s)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
// TikTok Shop signature: secret + path + sorted(k+v) + body + secret
async function sign(path:string, query:Record<string,string>, body:string){
  const keys=Object.keys(query).filter(k=>k!=="sign"&&k!=="access_token").sort();
  let base=path; for(const k of keys) base+=k+query[k];
  if(body) base+=body;
  return await hmac(SECRET, SECRET+base+SECRET);
}
async function ttGet(path:string, q:Record<string,string>, access:string){
  const query:Record<string,string>={ app_key:KEY, timestamp:String(Math.floor(Date.now()/1000)), ...q };
  query.sign=await sign(path, query, "");
  const r=await fetch(`${API}${path}?${new URLSearchParams(query)}`,{headers:{"x-tts-access-token":access}});
  return await r.json();
}
async function ttPost(path:string, q:Record<string,string>, body:any, access:string){
  const bodyStr=JSON.stringify(body);
  const query:Record<string,string>={ app_key:KEY, timestamp:String(Math.floor(Date.now()/1000)), ...q };
  query.sign=await sign(path, query, bodyStr);
  const r=await fetch(`${API}${path}?${new URLSearchParams(query)}`,{method:"POST",headers:{"x-tts-access-token":access,"content-type":"application/json"},body:bodyStr});
  return await r.json();
}

Deno.serve(async (req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const { data:tok }=await sb.from("app_tokens").select("*").eq("provider","tiktok").maybeSingle();
    if(!tok?.refresh_token) return Response.json({ok:false,error:"ยังไม่ได้เชื่อม TikTok (ทำ OAuth ก่อน)"},{status:400,headers:cors});
    let access=tok.access_token;
    if(!tok.expires_at || new Date(tok.expires_at).getTime()-Date.now() < 86400000){
      const r=await (await fetch(`${AUTH}/token/refresh?app_key=${KEY}&app_secret=${SECRET}&refresh_token=${tok.refresh_token}&grant_type=refresh_token`)).json();
      const d=r?.data;
      if(d?.access_token){ access=d.access_token;
        await sb.from("app_tokens").update({access_token:d.access_token, refresh_token:d.refresh_token||tok.refresh_token,
          expires_at:new Date(Date.now()+(+d.access_token_expire_in||0)*1000).toISOString(), updated_at:new Date().toISOString()}).eq("provider","tiktok");
      }
    }
    // หา shop_cipher
    const shopsRes=await ttGet("/authorization/202309/shops",{},access);
    const shops=shopsRes?.data?.shops||[];
    if(!shops.length) return Response.json({ok:false,error:"ไม่พบร้าน: "+(shopsRes.message||JSON.stringify(shopsRes)).slice(0,200)},{status:400,headers:cors});
    const days=(await req.json().catch(()=>({})))?.days ?? 10;
    const since=Math.floor((Date.now()-days*86400000)/1000);
    let rows:any[]=[], total=0;
    for(const shop of shops){
      let pageToken="";
      for(let g=0; g<40; g++){
        const q:Record<string,string>={ shop_cipher:shop.cipher, page_size:"50", sort_field:"create_time", sort_order:"DESC" };
        if(pageToken) q.page_token=pageToken;
        const res=await ttPost("/order/202309/orders/search", q, { create_time_ge:since }, access);
        const orders=res?.data?.orders||[];
        for(const o of orders){
          rows.push({ order_id:String(o.id), raw_status:o.status,
            order_date:new Date((+o.create_time||0)*1000).toISOString().slice(0,10), updated_at:new Date().toISOString() });
        }
        total+=orders.length;
        pageToken=res?.data?.next_page_token||"";
        if(!pageToken||!orders.length) break;
      }
    }
    rows=rows.filter(r=>r.order_id);
    for(let i=0;i<rows.length;i+=200) await sb.from("tiktok_status").upsert(rows.slice(i,i+200),{onConflict:"order_id"});
    return Response.json({ ok:true, shops:shops.length, fetched:total, saved:rows.length },{headers:cors});
  }catch(e){ return Response.json({ok:false,error:String(e?.message||e)},{status:500,headers:cors}); }
});
