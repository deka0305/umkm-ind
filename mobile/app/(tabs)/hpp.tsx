import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert,
} from 'react-native';
import { hitungHPP, hitungHargaJual, hitungBEP, formatRupiah, HPPIngredient } from '../../lib/hpp-calculator';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

type Tab = 'hpp' | 'harga' | 'bep';

export default function HPPScreen() {
  const [tab, setTab] = useState<Tab>('hpp');

  return (
    <View style={s.container}>
      <View style={s.tabs}>
        {([['hpp', 'Hitung HPP'], ['harga', 'Harga Jual'], ['bep', 'BEP']] as [Tab, string][]).map(([t, label]) => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'hpp' && <HitungHPPTab />}
      {tab === 'harga' && <HargaJualTab />}
      {tab === 'bep' && <BEPTab />}
    </View>
  );
}

function HitungHPPTab() {
  const [ingredients, setIngredients] = useState<HPPIngredient[]>([
    { id: '1', name: '', qty: 0, unit: '', pricePerUnit: 0 },
  ]);
  const [gasCost, setGasCost] = useState('');
  const [packCost, setPackCost] = useState('');
  const [otherCost, setOtherCost] = useState('');
  const [result, setResult] = useState<ReturnType<typeof hitungHPP> | null>(null);

  function addIngredient() {
    setIngredients([...ingredients, { id: String(Date.now()), name: '', qty: 0, unit: '', pricePerUnit: 0 }]);
  }

  function updateIng(id: string, field: keyof HPPIngredient, value: string) {
    setIngredients(ingredients.map((i) =>
      i.id === id ? { ...i, [field]: ['qty', 'pricePerUnit'].includes(field) ? parseFloat(value) || 0 : value } : i
    ));
  }

  function hitung() {
    const valid = ingredients.filter((i) => i.name && i.qty > 0);
    if (valid.length === 0) return Alert.alert('Tambahkan minimal 1 bahan baku');
    const res = hitungHPP(valid, {
      gasCost: parseFloat(gasCost) || 0,
      packagingCost: parseFloat(packCost) || 0,
      otherCost: parseFloat(otherCost) || 0,
    });
    setResult(res);
  }

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <Text style={s.sectionLabel}>Bahan Baku</Text>
      {ingredients.map((ing, idx) => (
        <View key={ing.id} style={s.ingRow}>
          <TextInput style={[s.input, { flex: 2 }]} placeholder="Nama bahan" value={ing.name} onChangeText={(v) => updateIng(ing.id, 'name', v)} />
          <TextInput style={[s.input, { flex: 1 }]} placeholder="Qty" keyboardType="numeric" value={ing.qty > 0 ? String(ing.qty) : ''} onChangeText={(v) => updateIng(ing.id, 'qty', v)} />
          <TextInput style={[s.input, { flex: 1 }]} placeholder="Satuan" value={ing.unit} onChangeText={(v) => updateIng(ing.id, 'unit', v)} />
          <TextInput style={[s.input, { flex: 2 }]} placeholder="Harga/satuan" keyboardType="numeric" value={ing.pricePerUnit > 0 ? String(ing.pricePerUnit) : ''} onChangeText={(v) => updateIng(ing.id, 'pricePerUnit', v)} />
        </View>
      ))}
      <TouchableOpacity style={s.addIngBtn} onPress={addIngredient}>
        <Text style={s.addIngText}>+ Tambah Bahan</Text>
      </TouchableOpacity>

      <Text style={s.sectionLabel}>Biaya Produksi</Text>
      <View style={s.row}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Gas/Listrik" keyboardType="numeric" value={gasCost} onChangeText={setGasCost} />
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Kemasan" keyboardType="numeric" value={packCost} onChangeText={setPackCost} />
        <TextInput style={[s.input, { flex: 1 }]} placeholder="Lain-lain" keyboardType="numeric" value={otherCost} onChangeText={setOtherCost} />
      </View>

      <TouchableOpacity style={s.calcBtn} onPress={hitung}>
        <Text style={s.calcBtnText}>Hitung HPP</Text>
      </TouchableOpacity>

      {result && (
        <View style={s.resultBox}>
          <Text style={s.resultTitle}>Hasil Perhitungan</Text>
          <ResultRow label="Total Bahan" value={formatRupiah(result.ingredientsTotal)} />
          <ResultRow label="Biaya Produksi" value={formatRupiah(result.productionTotal)} />
          <View style={s.divider} />
          <ResultRow label="HPP per Porsi" value={formatRupiah(result.hppPerPortion)} bold />
        </View>
      )}
    </ScrollView>
  );
}

