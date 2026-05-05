export const initialMaterials = [
  { id: 'm1', name: 'ไซยาไน (ถังใหญ่)', unitPrice: 750, unitType: 'บาท/กิโลกรัม', usageUnit: 'กรัม' },
  { id: 'm2', name: 'SG9 (ถังใหญ่)', unitPrice: 1500, unitType: 'บาท/กิโลกรัม', usageUnit: 'กรัม' },
  { id: 'm5', name: 'กรดไนตริก (ถัง 35kg)', unitPrice: 25, unitType: 'บาท/กิโลกรัม', usageUnit: 'KG' },
  { id: 'm18', name: 'แกลอน 1kg', unitPrice: 19, unitType: 'บาท/ชิ้น', usageUnit: 'ใบ' },
  { id: 'm17', name: 'กล่องพัสดุ', unitPrice: 3, unitType: 'บาท/ชิ้น', usageUnit: 'กล่อง' },
  { id: 'm16', name: 'ค่าแรง', unitPrice: 10, unitType: 'บาท/ออเดอร์', usageUnit: 'ใบ' },
];

export const initialSemiFinished = [
  {
    id: 'sf1',
    name: 'ไนตริกแบ่งขวด 1kg',
    items: [
      { materialId: 'm5', usageQty: 1 },
      { materialId: 'm18', usageQty: 1 },
    ]
  }
];

export const initialFinished = [
  {
    id: 'f1',
    name: 'ชุดเครื่องประดับเงิน A (เซ็ตจบ)',
    sellingPrice: 1200,
    items: [
      { materialId: 'm1', usageQty: 30 },
      { materialId: 'm2', usageQty: 15 },
      { semiFinishedId: 'sf1', usageQty: 1 },
      { materialId: 'm17', usageQty: 1 },
    ]
  }
];
