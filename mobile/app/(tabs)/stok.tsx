import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStokStore, getStokStatus, Ingredient } from '../../stores/stokStore';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

const STATUS_COLOR: Record<string, string> = {
  Aman: Colors.primary,
  Rendah: Colors.amber,
  Kritis: Colors.danger,
  Habis: Colors.danger,
};

export default function StokScreen() {
  const { ingredients, loading, fetchIngredients, createIngredient, addMovement } = useStokStore();
  const [showAdd, setShowAdd] = useState(false);
  const [showMovement, setShowMovement] = useState<Ingredient | null>(null);
  const [movQty, setMovQty] = useState('');
  const [movType, setMovType] = useState<'masuk' | 'keluar'>('masuk');
  const [form, setForm] = useState({ name: '', category: '', currentStock: '', unit: '', minStock: '' });

  useEffect(() => { fetchIngredients(); }, []);

  async function handleAdd() {
    if (!form.name || !form.unit) return Alert.alert('Nama dan satuan wajib diisi');
    await createIngredient({
      name: form.name,
      category: form.category,
      currentStock: parseFloat(form.currentStock) || 0,
      unit: form.unit,
      minStock: parseFloat(form.minStock) || 0,
    });
    setShowAdd(false);
    setForm({ name: '', category: '', currentStock: '', unit: '', minStock: '' });
  }

  async function handleMovement() {
    if (!showMovement || !movQty) return;
    await addMovement(showMovement.id, movType, parseFloat(movQty));
    setShowMovement(null);
    setMovQty('');
  }

  if (loading) return <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>;

  return (
    <View style={s.container}>
      <FlatList
        data={ingredients}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: Spacing.md }}
        renderItem={({ item }) => {
          const status = getStokStatus(item.currentStock, item.minStock);
          const color = STATUS_COLOR[status];
          return (
            <View style={s.card}>
              <View style={s.cardLeft}>
                <Text style={s.itemName}>{item.name}</Text>
                {item.category ? <Text style={s.itemCat}>{item.category}</Text> : null}
                <View style={s.statusRow}>
                  <View style={[s.statusDot, { backgroundColor: color }]} />
                  <Text style={[s.statusText, { color }]}>{status}</Text>
                </View>
              </View>
              <View style={s.cardRight}>
                <Text style={s.qtyText}>{item.currentStock} {item.unit}</Text>
                <Text style={s.minText}>Min: {item.minStock}</Text>
                <TouchableOpacity style={s.movBtn} onPress={() => { setShowMovement(item); setMovType('masuk'); }}>
                  <Text style={s.movBtnText}>Update Stok</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>Belum ada bahan baku</Text>}
      />

      <TouchableOpacity style={s.fab} onPress={() => setShowAdd(true)}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Tambah Bahan Baku</Text>
            <TextInput style={s.input} placeholder="Nama bahan" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
            <TextInput style={s.input} placeholder="Kategori (opsional)" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} />
            <View style={s.row}>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Stok awal" keyboardType="numeric" value={form.currentStock} onChangeText={(v) => setForm({ ...form, currentStock: v })} />
              <TextInput style={[s.input, { flex: 1 }]} placeholder="Satuan (kg, ltr)" value={form.unit} onChangeText={(v) => setForm({ ...form, unit: v })} />
            </View>
            <TextInput style={s.input} placeholder="Stok minimum" keyboardType="numeric" value={form.minStock} onChangeText={(v) => setForm({ ...form, minStock: v })} />
            <View style={s.row}>
              <TouchableOpacity style={[s.btn, s.btnCancel]} onPress={() => setShowAdd(false)}>
                <Text style={s.btnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={handleAdd}>
                <Text style={s.btnPrimaryText}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!showMovement} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Update Stok — {showMovement?.name}</Text>
            <View style={s.row}>
              {(['masuk', 'keluar'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.typeBtn, movType === t && s.typeBtnActive]}
                  onPress={() => setMovType(t)}
                >
                  <Text style={[s.typeBtnText, movType === t && s.typeBtnTextActive]}>
                    {t === 'masuk' ? '+ Masuk' : '- Keluar'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={s.input} placeholder="Jumlah" keyboardType="numeric" value={movQty} onChangeText={setMovQty} />
            <View style={s.row}>
              <TouchableOpacity style={[s.btn, s.btnCancel]} onPress={() => setShowMovement(null)}>
                <Text style={s.btnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={handleMovement}>
                <Text style={s.btnPrimaryText}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', elevation: 1 },
  cardLeft: { flex: 1 },
  cardRight: { alignItems: 'flex-end' },
  itemName: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textPrimary },
  itemCat: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  statusText: { fontSize: FontSize.xs, fontWeight: '600' },
  qtyText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  minText: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  movBtn: { backgroundColor: Colors.primaryLight, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 4, marginTop: 6 },
  movBtnText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 40 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: Colors.primary, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  modalOverlay: { flex: 1, backgroundColor: '#00000060', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg },
  modalTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, fontSize: FontSize.sm, color: Colors.textPrimary, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', gap: Spacing.sm },
  btn: { flex: 1, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center' },
  btnCancel: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  btnCancelText: { color: Colors.textSecondary, fontWeight: '600' },
  btnPrimary: { backgroundColor: Colors.primary },
  btnPrimaryText: { color: Colors.white, fontWeight: '600' },
  typeBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center' },
  typeBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeBtnText: { color: Colors.textSecondary, fontWeight: '600' },
  typeBtnTextActive: { color: Colors.white },
});
