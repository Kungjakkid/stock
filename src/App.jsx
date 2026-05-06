import React, { useState, useEffect } from 'react';
import { Plus, Package, Database, Trash2, Layers, ChevronRight, Calculator, Archive, Save, RefreshCw, ArrowLeft } from 'lucide-react';
import { supabase } from './supabaseClient';
import { calculateFinishedCost, calculateSemiFinishedCost, calculateItemCost } from './utils/calculations';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('finished'); // 'finished', 'semifinished', 'materials', 'finance'
  const [materials, setMaterials] = useState([]);
  const [semiFinished, setSemiFinished] = useState([]);
  const [finished, setFinished] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Materials
      const { data: mats } = await supabase.from('materials').select('*').order('name');
      setMaterials(mats || []);

      // 2. Fetch Semi-Finished with BOM
      const { data: sfData } = await supabase.from('semi_finished').select('*, semi_finished_bom(*)');
      const formattedSF = sfData?.map(sf => ({
        id: sf.id,
        name: sf.name,
        items: sf.semi_finished_bom.map(b => ({ materialId: b.material_id, usageQty: b.usage_qty }))
      })) || [];
      setSemiFinished(formattedSF);

      // 3. Fetch Finished with BOM
      const { data: fData } = await supabase.from('finished_products').select('*, finished_bom(*)');
      const formattedF = fData?.map(f => ({
        id: f.id,
        name: f.name,
        sellingPrice: f.selling_price,
        items: f.finished_bom.map(b => ({ 
          materialId: b.material_id, 
          semiFinishedId: b.sf_id, 
          usageQty: b.usage_qty 
        }))
      })) || [];
      setFinished(formattedF);

      // 4. Fetch Transactions
      const { data: trans } = await supabase.from('transactions').select('*').order('date', { ascending: false });
      setTransactions(trans || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- Handlers for Materials ---
  const handleSaveMaterial = async (m) => {
    const { error } = await supabase.from('materials').upsert({
      id: m.id,
      name: m.name,
      unit_price: m.unit_price,
      unit_type: m.unit_type,
      usage_unit: m.usage_unit,
      purchase_price: m.purchase_price,
      purchase_qty: m.purchase_qty
    });
    if (!error) fetchAllData();
  };

  const handleAddMaterial = async () => {
    const newId = 'm' + Date.now();
    const newMat = { id: newId, name: 'วัตถุดิบใหม่', unit_price: 0, unit_type: 'บาท/ชิ้น', usage_unit: 'ชิ้น' };
    await handleSaveMaterial(newMat);
  };

  const handleDeleteMaterial = async (id) => {
    if (window.confirm('ลบวัตถุดิบนี้?')) {
      await supabase.from('materials').delete().eq('id', id);
      fetchAllData();
    }
  };

  // --- Handlers for Semi-Finished ---
  const handleAddSemiFinished = async () => {
    const newId = 'sf' + Date.now();
    const { error } = await supabase.from('semi_finished').insert({ id: newId, name: 'กึ่งสำเร็จรูปใหม่' });
    if (!error) {
      fetchAllData();
      setSelectedItem({ id: newId, name: 'กึ่งสำเร็จรูปใหม่', items: [] });
    }
  };

  const handleUpdateSFItem = async (sfId, matId, qty) => {
    // 1. Delete existing if exists (to keep it simple for this version)
    await supabase.from('semi_finished_bom').delete().eq('sf_id', sfId).eq('material_id', matId);
    
    // 2. Insert if qty > 0
    if (qty > 0) {
      await supabase.from('semi_finished_bom').insert({
        sf_id: sfId,
        material_id: matId,
        usage_qty: qty
      });
    }
    fetchAllData();
  };

  // --- Handlers for Finished ---
  const handleAddFinished = async () => {
    const newId = 'f' + Date.now();
    const { error } = await supabase.from('finished_products').insert({ id: newId, name: 'สินค้าสำเร็จรูปใหม่', selling_price: 0 });
    if (!error) {
      fetchAllData();
      setSelectedItem({ id: newId, name: 'สินค้าสำเร็จรูปใหม่', sellingPrice: 0, items: [] });
    }
  };

  const handleUpdateFItem = async (fId, refId, qty, type) => {
    const col = type === 'mat' ? 'material_id' : 'sf_id';
    await supabase.from('finished_bom').delete().eq('product_id', fId).eq(col, refId);
    
    if (qty > 0) {
      await supabase.from('finished_bom').insert({
        product_id: fId,
        [col]: refId,
        usage_qty: qty
      });
    }
    fetchAllData();
  };

  const handleUpdateProductName = async (id, name, type) => {
    const table = type === 'finished' ? 'finished_products' : 'semi_finished';
    await supabase.from(table).update({ name }).eq('id', id);
    // Local update for smooth UI
    if (type === 'finished') setFinished(finished.map(f => f.id === id ? { ...f, name } : f));
    else setSemiFinished(semiFinished.map(sf => sf.id === id ? { ...sf, name } : sf));
  };

  const handleUpdateSellingPrice = async (id, price) => {
    await supabase.from('finished_products').update({ selling_price: price }).eq('id', id);
    setFinished(finished.map(f => f.id === id ? { ...f, sellingPrice: price } : f));
  };

  // --- Handlers for Finance ---
  const handleAddTransaction = async (type) => {
    const { data, error } = await supabase.from('transactions').insert({
      type,
      category: type === 'income' ? 'รายรับแอป' : 'รายจ่ายทั่วไป',
      amount: 0,
      note: ''
    }).select();
    if (!error) fetchAllData();
  };

  const handleFileUpload = async (e, transId, field = 'image_url') => {
    const file = e.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${field}-${Math.random()}.${fileExt}`;
    const filePath = `receipts/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(filePath, file);

    if (uploadError) {
      alert('อัปโหลดรูปไม่สำเร็จ: ' + uploadError.message);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(filePath);
    
    await supabase.from('transactions').update({ [field]: publicUrl }).eq('id', transId);
    fetchAllData();
  };

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);

  if (loading && materials.length === 0) {
    return (
      <div className="loading-screen">
        <RefreshCw className="animate-spin" size={48} />
        <p>กำลังเชื่อมต่อฐานข้อมูล Supabase...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-icon"><Calculator size={24} /></div>
            <div>
              <h1>ระบบบริหารต้นทุน & บัญชี</h1>
              <p className="subtitle">Connected to Supabase Database</p>
            </div>
          </div>
        </div>
      </header>

      <div className="tab-navigation">
        <button className={`tab-btn ${activeTab === 'finished' ? 'active' : ''}`} onClick={() => { setActiveTab('finished'); setSelectedItem(null); }}>
          <Package size={20} /> 
          <span>สินค้าสำเร็จรูป</span>
        </button>
        <button className={`tab-btn ${activeTab === 'semifinished' ? 'active' : ''}`} onClick={() => { setActiveTab('semifinished'); setSelectedItem(null); }}>
          <Archive size={20} />
          <span>กึ่งสำเร็จรูป</span>
        </button>
        <button className={`tab-btn ${activeTab === 'materials' ? 'active' : ''}`} onClick={() => { setActiveTab('materials'); setSelectedItem(null); }}>
          <Database size={20} />
          <span>คลังวัตถุดิบ</span>
        </button>
        <button className={`tab-btn ${activeTab === 'finance' ? 'active' : ''}`} onClick={() => { setActiveTab('finance'); setSelectedItem(null); }}>
          <Calculator size={20} />
          <span>บัญชี</span>
        </button>
      </div>

      <main className="main-content">
        {activeTab === 'finance' ? (
          <div className="finance-section">
            <div className="summary-banner finance-banner">
              <div className="summary-item">
                <label>รายรับรวม (ถอนเงิน)</label>
                <p className="val text-success">฿{totalIncome.toLocaleString()}</p>
              </div>
              <div className="summary-item">
                <label>รายจ่ายรวม (บิล/ใบเสร็จ)</label>
                <p className="val text-danger">฿{totalExpense.toLocaleString()}</p>
              </div>
              <div className="summary-item">
                <label>กำไรคงเหลือในบัญชี</label>
                <p className="val text-primary">฿{(totalIncome - totalExpense).toLocaleString()}</p>
              </div>
            </div>

            <div className="card">
              <div className="section-header">
                <h2>รายการเดินบัญชี</h2>
                <div className="actions">
                  <button className="btn-success" onClick={() => handleAddTransaction('income')}><Plus size={16} /> ลงรายรับ</button>
                  <button className="btn-danger" onClick={() => handleAddTransaction('expense')}><Plus size={16} /> ลงรายจ่าย</button>
                </div>
              </div>
              <div className="table-container">
                <table className="cost-table">
                  <thead>
                    <tr>
                      <th>วันที่</th>
                      <th>ประเภท</th>
                      <th>รายการ / หมายเหตุ</th>
                      <th className="text-right">ภาษี (VAT 7%)</th>
                      <th className="text-right">ยอดเงินรวม</th>
                      <th>หลักฐาน</th>
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(t => (
                      <tr key={t.id} className={t.type === 'income' ? 'row-income' : 'row-expense'}>
                        <td data-label="วันที่"><input type="date" className="inline-input" value={t.date} onChange={async (e) => {
                          await supabase.from('transactions').update({ date: e.target.value }).eq('id', t.id);
                          fetchAllData();
                        }} /></td>
                        <td data-label="ประเภท" className="font-bold">{t.type === 'income' ? 'รายรับ' : 'รายจ่าย'}</td>
                        <td data-label="รายการ">
                          <div className="category-note">
                            <input className="inline-input font-bold" placeholder="หมวดหมู่หลัก..." value={t.category} 
                              onChange={e => setTransactions(transactions.map(x => x.id === t.id ? { ...x, category: e.target.value } : x))}
                              onBlur={async () => {
                                await supabase.from('transactions').update({ category: t.category }).eq('id', t.id);
                              }}
                            />
                            
                            <div className="items-list">
                              {(t.items || []).map((item, idx) => (
                                <div key={idx} className="item-row">
                                  <input className="item-name" placeholder="ชื่อรายการ..." value={item.name} 
                                    onChange={e => {
                                      const newItems = [...(t.items || [])];
                                      newItems[idx].name = e.target.value;
                                      setTransactions(transactions.map(x => x.id === t.id ? { ...x, items: newItems } : x));
                                    }}
                                    onBlur={async () => await supabase.from('transactions').update({ items: t.items }).eq('id', t.id)}
                                  />
                                  <input type="number" className="item-price" placeholder="ราคา" value={item.amount} 
                                    onChange={e => {
                                      const newItems = [...(t.items || [])];
                                      newItems[idx].amount = Number(e.target.value);
                                      const newTotal = newItems.reduce((sum, i) => sum + Number(i.amount || 0), 0);
                                      const vat = t.is_vat ? (newTotal * 0.07) : 0;
                                      setTransactions(transactions.map(x => x.id === t.id ? { ...x, items: newItems, amount: newTotal, vat_amount: vat } : x));
                                    }}
                                    onBlur={async () => {
                                      const vat = t.is_vat ? (Number(t.amount) * 0.07) : 0;
                                      await supabase.from('transactions').update({ items: t.items, amount: Number(t.amount), vat_amount: vat }).eq('id', t.id);
                                      fetchAllData();
                                    }}
                                  />
                                  <button className="icon-btn mini delete-btn" onClick={async () => {
                                    const newItems = t.items.filter((_, i) => i !== idx);
                                    const newTotal = newItems.reduce((sum, i) => sum + Number(i.amount || 0), 0);
                                    const vat = t.is_vat ? (newTotal * 0.07) : 0;
                                    await supabase.from('transactions').update({ items: newItems, amount: newTotal, vat_amount: vat }).eq('id', t.id);
                                    fetchAllData();
                                  }}><Trash2 size={12} /></button>
                                </div>
                              ))}
                              <button className="add-item-btn" onClick={async () => {
                                const newItems = [...(t.items || []), { name: '', amount: 0 }];
                                await supabase.from('transactions').update({ items: newItems }).eq('id', t.id);
                                fetchAllData();
                              }}><Plus size={12} /> เพิ่มรายการย่อย</button>
                            </div>
                          </div>
                        </td>
                        <td data-label="VAT (7%)" className="text-right">
                          <div className="vat-control">
                            <label className="vat-toggle">
                              <input type="checkbox" checked={t.is_vat} onChange={async (e) => {
                                const is_vat = e.target.checked;
                                const vat_amount = is_vat ? (Number(t.amount) * 0.07) : 0;
                                await supabase.from('transactions').update({ is_vat, vat_amount }).eq('id', t.id);
                                fetchAllData();
                              }} />
                              <span>VAT</span>
                            </label>
                            {t.is_vat && <span className="vat-val">฿{Number(t.vat_amount || 0).toLocaleString()}</span>}
                          </div>
                        </td>
                        <td data-label="ยอดรวม">
                          <input type="number" className="inline-input text-right font-bold text-primary" value={t.amount} 
                            onChange={e => setTransactions(transactions.map(x => x.id === t.id ? { ...x, amount: e.target.value } : x))}
                            onBlur={async () => {
                              const vat_amount = t.is_vat ? (Number(t.amount) * 0.07) : 0;
                              await supabase.from('transactions').update({ amount: Number(t.amount), vat_amount }).eq('id', t.id);
                              fetchAllData();
                            }}
                          />
                        </td>
                        <td data-label="หลักฐาน">
                          <div className="receipt-container">
                            <div className="receipt-box">
                              <span className="receipt-label">บิล:</span>
                              {t.image_url ? (
                                <a href={t.image_url} target="_blank" rel="noreferrer" className="receipt-link">
                                  <img src={t.image_url} alt="bill" className="receipt-thumb" />
                                </a>
                              ) : (
                                <label className="upload-btn mini">
                                  <input type="file" hidden onChange={(e) => handleFileUpload(e, t.id, 'image_url')} accept="image/*" />
                                  <Plus size={12} /> บิล
                                </label>
                              )}
                            </div>
                            <div className="receipt-box">
                              <span className="receipt-label">สลีป:</span>
                              {t.slip_url ? (
                                <a href={t.slip_url} target="_blank" rel="noreferrer" className="receipt-link">
                                  <img src={t.slip_url} alt="slip" className="receipt-thumb" />
                                </a>
                              ) : (
                                <label className="upload-btn mini">
                                  <input type="file" hidden onChange={(e) => handleFileUpload(e, t.id, 'slip_url')} accept="image/*" />
                                  <Plus size={12} /> สลีป
                                </label>
                              )}
                            </div>
                          </div>
                        </td>
                        <td data-label="จัดการ" className="text-center">
                          <button className="icon-btn delete-btn" onClick={async () => {
                            if (window.confirm('ลบรายการนี้?')) {
                              await supabase.from('transactions').delete().eq('id', t.id);
                              fetchAllData();
                            }
                          }}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'materials' ? (
          <div className="card material-library">
            <div className="section-header">
              <h2><Database size={20} /> คลังวัตถุดิบ (Raw Materials)</h2>
              <button className="btn-primary" onClick={handleAddMaterial}><Plus size={16} /> เพิ่มวัตถุดิบ</button>
            </div>
            <div className="table-container">
              <table className="cost-table">
                <thead>
                  <tr>
                    <th>ชื่อวัตถุดิบ</th>
                    <th className="text-right">ราคาที่ซื้อมา (บาท)</th>
                    <th className="text-right">ปริมาณที่ได้</th>
                    <th className="text-right">ราคาเฉลี่ยต่อหน่วย</th>
                    <th>ประเภทหน่วย</th>
                    <th>หน่วยที่ใช้จริง</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map(m => {
                    const calculatedUnitPrice = m.purchase_price / (m.purchase_qty || 1);
                    return (
                      <tr key={m.id}>
                        <td data-label="ชื่อวัตถุดิบ"><input className="inline-input" value={m.name} onChange={e => setMaterials(materials.map(mat => mat.id === m.id ? { ...mat, name: e.target.value } : mat))} onBlur={() => handleSaveMaterial(m)} /></td>
                        <td data-label="ราคาซื้อ"><input type="number" className="inline-input text-right" value={m.purchase_price} onChange={e => {
                          const val = Number(e.target.value);
                          const updated = materials.map(mat => mat.id === m.id ? { ...mat, purchase_price: val, unit_price: val / (mat.purchase_qty || 1) } : mat);
                          setMaterials(updated);
                        }} onBlur={() => handleSaveMaterial(materials.find(x => x.id === m.id))} /></td>
                        <td data-label="ปริมาณ"><input type="number" className="inline-input text-right" value={m.purchase_qty} onChange={e => {
                          const val = Number(e.target.value);
                          const updated = materials.map(mat => mat.id === m.id ? { ...mat, purchase_qty: val, unit_price: mat.purchase_price / (val || 1) } : mat);
                          setMaterials(updated);
                        }} onBlur={() => handleSaveMaterial(materials.find(x => x.id === m.id))} /></td>
                        <td data-label="เฉลี่ย/หน่วย" className="text-right font-bold text-primary">฿{calculatedUnitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td data-label="ประเภทหน่วย">
                          <select className="inline-input" value={m.unit_type} onChange={e => {
                            const newType = e.target.value;
                            let newUnit = 'ชิ้น';
                            if (newType === 'บาท/กิโลกรัม') newUnit = 'กิโลกรัม';
                            if (newType === 'บาท/ลิตร') newUnit = 'ลิตร';
                            const updated = materials.map(mat => mat.id === m.id ? { ...mat, unit_type: newType, usage_unit: newUnit } : mat);
                            setMaterials(updated);
                            handleSaveMaterial(updated.find(x => x.id === m.id));
                          }}>
                            <option value="บาท/กิโลกรัม">บาท/กิโลกรัม</option>
                            <option value="บาท/ลิตร">บาท/ลิตร</option>
                            <option value="บาท/ชิ้น">บาท/ชิ้น</option>
                          </select>
                        </td>
                        <td data-label="หน่วยใช้จริง">
                          <select className="inline-input" value={m.usage_unit} onChange={e => {
                            const updated = materials.map(mat => mat.id === m.id ? { ...mat, usage_unit: e.target.value } : mat);
                            setMaterials(updated);
                            handleSaveMaterial(updated.find(x => x.id === m.id));
                          }}>
                            {m.unit_type === 'บาท/กิโลกรัม' && <><option value="กิโลกรัม">กิโลกรัม</option><option value="กรัม">กรัม</option></>}
                            {m.unit_type === 'บาท/ลิตร' && <><option value="ลิตร">ลิตร</option><option value="มิลลิลิตร">มิลลิลิตร</option></>}
                            {m.unit_type === 'บาท/ชิ้น' && <><option value="ชิ้น">ชิ้น</option><option value="ใบ">ใบ</option><option value="กล่อง">กล่อง</option></>}
                          </select>
                        </td>
                        <td data-label="จัดการ" className="text-center">
                          <button className="icon-btn delete-btn" onClick={() => handleDeleteMaterial(m.id)}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bom-layout">
            <div className="product-list card">
              <div className="section-header">
                <h3>{activeTab === 'finished' ? 'สินค้าสำเร็จรูป' : 'สินค้ากึ่งสำเร็จรูป'}</h3>
                <button className="icon-btn primary-bg" onClick={activeTab === 'finished' ? handleAddFinished : handleAddSemiFinished}><Plus size={16} /></button>
              </div>
              <div className="list-items">
                {(activeTab === 'finished' ? finished : semiFinished).map(p => (
                  <div key={p.id} className={`list-item ${selectedItem?.id === p.id ? 'active' : ''}`} onClick={() => setSelectedItem(p)}>
                    <div className="info">
                      <p className="name">{p.name}</p>
                      <p className="cost">ต้นทุน: ฿{(activeTab === 'finished' ? calculateFinishedCost(p, materials, semiFinished) : calculateSemiFinishedCost(p, materials)).toLocaleString()}</p>
                    </div>
                    <ChevronRight size={20} className="text-muted" />
                  </div>
                ))}
              </div>
            </div>

            <div className={`product-detail card ${selectedItem ? 'show' : ''}`}>
              {selectedItem ? (
                <>
                  <div className="section-header">
                    <button className="mobile-back-btn" onClick={() => setSelectedItem(null)}>
                      <ArrowLeft size={20} /> ย้อนกลับ
                    </button>
                    <div className="title-group">
                      <Layers className="text-primary" size={24} />
                      <input className="title-input" value={selectedItem.name} 
                        onChange={e => handleUpdateProductName(selectedItem.id, e.target.value, activeTab)} 
                        onBlur={() => fetchAllData()}
                      />
                    </div>
                    <div className="actions">
                      <button className="icon-btn delete-btn" onClick={async () => {
                        const table = activeTab === 'finished' ? 'finished_products' : 'semi_finished';
                        await supabase.from(table).delete().eq('id', selectedItem.id);
                        fetchAllData();
                        setSelectedItem(null);
                      }}><Trash2 size={18} /></button>
                    </div>
                  </div>
                  
                  <div className="summary-banner blue-theme">
                    <div className="summary-item">
                      <label>ต้นทุนรวมสะสม</label>
                      <p className="val">฿{activeTab === 'finished' ? calculateFinishedCost(selectedItem, materials, semiFinished) : calculateSemiFinishedCost(selectedItem, materials)}</p>
                    </div>
                    {activeTab === 'finished' && (
                      <>
                        <div className="summary-item">
                          <label>ราคาขาย</label>
                          <input type="number" className="val-input" value={selectedItem.sellingPrice} 
                            onChange={e => handleUpdateSellingPrice(selectedItem.id, Number(e.target.value))} 
                            onBlur={() => fetchAllData()}
                          />
                        </div>
                        <div className="summary-item">
                          <label>กำไรสุทธิ</label>
                          <p className="val">฿{(selectedItem.sellingPrice - calculateFinishedCost(selectedItem, materials, semiFinished)).toLocaleString()}</p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="bom-builder">
                    {activeTab === 'finished' && (
                      <div className="builder-section">
                        <h4>1. สินค้ากึ่งสำเร็จรูป (Semi-Finished) ที่นำมาใช้</h4>
                        <table className="cost-table builder-table mb-4">
                          <thead>
                            <tr>
                              <th>รายการ</th>
                              <th className="text-right">จำนวนที่ใช้</th>
                              <th>หน่วย</th>
                              <th className="text-right">ต้นทุนย่อย</th>
                            </tr>
                          </thead>
                          <tbody>
                            {semiFinished.map(sf => {
                              const item = selectedItem.items.find(i => i.semiFinishedId === sf.id);
                              const qty = item ? item.usageQty : 0;
                              const cost = calculateSemiFinishedCost(sf, materials) * qty;
                              return (
                                <tr key={sf.id} className={qty > 0 ? 'row-selected' : ''}>
                                  <td data-label="รายการ">{sf.name}</td>
                                  <td data-label="จำนวนที่ใช้"><input type="number" className="inline-input text-right" placeholder="0" value={qty || ''} 
                                    onChange={e => handleUpdateFItem(selectedItem.id, sf.id, Number(e.target.value), 'sf')} /></td>
                                  <td data-label="หน่วย">ชิ้น</td>
                                  <td data-label="ต้นทุนย่อย" className="text-right">฿{cost.toLocaleString()}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="builder-section">
                      <h4>{activeTab === 'finished' ? '2. วัตถุดิบเพิ่มเติม (Add-on Materials)' : 'รายการวัตถุดิบสำหรับจัดชุด'}</h4>
                      <div className="builder-table-wrapper">
                        <table className="cost-table builder-table">
                          <thead>
                            <tr>
                              <th>วัตถุดิบ</th>
                              <th className="text-right">ปริมาณ</th>
                              <th>หน่วย</th>
                              <th className="text-right">ต้นทุน</th>
                            </tr>
                          </thead>
                          <tbody>
                            {materials.map(mat => {
                              const item = selectedItem.items.find(i => i.materialId === mat.id);
                              const qty = item ? item.usageQty : 0;
                              const cost = calculateItemCost(mat, qty);
                              return (
                                <tr key={mat.id} className={qty > 0 ? 'row-selected' : ''}>
                                  <td data-label="วัตถุดิบ">{mat.name}</td>
                                  <td data-label="ปริมาณ"><input type="number" className="inline-input text-right" placeholder="0" value={qty || ''} 
                                    onChange={e => activeTab === 'finished' ? handleUpdateFItem(selectedItem.id, mat.id, Number(e.target.value), 'mat') : handleUpdateSFItem(selectedItem.id, mat.id, Number(e.target.value))} /></td>
                                  <td data-label="หน่วย">{mat.usage_unit}</td>
                                  <td data-label="ต้นทุน" className="text-right">฿{cost.toLocaleString()}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-selection">
                  <Archive size={48} />
                  <p>เลือกรายการเพื่อจัดการโครงสร้างต้นทุน</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
