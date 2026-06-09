import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDB, generateId } from '../../lib/db';
import { formatRupiah } from '../../lib/hpp-calculator';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

interface PO {
  id: string;
  supplierName: string;
  status: string;
  total: number;
  createdAt: string;
  itemCount: number;
}

const STATUS_COLOR: Record<string, string> = {
  menunggu: Colors.amber,
  'dalam pengiriman': Colors.info,
  selesai: Colors.primary,
};

export default function POScreen() {
  const [pos, setPOs] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [poItems, setPOItems] = useState([{ id: '1', name: '', qty: '', unit: '', price: '' }]);

  useEffect(() => { loadPOs(); }, []);

  async function loadPOs() {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      `SELECT po.*, COUNT(pi.id) as item_count
       FROM purchase_orders po
       LEFT JOIN po_items pi ON pi.po_id = po.id
       GROUP BY po.id ORDER BY po.created_at DESC`
    );
    setPOs(rows.map((r) => ({
      id: r.id, supplierName: r.supplier_name, status: r.status,
      total: r.total, createdAt: r.created_at, itemCount: r.item_count,
    })));
    setLoading(false);
  }

  async function savePO() {
    const validItems = poItems.filter((i) => i.name && i.qty && i.price);
    if (!supplier || validItems.length === 0) return Alert.alert('Supplier dan minimal 1 item wajib diisi');
    const total = validItems.reduce((s, i) => s + parseFloat(i.qty) * parseFloat(i.price), 0);
    const db = await getDB();
    const poId = generateId();
    await db.runAsync(
      `INSERT INTO purchase_orders (id, supplier_name, status, total, created_at) VALUES (?, ?, 'menunggu', ?, datetime('now'))`,
      poId, supplier, total
    );
    for (const item of validItems) {
      await db.runAsync(
        `INSERT INTO po_items (id, po_id, qty, unit, price) VALUES (?, ?, ?, ?, ?)`,
        generateId(), poId, parseFloat(item.qty), item.unit, parseFloat(item.price)
      );
    }
    setShowForm(false);
    setSupplier('');
    setPOItems([{ id: '1', name: '', qty: '', unit: '', price: '' }]);
    loadPOs();
  }

  async function updateStatus(id: string, status: string) {
    const db = await getDB();
    await db.runAsync(`UPDATE purchase_orders SET status = ? WHERE id = ?`, status, id);
    if (status === 'selesai') {
      const items = await db.getAllAsync<any>(`SELECT * FROM po_items WHERE po_id = ?`, id);
      for (const item of items) {
        if (item.ingredient_id) {
          await db.runAsync(
            `UPDATE ingredients SET current_stock = current_stock + ? WHERE id = ?`,
            item.qty, item.ingredient_id
          );
        }
      }
    }
    loadPOs();
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={Colors.primary} /></View>;

  return (
    <View style={s.container}>
      <FlatList
        data={pos}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: Spacing.md }}
        renderItem={({ item }) => {
          const color = STATUS_COLOR[item.status] ?? Colors.textMuted;
          return (
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View>
                  <Text style={s.supplier}>{item.supplierName}</Text>
                  <Text style={s.sub}>{item.itemCount} item • {item.createdAt.slice(0, 10)}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: color + '20' }]}>
                  <Text style={[s.badgeText, { color }]}>{item.status}</Text>
                </View>
              </View>
              <View style={s.cardFooter}>
                <Text style={s.total}>{formatRupiah(item.total)}</Text>
                {item.status === 'menunggu' && (
                  <TouchableOpacity style={s.actionBtn} onPress={() => updateStatus(item.id, 'dalam pengiriman')}>
                    <Text style={s.actionBtnText}>Kirim</Text>
                  </TouchableOpacity>
                )}
                {item.status === 'dalam pengiriman' && (
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: Colors.primary }]} onPress={() => updateStatus(item.id, 'selesai')}>
                    <Text style={[s.actionBtnText, { color: Colors.white }]}>Terima Barang</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>Belum ada purchase order</Text>}
      />

      <TouchableOpacity style={s.fab} onPress={() => setShowForm(true)}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>

      <Modal visible={showForm} animationType="slide" transparent>
        <View style={s.overlay}>
          <ScrollView style={s.modalBox} contentContainerStyle={{ padding: Spacing.lg }}>
            <Text style={s.modalTitle}>Buat Purchase Order</Text>
            <TextInput style={s.input} placeholder="Nama supplier" value={supplier} onChangeText={setSupplier} />
            <Text style={s.sectionLabel}>Item Pesanan</Text>
            {poItems.map((item, idx) => (
              <View key={item.id} style={s.itemRow}>
                <TextInput style={[s.input, { flex: 2 }]} placeholder="Nama item" value={item.name} onChangeText={(v) => setPOItems(poItems.map((i) => i.id === item.id ? { ...i, name: v } : i))} />
                <TextInput style={[s.input, { flex: 1 }]} placeholder="Qty" keyboardType="numeric" value={item.qty} onChangeText={(v) => setPOItems(poItems.map((i) => i.id === item.id ? { ...i, qty: v } : i))} />
                <TextInput style={[s.input, { flex: 1 }]} placeholder="Satuan" value={item.unit} onChangeText={(v) => setPOItems(poItems.map((i) => i.id === item.id ? { ...i, unit: v } : i))} />
                <TextInput style={[s.input, { flex: 2 }]} placeholder="Harga" keyboardType="numeric" value={item.price} onChangeText={(v) => setPOItems(poItems.map((i) => i.id === item.id ? { ...i, price: v } : i))} />
              </View>
            ))}
            <TouchableOpacity style={s.addItemBtn} onPress={() => setPOItems([...poItems, { id: String(Date.now()), name: '', qty: '', unit: '', price: '' }])}>
              <Text style={s.addItemText}>+ Tambah Item</Text>
            </TouchableOpacity>
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btn, s.btnCancel]} onPress={() => setShowForm(false)}>
                <Text style={s.btnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={savePO}>
                <Text style={s.btnPrimaryText}>Simpan PO</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  supplier: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  sub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  badge: { borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  total: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  actionBtn: { borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  actionBtnText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 40 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: Colors.primary, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  overlay: { flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.xs },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, fontSize: FontSize.sm, color: Colors.textPrimary, marginBottom: Spacing.xs },
  itemRow: { flexDirection: 'row', gap: 4 },
  addItemBtn: { borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center', marginBottom: Spacing.sm, borderStyle: 'dashed' },
  addItemText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: Spacing.sm },
  btn: { flex: 1, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center' },
  btnCancel: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  btnCancelText: { color: Colors.textSecondary, fontWeight: '600' },
  btnPrimary: { backgroundColor: Colors.primary },
  btnPrimaryText: { color: Colors.white, fontWeight: '600' },
});
