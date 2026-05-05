import React from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import { calculateCostPerOrder } from '../utils/calculations';

const CostTable = ({ items, onEdit, onDelete }) => {
  return (
    <div className="table-container">
      <table className="cost-table">
        <thead>
          <tr>
            <th>ลำดับ</th>
            <th>รายการ</th>
            <th className="text-right">ราคาต่อหน่วย</th>
            <th>หน่วย</th>
            <th className="text-right">ปริมาณที่ใช้</th>
            <th>หน่วย</th>
            <th className="text-right highlight-col">ต้นทุน/ออเดอร์</th>
            <th className="text-center">จัดการ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const cost = calculateCostPerOrder(item.unitPrice, item.unitType, item.usageQty);
            return (
              <tr key={item.id} className="table-row">
                <td className="text-center text-muted">{index + 1}</td>
                <td className="font-medium">{item.name}</td>
                <td className="text-right">{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="text-sm text-muted">{item.unitType}</td>
                <td className="text-right">{item.usageQty.toLocaleString()}</td>
                <td className="text-sm text-muted">{item.usageUnit}</td>
                <td className="text-right font-bold text-primary highlight-col">
                  ฿{cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="text-center action-cells">
                  <button className="icon-btn edit-btn" onClick={() => onEdit(item)} title="แก้ไข">
                    <Edit2 size={16} />
                  </button>
                  <button className="icon-btn delete-btn" onClick={() => onDelete(item.id)} title="ลบ">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan="8" className="text-center empty-state">
                ไม่มีรายการวัตถุดิบ กรุณาเพิ่มรายการใหม่
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default CostTable;
