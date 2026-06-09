export interface HPPIngredient {
  id: string;
  name: string;
  qty: number;
  unit: string;
  pricePerUnit: number;
}

export interface HPPProductionCosts {
  gasCost: number;
  packagingCost: number;
  otherCost: number;
}

export interface HPPResult {
  hppPerPortion: number;
  ingredientsTotal: number;
  productionTotal: number;
  breakdown: HPPIngredient[];
}

export interface HargaJualResult {
  hargaModal: number;
  hargaJual: number;
  profitPerPorsi: number;
  marginAktual: number;
  hargaMinimal: number;
  hargaIdeal: number;
  hargaPremium: number;
}

export interface BEPResult {
  bepUnit: number;
  bepRupiah: number;
  skenario: Array<{ label: string; qty: number; profit: number }>;
}

export function bulatkan(harga: number, pembulatan: number): number {
  return Math.round(harga / pembulatan) * pembulatan;
}

export function hitungHPP(
  ingredients: HPPIngredient[],
  productionCosts: HPPProductionCosts
): HPPResult {
  const ingredientsTotal = ingredients.reduce(
    (sum, ing) => sum + ing.qty * ing.pricePerUnit,
    0
  );
  const productionTotal =
    productionCosts.gasCost + productionCosts.packagingCost + productionCosts.otherCost;
  return {
    hppPerPortion: ingredientsTotal + productionTotal,
    ingredientsTotal,
    productionTotal,
    breakdown: ingredients,
  };
}

export function hitungHargaJual(
  hpp: number,
  overheadBulanan: number,
  estimasiQty: number,
  marginTarget: number
): HargaJualResult {
  const overheadPerPorsi = estimasiQty > 0 ? overheadBulanan / estimasiQty : 0;
  const hargaModal = hpp + overheadPerPorsi;
  const margin = Math.min(marginTarget / 100, 0.99);
  const hargaJual = hargaModal / (1 - margin);
  const profit = hargaJual - hargaModal;
  const marginAktual = hargaJual > 0 ? (profit / hargaJual) * 100 : 0;
  return {
    hargaModal: bulatkan(hargaModal, 500),
    hargaJual: bulatkan(hargaJual, 1000),
    profitPerPorsi: profit,
    marginAktual,
    hargaMinimal: bulatkan(hargaModal * 1.1, 500),
    hargaIdeal: bulatkan(hargaJual, 1000),
    hargaPremium: bulatkan(hargaJual * 1.2, 5000),
  };
}

export function hitungBEP(
  hargaJual: number,
  hpp: number,
  biayaTetap: number
): BEPResult {
  const kontribusiMargin = hargaJual - hpp;
  const bepUnit = kontribusiMargin > 0 ? biayaTetap / kontribusiMargin : 0;
  const bepRupiah = bepUnit * hargaJual;
  return {
    bepUnit,
    bepRupiah,
    skenario: [
      { label: 'Pesimis', qty: bepUnit * 0.7, profit: bepUnit * 0.7 * kontribusiMargin - biayaTetap },
      { label: 'Realistis', qty: bepUnit, profit: 0 },
      { label: 'Optimis', qty: bepUnit * 1.3, profit: bepUnit * 0.3 * kontribusiMargin },
      { label: 'Maksimal', qty: bepUnit * 1.6, profit: bepUnit * 0.6 * kontribusiMargin },
    ],
  };
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
