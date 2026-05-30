-- 003_materials_purchase.sql
-- เพิ่มรายละเอียดการซื้อยกล็อตให้ตาราง materials
-- วิธีรัน: Supabase Dashboard → SQL Editor → New query → วางโค้ดนี้ → Run

alter table materials add column if not exists shop      text    default '';
alter table materials add column if not exists buy_qty   numeric default null;  -- จำนวนที่ซื้อมาทั้งหมด
alter table materials add column if not exists buy_total numeric default null;  -- ราคารวมที่จ่าย

-- หมายเหตุ: ราคา/หน่วย (price) = buy_total / buy_qty โดยแอปคำนวณให้อัตโนมัติ
-- ถ้ายังไม่รันไฟล์นี้ แอปจะยังบันทึกได้ (เก็บรายละเอียดลงช่องหมายเหตุแทน)
