// TikTok Shop OAuth callback: รับ ?code → แลก token → เก็บ app_tokens (provider=tiktok)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const KEY=Deno.env.get("TIKTOK_APP_KEY")!, SECRET=Deno.env.get("TIKTOK_APP_SECRET")!;
const sb=createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const html=(m:string)=>new Response(`<html><meta charset=utf8><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>${m}</h2><p>ปิดหน้านี้แล้วกลับไปที่แอปได้เลย</p></body></html>`,{headers:{"content-type":"text/html; charset=utf-8"}});

Deno.serve(async (req)=>{
  const u=new URL(req.url);
  const code=u.searchParams.get("code")||u.searchParams.get("auth_code");
  if(!code) return html("❌ ไม่พบ code (params: "+[...u.searchParams.keys()].join(",")+")");
  try{
    const url=`https://auth.tiktok-shops.com/api/v2/token/get?app_key=${KEY}&app_secret=${SECRET}&auth_code=${encodeURIComponent(code)}&grant_type=authorized_code`;
    const r=await (await fetch(url)).json();
    const d=r?.data;
    if(!d?.access_token) return html("❌ แลก token ไม่สำเร็จ: "+(r.message||JSON.stringify(r)).slice(0,200));
    await sb.from("app_tokens").upsert({
      provider:"tiktok", access_token:d.access_token, refresh_token:d.refresh_token,
      expires_at:new Date(Date.now()+(+d.access_token_expire_in||0)*1000).toISOString(),
      refresh_expires_at:new Date(Date.now()+(+d.refresh_token_expire_in||0)*1000).toISOString(),
      extra:{ seller_name:d.seller_name, open_id:d.open_id }, updated_at:new Date().toISOString()
    },{onConflict:"provider"});
    return html("✅ เชื่อม TikTok Shop สำเร็จ!");
  }catch(e){ return html("❌ error: "+String(e?.message||e)); }
});
