import React, { useState, useEffect } from 'react';
import { Plus, Package, Database, Trash2, Layers, ChevronRight, Calculator, Archive, Save, RefreshCw } from 'lucide-react';
import { supabase } from './supabaseClient';
import { calculateFinishedCost, calculateSemiFinishedCost, calculateItemCost } from './utils/calculations';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('finished'); // 'finished', 'semifinished', 'materials'
  const [materials, setMaterials] = useState([]);
  const [semiFinished, setSemiFinished] = useState([]);
  const [finished, setFinished] = useState([]);
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
      usage_unit: m.usage_unit
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
              <h1>ระบบคำนวณต้นทุน Real-time</h1>
              <p className="subtitle">Connected to Supabase Database</p>
            </div>
          </div>
          <div className="tab-navigation">
            <button className={`tab-btn ${activeTab === 'finished' ? 'active' : ''}`} onClick={() => { setActiveTab('finished'); setSelectedItem(null); }}>
              <Package size={18} /> สินค้าสำเร็จรูป
            </button>
            <button className={`tab-btn ${activeTab === 'semifinished' ? 'active' : ''}`} onClick={() => { setActiveTab('semifinished'); setSelectedItem(null); }}>
              <Archive size={18} /> สินค้ากึ่งสำเร็จรูป
            </button>
            <button className={`tab-btn ${activeTab === 'materials' ? 'active' : ''}`} onClick={() => { setActiveTab('materials'); setSelectedItem(null); }}>
              <Database size={18} /> คลังวัตถุดิบ
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'materials' ? (
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
                    <th className="text-right">ราคาต่อหน่วย</th>
                    <th>ประเภทหน่วย</th>
                    <th>หน่วยที่ใช้จริง</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map(m => (
                    <tr key={m.id}>
                      <td><input className="inline-input" value={m.name} onChange={e => setMaterials(materials.map(mat => mat.id === m.id ? { ...mat, name: e.target.value } : mat))} onBlur={() => handleSaveMaterial(m)} /></td>
                      <td><input type="number" className="inline-input text-right" value={m.unit_price} onChange={e => setMaterials(materials.map(mat => mat.id === m.id ? { ...mat, unit_price: Number(e.target.value) } : mat))} onBlur={() => handleSaveMaterial(m)} /></td>
                      <td>
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
                      <td>
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
                      <td className="text-center">
                        <button className="icon-btn delete-btn" onClick={() => handleDeleteMaterial(m.id)}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
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
                      <p className="cost">ต้นทุน: ฿{activeTab === 'finished' ? calculateFinishedCost(p, materials, semiFinished) : calculateSemiFinishedCost(p, materials)}</p>
                    </div>
                    <ChevronRight size={16} />
                  </div>
                ))}
              </div>
            </div>

            <div className="product-detail card">
              {selectedItem ? (
                <>
                  <div className="section-header">
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
                                  <td>{sf.name}</td>
                                  <td><input type="number" className="inline-input text-right" placeholder="0" value={qty || ''} 
                                    onChange={e => handleUpdateFItem(selectedItem.id, sf.id, Number(e.target.value), 'sf')} /></td>
                                  <td>ชิ้น</td>
                                  <td className="text-right">฿{cost.toLocaleString()}</td>
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
                                  <td>{mat.name}</td>
                                  <td><input type="number" className="inline-input text-right" placeholder="0" value={qty || ''} 
                                    onChange={e => activeTab === 'finished' ? handleUpdateFItem(selectedItem.id, mat.id, Number(e.target.value), 'mat') : handleUpdateSFItem(selectedItem.id, mat.id, Number(e.target.value))} /></td>
                                  <td>{mat.usage_unit}</td>
                                  <td className="text-right">฿{cost.toLocaleString()}</td>
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
