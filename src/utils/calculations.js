export const calculateItemCost = (material, usageQty) => {
  if (!material) return 0;
  let cost = 0;
  const { unit_price, unit_type, usage_unit } = material;
  
  // Standardized units for precise calculation
  const isSmallUnit = usage_unit === 'กรัม' || usage_unit === 'มิลลิลิตร';
  const isPerWeightVolume = unit_type === 'บาท/กิโลกรัม' || unit_type === 'บาท/ลิตร';

  if (isPerWeightVolume && isSmallUnit) {
    // Exact scale: 1/1000
    cost = (unit_price / 1000) * usageQty;
  } else {
    // Exact scale: 1/1
    cost = unit_price * usageQty;
  }

  return Number(cost.toFixed(2));
};

export const calculateSemiFinishedCost = (sf, materials) => {
  if (!sf || !sf.items) return 0;
  const total = sf.items.reduce((sum, item) => {
    const material = materials.find(m => m.id === item.materialId);
    return sum + calculateItemCost(material, item.usageQty);
  }, 0);
  return Number(total.toFixed(2));
};

export const calculateFinishedCost = (product, materials, semiFinishedList) => {
  if (!product || !product.items) return 0;
  const total = product.items.reduce((sum, item) => {
    if (item.materialId) {
      const material = materials.find(m => m.id === item.materialId);
      return sum + calculateItemCost(material, item.usageQty);
    } else if (item.semiFinishedId) {
      const sf = semiFinishedList.find(s => s.id === item.semiFinishedId);
      const sfUnitCost = calculateSemiFinishedCost(sf, materials);
      return sum + (sfUnitCost * item.usageQty);
    }
    return sum;
  }, 0);
  return Number(total.toFixed(2));
};
