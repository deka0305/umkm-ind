import { create } from 'zustand';
import { useSettingsStore } from './settingsStore';

export interface CartItem {
  menuId: string;
  name: string;
  price: number;
  qty: number;
  note?: string;
}

interface CartState {
  items: CartItem[];
  tableNo: string;
  customerId: string;
  paymentMethod: string;
  discount: number;
  addItem: (item: Omit<CartItem, 'qty'>) => void;
  removeItem: (menuId: string) => void;
  updateQty: (menuId: string, qty: number) => void;
  setTableNo: (v: string) => void;
  setCustomerId: (v: string) => void;
  setPaymentMethod: (v: string) => void;
  setDiscount: (v: number) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tableNo: '',
  customerId: '',
  paymentMethod: 'Tunai',
  discount: 0,

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.menuId === item.menuId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.menuId === item.menuId ? { ...i, qty: i.qty + 1 } : i
          ),
        };
      }
      return { items: [...state.items, { ...item, qty: 1 }] };
    }),

  removeItem: (menuId) =>
    set((state) => ({ items: state.items.filter((i) => i.menuId !== menuId) })),

  updateQty: (menuId, qty) => {
    if (qty <= 0) {
      get().removeItem(menuId);
      return;
    }
    set((state) => ({
      items: state.items.map((i) => (i.menuId === menuId ? { ...i, qty } : i)),
    }));
  },

  setTableNo: (v) => set({ tableNo: v }),
  setCustomerId: (v) => set({ customerId: v }),
  setPaymentMethod: (v) => set({ paymentMethod: v }),
  setDiscount: (v) => set({ discount: v }),

  clearCart: () =>
    set({ items: [], tableNo: '', customerId: '', discount: 0, paymentMethod: 'Tunai' }),

  getSubtotal: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),
  getTotal: () => {
    const subtotal = get().getSubtotal();
    const ppnRate = useSettingsStore.getState().ppn / 100;
    return subtotal + subtotal * ppnRate - get().discount;
  },
}));
