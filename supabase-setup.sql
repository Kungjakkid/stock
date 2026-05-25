-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null default '',
  price numeric not null default 0,
  note text default '',
  created_at timestamptz default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  date text not null default '',
  month text not null default '',
  name text not null,
  shop text default '',
  qty text default '',
  total numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bom jsonb not null default '[]',
  created_at timestamptz default now()
);

-- Enable Row Level Security (allow public read/write via anon key)
alter table materials enable row level security;
alter table expenses enable row level security;
alter table products enable row level security;

create policy "public all" on materials for all using (true) with check (true);
create policy "public all" on expenses for all using (true) with check (true);
create policy "public all" on products for all using (true) with check (true);

-- Seed initial materials data
insert into materials (name, unit, price, note) values
  ('ไนตริก แอซิด (เกาหลี)', 'kg', 25.00, 'KS เคมิคอลส์'),
  ('กรดเกลือ 35%', 'kg', 12.00, 'KS เคมิคอลส์'),
  ('โซดาไฟเกล็ด (อาซาฮี)', 'kg', 30.00, 'KS เคมิคอลส์'),
  ('กรดกำมะถัน 98%', 'kg', 17.00, 'KS เคมิคอลส์'),
  ('โซเดียม เมตา ไบซัลไฟท์', 'kg', 25.00, 'KS เคมิคอลส์'),
  ('ปุ๋ยยูเรีย 46-0-0', 'kg', 31.40, 'TPK_Online'),
  ('KCN', 'kg', 360.00, 'นาย มานิตย์'),
  ('SG9', 'kg', 1412.40, 'พาต้าเคมีฯ'),
  ('ไฮโดรเจนเปอร์ออกไซด์ 50%', 'kg', 28.57, '35kg/ถัง=1,000฿'),
  ('ซิงค์เพาเตอร์-4', 'ถุง', 203.30, 'พลวัต อินเตอร์เคม'),
  ('โพลิเมอ', 'kg', 200.00, '1kg×3ถุง=600฿'),
  ('บอแร็ก', 'ครั้ง', 5.00, 'คงที่/ครั้ง'),
  ('แกลอน 1 ลิตร', 'ใบ', 16.00, 'LONG SAVE'),
  ('แกลอน 3 ลิตร', 'ใบ', 32.00, 'LONG SAVE'),
  ('ขวดยาน้ำ 180cc', 'ใบ', 5.00, 'CatWaterGlass'),
  ('ขวดแก้วสีชา 30cc', 'ใบ', 4.00, 'CatWaterGlass'),
  ('ซิลิกาควอตซ์ (เบ้าหลอม)', 'ชิ้น', 29.00, 'HomeJoy.th'),
  ('ถุงซิบ 20×30 ซม.', 'ใบ', 1.00, ''),
  ('ถุงซิบ 15×25 ซม.', 'ใบ', 1.00, ''),
  ('กล่อง 2B แกม THANK', 'ใบ', 4.47, 'BY ล้านลัง'),
  ('กล่อง AB แกม THANK', 'ใบ', 2.53, 'BY ล้านลัง'),
  ('กล่อง B แกม THANK', 'ใบ', 3.28, 'BY ล้านลัง');
