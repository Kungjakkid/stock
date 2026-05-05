import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import '../index.css';

const EditModal = ({ isOpen, onClose, item, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    unitPrice: 0,
    unitType: '',
    usageQty: 0,
    usageUnit: ''
  });

  useEffect(() => {
    if (item) {
      setFormData({ ...item });
    } else {
      setFormData({
        name: '',
        unitPrice: 0,
        unitType: 'บาท/ชิ้น',
        usageQty: 0,
        usageUnit: 'ชิ้น'
      });
    }
  }, [item, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'unitPrice' || name === 'usageQty' ? Number(value) : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{item ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}</h2>
          <button className="icon-btn close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>รายการ</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} required />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>ราคาต่อหน่วย</label>
              <input type="number" name="unitPrice" value={formData.unitPrice} onChange={handleChange} step="0.01" min="0" required />
            </div>
            <div className="form-group">
              <label>หน่วยราคา</label>
              <select name="unitType" value={formData.unitType} onChange={handleChange}>
                <option value="บาท/กิโลกรัม">บาท/กิโลกรัม</option>
                <option value="บาท/ลิตร">บาท/ลิตร</option>
                <option value="บาท/ชิ้น">บาท/ชิ้น</option>
                <option value="บาท/ออเดอร์">บาท/ออเดอร์</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>ปริมาณที่ใช้</label>
              <input type="number" name="usageQty" value={formData.usageQty} onChange={handleChange} step="0.01" min="0" required />
            </div>
            <div className="form-group">
              <label>หน่วยปริมาณ</label>
              <input type="text" name="usageUnit" value={formData.usageUnit} onChange={handleChange} placeholder="เช่น กรัม, มิลลิลิตร, ใบ" />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>ยกเลิก</button>
            <button type="submit" className="btn-primary">บันทึก</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditModal;
