-- 004_dataglass_orders.sql
-- ตารางเก็บข้อมูลออเดอร์จาก DataGlass (สถานะ + การเงินจริง) แยกจาก shipments
-- จับคู่กับ shipments ด้วย (platform, order_id)
-- วิธีรัน: Supabase Dashboard → SQL Editor → New query → วางโค้ดนี้ → Run

create table if not exists dg_orders (
  dg_order_key  text primary key,        -- canonicalOrderId ของ DataGlass (กันซ้ำ)
  platform      text,
  order_id      text,                     -- sourceOrderId = Order ID บนใบปะหน้า
  order_status  text,                     -- สถานะ (READY_TO_SHIP, COMPLETED, CANCELLED, ...)
  order_date    date,
  buyer_paid    numeric,                  -- ราคาลูกค้าจ่าย (totalDiscountedPrice)
  net_revenue   numeric,                  -- ราคาขายได้จริง/สุทธิ (totalOrderRevenue)
  platform_fee  numeric,                  -- ค่าธรรมเนียมแอปหัก (totalOrderFee)
  shipping_fee  numeric,                  -- ค่าส่ง (totalShippingFee)
  dg_cogs       numeric,                  -- ต้นทุนจาก DataGlass (ถ้าตั้งไว้)
  dg_profit     numeric,                  -- กำไรจาก DataGlass
  unit_count    numeric,
  buyer_name    text,
  shop_name     text,
  synced_at     timestamptz default now()
);

create index if not exists idx_dg_orders_lookup on dg_orders (platform, order_id);
create index if not exists idx_dg_orders_date on dg_orders (order_date);

-- เปิดให้อ่าน/เขียนด้วย anon key (เหมือนตารางอื่นในแอป)
alter table dg_orders enable row level security;
do $$ begin
  create policy dg_orders_all on dg_orders for all using (true) with check (true);
exception when duplicate_object then null; end $$;