function HargaJualTab() {
  const [hpp, setHpp] = useState('');
  const [overhead, setOverhead] = useState('');
  const [estimasi, setEstimasi] = useState('');
  const [margin, setMargin] = useState('30');
  const [result, setResult] = useState<ReturnType<typeof hitungHargaJual> | null>(null);

  function hitung() {
    const h = parseFloat(hpp);
    if (!h) return Alert.alert('Masukkan HPP terlebih dahulu');
    setResult(hitungHargaJual(h, parseFloat(overhead) || 0, parseFloat(estimasi) || 1, parseFloat(margin) || 30));
  }

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <TextInput style={s.input} placeholder="HPP per porsi (Rp)" keyboardType="numeric" value={hpp} onChangeText={setHpp} />
      <TextInput style={s.input} placeholder="Overhead bulanan (Rp)" keyboardType="numeric" value={overhead} onChangeText={setOverhead} />
      <TextInput style={s.input} placeholder="Estimasi penjualan/bulan" keyboardType="numeric" value={estimasi} onChangeText={setEstimasi} />

      <Text style={s.sectionLabel}>Target Margin: {margin}%</Text>
      <View style={s.marginBtns}>
        {['10', '20', '30', '40', '50'].map((m) => (
          <TouchableOpacity key={m} style={[s.marginBtn, margin === m && s.marginBtnActive]} onPress={() => setMargin(m)}>
            <Text style={[s.marginBtnText, margin === m && s.marginBtnTextActive]}>{m}%</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={s.input} placeholder="Atau masukkan margin %" keyboardType="numeric" value={margin} onChangeText={setMargin} />

      <TouchableOpacity style={s.calcBtn} onPress={hitung}>
        <Text style={s.calcBtnText}>Hitung Harga Jual</Text>
      </TouchableOpacity>

      {result && (
        <View style={s.resultBox}>
          <Text style={s.resultTitle}>Hasil Perhitungan</Text>
          <ResultRow label="Harga Modal" value={formatRupiah(result.hargaModal)} />
          <ResultRow label="Profit/Porsi" value={formatRupiah(result.profitPerPorsi)} />
          <ResultRow label="Margin Aktual" value={`${result.marginAktual.toFixed(1)}%`} />
          <View style={s.divider} />
          <Text style={s.recLabel}>Rekomendasi Harga</Text>
          <ResultRow label="Minimal" value={formatRupiah(result.hargaMinimal)} color={Colors.amber} />
          <ResultRow label="Ideal" value={formatRupiah(result.hargaIdeal)} color={Colors.primary} bold />
          <ResultRow label="Premium" value={formatRupiah(result.hargaPremium)} color={Colors.info} />
        </View>
      )}
    </ScrollView>
  );
}

function BEPTab() {
  const [hargaJual, setHargaJual] = useState('');
  const [hpp, setHpp] = useState('');
  const [biayaTetap, setBiayaTetap] = useState('');
  const [result, setResult] = useState<ReturnType<typeof hitungBEP> | null>(null);

  function hitung() {
    const hj = parseFloat(hargaJual);
    const h = parseFloat(hpp);
    const bt = parseFloat(biayaTetap);
    if (!hj || !h || !bt) return Alert.alert('Semua field wajib diisi');
    if (hj <= h) return Alert.alert('Harga jual harus lebih besar dari HPP');
    setResult(hitungBEP(hj, h, bt));
  }

  return (
    <ScrollView contentContainerStyle={s.tabContent}>
      <TextInput style={s.input} placeholder="Harga jual (Rp)" keyboardType="numeric" value={hargaJual} onChangeText={setHargaJual} />
      <TextInput style={s.input} placeholder="HPP per porsi (Rp)" keyboardType="numeric" value={hpp} onChangeText={setHpp} />
      <TextInput style={s.input} placeholder="Biaya tetap/bulan (sewa, gaji, listrik)" keyboardType="numeric" value={biayaTetap} onChangeText={setBiayaTetap} />

      <TouchableOpacity style={s.calcBtn} onPress={hitung}>
        <Text style={s.calcBtnText}>Hitung BEP</Text>
      </TouchableOpacity>

      {result && (
        <View style={s.resultBox}>
          <Text style={s.resultTitle}>Break-Even Point</Text>
          <ResultRow label="BEP (unit/bulan)" value={`${Math.ceil(result.bepUnit)} porsi`} bold />
          <ResultRow label="BEP (rupiah)" value={formatRupiah(result.bepRupiah)} bold />
          <View style={s.divider} />
          <Text style={s.recLabel}>Proyeksi Skenario</Text>
          {result.skenario.map((sk) => (
            <View key={sk.label} style={s.skenarioRow}>
              <Text style={s.skenarioLabel}>{sk.label}</Text>
              <Text style={s.skenarioQty}>{Math.round(sk.qty)} porsi</Text>
              <Text style={[s.skenarioProfit, { color: sk.profit >= 0 ? Colors.primary : Colors.danger }]}>
                {sk.profit >= 0 ? '+' : ''}{formatRupiah(sk.profit)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ResultRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={s.resultRow}>
      <Text style={s.resultLabel}>{label}</Text>
      <Text style={[s.resultValue, bold && { fontWeight: '700' }, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabs: { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontWeight: '600' },
  tabContent: { padding: Spacing.md, paddingBottom: 40 },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.xs, marginTop: Spacing.sm },
  ingRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  row: { flexDirection: 'row', gap: Spacing.xs },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.sm, fontSize: FontSize.sm, color: Colors.textPrimary, marginBottom: Spacing.xs, backgroundColor: Colors.white },
  addIngBtn: { borderWidth: 1, borderColor: Colors.primary, borderRadius: Radius.sm, padding: Spacing.sm, alignItems: 'center', marginBottom: Spacing.sm, borderStyle: 'dashed' },
  addIngText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  calcBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  calcBtnText: { color: Colors.white, fontSize: FontSize.base, fontWeight: '600' },
  marginBtns: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.xs },
  marginBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: 6, alignItems: 'center' },
  marginBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  marginBtnText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  marginBtnTextActive: { color: Colors.white, fontWeight: '600' },
  resultBox: { backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.md, elevation: 1 },
  resultTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  resultLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  resultValue: { fontSize: FontSize.sm, color: Colors.textPrimary },
  divider: { height: 0.5, backgroundColor: Colors.border, marginVertical: Spacing.xs },
  recLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  skenarioRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, alignItems: 'center' },
  skenarioLabel: { fontSize: FontSize.sm, color: Colors.textPrimary, flex: 1 },
  skenarioQty: { fontSize: FontSize.xs, color: Colors.textSecondary, flex: 1, textAlign: 'center' },
  skenarioProfit: { fontSize: FontSize.sm, fontWeight: '600', flex: 1, textAlign: 'right' },
});
