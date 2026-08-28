import { Alert } from 'react-native';
import { create } from 'zustand';
import { useSettingsStore } from './settingsStore';

export interface CartItem {
  menuId: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
  /** Stok menu saat item masuk keranjang; disegarkan tiap fetchMenus via syncPrices. */
  stock?: number;
}

interface CartState {
  items: CartItem[];
  tableNo: string;
  customerId: string;
  paymentMethod: string;
  discount: number;
  editOrderId: string;
  editOrderTable: string;
  addItem: (item: Omit<CartItem, 'qty'>) => void;
  removeItem: (menuId: string) => void;
  updateQty: (menuId: string, qty: number) => void;
  setTableNo: (v: string) => void;
  setCustomerId: (v: string) => void;
  setPaymentMethod: (v: string) => void;
  setDiscount: (v: number) => void;
  setEditOrder: (orderId: string, tableNo: string) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTotal: () => number;
  syncPrices: (menus: Array<{ id: string; name: string; sellPrice: number; stock: number }>) => void;
}

/** true jika qty masih dalam batas stok. Kalau lewat, beri tahu user dan tolak. */
function withinStock(item: { name: string; stock?: number }, qty: number): boolean {
  const max = item.stock;
  if (max === undefined || qty <= max) return true;
  Alert.alert(
    'Stok Tidak Cukup',
    max <= 0
      ? `${item.name} sedang habis.`
      : `Stok ${item.name} hanya ${max}. Tidak bisa memesan lebih dari itu.`
  );
  return false;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tableNo: '',
  customerId: '',
  paymentMethod: 'Tunai',
  discount: 0,
  editOrderId: '',
  editOrderTable: '',

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.menuId === item.menuId);
      if (existing) {
        if (!withinStock(existing, existing.qty + 1)) return state;
        return {
          items: state.items.map((i) =>
            i.menuId === item.menuId ? { ...i, qty: i.qty + 1 } : i
          ),
        };
      }
      if (!withinStock(item, 1)) return state;
      return { items: [...state.items, { ...item, qty: 1 }] };
    }),

  removeItem: (menuId) =>
    set((state) => ({ items: state.items.filter((i) => i.menuId !== menuId) })),

  updateQty: (menuId, qty) => {
    if (qty <= 0) {
      get().removeItem(menuId);
      return;
    }
    const target = get().items.find((i) => i.menuId === menuId);
    if (target && !withinStock(target, qty)) return;
    set((state) => ({
      items: state.items.map((i) => (i.menuId === menuId ? { ...i, qty } : i)),
    }));
  },

  setTableNo: (v) => set({ tableNo: v }),
  setCustomerId: (v) => set({ customerId: v }),
  setPaymentMethod: (v) => set({ paymentMethod: v }),
  setDiscount: (v) => set({ discount: v }),
  setEditOrder: (orderId, tableNo) => set({ editOrderId: orderId, editOrderTable: tableNo }),

  clearCart: () =>
    set({ items: [], tableNo: '', customerId: '', discount: 0, paymentMethod: 'Tunai', editOrderId: '', editOrderTable: '' }),

  syncPrices: (menus) =>
    set((state) => ({
      items: state.items.map((item) => {
        const fresh = menus.find((m) => m.id === item.menuId);
        if (!fresh) return item;
        return { ...item, name: fresh.name, price: fresh.sellPrice, stock: fresh.stock };
      }),
    })),

  getSubtotal: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),
  getTotal: () => {
    const subtotal = get().getSubtotal();
    const ppnRate = useSettingsStore.getState().ppn / 100;
    return subtotal + subtotal * ppnRate - get().discount;
  },
}));
