// Lazada OAuth callback: รับ ?code → แลก access_token/refresh_token → เก็บ app_tokens
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const KEY=Deno.env.get("LAZADA_APP_KEY")!, SECRET=Deno.env.get("LAZADA_APP_SECRET")!;
const sb=createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const AUTH="https://auth.lazada.com/rest";

const enc=(s:string)=>new TextEncoder().encode(s);
async function sign(apiPath:string, params:Record<string,string>){
  const base=apiPath+Object.keys(params).sort().map(k=>k+params[k]).join("");
  const key=await crypto.subtle.importKey("raw",enc(SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,enc(base));
  return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
}
async function call(apiPath:string, extra:Record<string,string>){
  const params:Record<string,string>={ app_key:KEY, sign_method:"sha256", timestamp:String(Date.now()), ...extra };
  params.sign=await sign(apiPath, params);
  const qs=new URLSearchParams(params).toString();
  return await (await fetch(`${AUTH}${apiPath}?${qs}`)).json();
}
const html=(m:string)=>new Response(`<html><meta charset=utf8><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>${m}</h2><p>ปิดหน้านี้แล้วกลับไปที่แอปได้เลย</p></body></html>`,{headers:{"content-type":"text/html; charset=utf-8"}});

Deno.serve(async (req)=>{
  const code=new URL(req.url).searchParams.get("code");
  if(!code) return html("❌ ไม่พบ code");
  try{
    const r=await call("/auth/token/create",{ code });
    if(!r.access_token) return html("❌ แลก token ไม่สำเร็จ: "+(r.message||JSON.stringify(r)).slice(0,200));
    await sb.from("app_tokens").upsert({
      provider:"lazada", access_token:r.access_token, refresh_token:r.refresh_token,
      expires_at:new Date(Date.now()+(+r.expires_in||0)*1000).toISOString(),
      refresh_expires_at:new Date(Date.now()+(+r.refresh_expires_in||0)*1000).toISOString(),
      extra:r.country_user_info||r.account||{}, updated_at:new Date().toISOString()
    },{onConflict:"provider"});
    return html("✅ เชื่อม Lazada สำเร็จ!");
  }catch(e){ return html("❌ error: "+String(e?.message||e)); }
});
