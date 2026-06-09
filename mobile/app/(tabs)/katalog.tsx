import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Modal, ScrollView, Switch, Alert, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pickImageFromGallery } from '../../lib/imagePicker';
import { useRouter } from 'expo-router';
import { useMenuStore, Menu } from '../../stores/menuStore';
import { useCartStore } from '../../stores/cartStore';
import { formatRupiah } from '../../lib/hpp-calculator';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

type Mode = 'order' | 'kelola';

const EMPTY_FORM = {
  name: '',
  categoryId: '',
  sellPrice: '',
  hpp: '',
  stock: '',
  isActive: true,
  imageUri: '',
};

// Category visual config — ikon & warna tiap kategori
const CAT_STYLE: Record<string, { icon: any; bg: string; iconColor: string; accent: string }> = {
  'cat-1': { icon: 'restaurant',  bg: '#FFF3E8', iconColor: '#D4631A', accent: '#E8691A' },
  'cat-2': { icon: 'fast-food',   bg: '#F0FBF0', iconColor: '#2D7A2D', accent: '#38A438' },
  'cat-3': { icon: 'cafe',        bg: '#EBF4FF', iconColor: '#1A6BB0', accent: '#1E7DD0' },
  'cat-4': { icon: 'ice-cream',   bg: '#FFF0F6', iconColor: '#B02480', accent: '#C72B90' },
};
const DEFAULT_CAT = { icon: 'restaurant' as any, bg: Colors.primaryLight, iconColor: Colors.primary, accent: Colors.primary };

function getCatStyle(catId: string) {
  return CAT_STYLE[catId] ?? DEFAULT_CAT;
}

function marginColor(pct: number) {
  if (pct >= 40) return Colors.primary;
  if (pct >= 20) return Colors.amber;
  return Colors.danger;
}

export default function KatalogScreen() {
  const router = useRouter();
  const { menus, categories, loading, fetchMenus, fetchCategories, createMenu, updateMenu, toggleActive } = useMenuStore();
  const { addItem, updateQty, removeItem, items } = useCartStore();
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('');
  const [mode, setMode] = useState<Mode>('order');
  const [showForm, setShowForm] = useState(false);
  const [editMenu, setEditMenu] = useState<Menu | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMenus();
    fetchCategories();
  }, []);

  const filtered = menus.filter(
    (m) =>
      (mode === 'order' ? m.isActive : true) &&
      (selectedCat === '' || m.categoryId === selectedCat) &&
      m.name.toLowerCase().includes(search.toLowerCase())
  );

  const cartCount = items.reduce((s, i) => s + i.qty, 0);
  const cartTotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  function openAdd() {
    setEditMenu(null);
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id ?? '' });
    setShowForm(true);
  }

  function openEdit(menu: Menu) {
    setEditMenu(menu);
    setForm({
      name: menu.name,
      categoryId: menu.categoryId,
      sellPrice: String(menu.sellPrice),
      hpp: String(menu.hpp),
      stock: String(menu.stock),
      isActive: menu.isActive,
      imageUri: menu.imageUri ?? '',
    });
    setShowForm(true);
  }

  async function pickImage() {
    const result = await pickImageFromGallery();
    if (result) {
      setForm((prev) => ({ ...prev, imageUri: result.uri }));
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert('Nama menu wajib diisi'); return; }
    if (!form.categoryId) { Alert.alert('Pilih kategori'); return; }
    if (!form.sellPrice) { Alert.alert('Harga jual wajib diisi'); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        sellPrice: parseFloat(form.sellPrice) || 0,
        hpp: parseFloat(form.hpp) || 0,
        stock: parseInt(form.stock) || 0,
        isActive: form.isActive,
        imageUri: form.imageUri || undefined,
      };
      if (editMenu) {
        await updateMenu({ ...editMenu, ...data });
      } else {
        await createMenu(data);
      }
      setShowForm(false);
    } catch (e: any) {
      Alert.alert('Gagal Menyimpan', e?.message ?? 'Terjadi kesalahan. Cek koneksi dan coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '-';

  const margin =
    form.sellPrice && form.hpp && parseFloat(form.sellPrice) > 0
      ? (((parseFloat(form.sellPrice) - parseFloat(form.hpp)) / parseFloat(form.sellPrice)) * 100).toFixed(1)
      : null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
        <Text style={styles.loadingText}>Memuat katalog...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari menu..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={Colors.textMuted}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.modeBtn, mode === 'kelola' && styles.modeBtnActive]}
          onPress={() => setMode(mode === 'order' ? 'kelola' : 'order')}
        >
          <Ionicons
            name={mode === 'kelola' ? 'storefront' : 'settings-outline'}
            size={18}
            color={mode === 'kelola' ? Colors.white : Colors.textSecondary}
          />
        </TouchableOpacity>

        {mode === 'order' && (
          <TouchableOpacity style={styles.cartBtn} onPress={() => router.push('/order/cart')}>
            <Ionicons name="cart" size={22} color={Colors.white} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* ── Mode Banner ─────────────────────────────────── */}
      {mode === 'kelola' && (
        <View style={styles.modeBanner}>
          <Ionicons name="information-circle" size={14} color={Colors.amber} />
          <Text style={styles.modeBannerText}>Mode Kelola — termasuk menu nonaktif</Text>
        </View>
      )}

      {/* ── Kategori Filter ─────────────────────────────── */}
      <View style={styles.catWrap}>
        <FlatList
          horizontal
          data={[{ id: '', name: 'Semua' }, ...categories]}
          keyExtractor={(c) => c.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catList}
          renderItem={({ item }) => {
            const cs = item.id ? getCatStyle(item.id) : null;
            const active = selectedCat === item.id;
            return (
              <TouchableOpacity
                style={[
                  styles.catChip,
                  active && { backgroundColor: cs?.accent ?? Colors.primary, borderColor: cs?.accent ?? Colors.primary },
                ]}
                onPress={() => setSelectedCat(item.id)}
              >
                {cs && (
                  <Ionicons
                    name={cs.icon}
                    size={13}
                    color={active ? Colors.white : cs.iconColor}
                  />
                )}
                <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* ── Menu Grid (order mode) ───────────────────────── */}
      {mode === 'order' ? (
        <>
          <FlatList
            key="order-grid"
            data={filtered}
            keyExtractor={(m) => m.id}
            numColumns={2}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item }) => <MenuCard menu={item} categories={categories} items={items} addItem={addItem} updateQty={updateQty} removeItem={removeItem} />}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="restaurant-outline" size={48} color={Colors.border} />
                <Text style={styles.emptyTitle}>Menu tidak ditemukan</Text>
                <Text style={styles.emptyDesc}>Coba ganti kata kunci atau kategori</Text>
              </View>
            }
          />
          {/* Cart Floating Summary */}
          {cartCount > 0 && (
            <TouchableOpacity style={styles.cartSummary} onPress={() => router.push('/order/cart')}>
              <View style={styles.cartSummaryLeft}>
                <View style={styles.cartCountBadge}>
                  <Text style={styles.cartCountText}>{cartCount}</Text>
                </View>
                <Text style={styles.cartSummaryText}>Lihat Keranjang</Text>
              </View>
              <Text style={styles.cartSummaryTotal}>{formatRupiah(cartTotal)}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        /* ── List Mode Kelola ─────────────────────────── */
        <>
          <FlatList
            key="kelola-list"
            data={filtered}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.manageList}
            renderItem={({ item }) => {
              const cs = getCatStyle(item.categoryId);
              const marginPct = item.sellPrice > 0 && item.hpp > 0
                ? ((item.sellPrice - item.hpp) / item.sellPrice * 100)
                : 0;
              return (
                <View style={[styles.manageCard, !item.isActive && styles.manageCardInactive]}>
                  <View style={[styles.manageIconBox, { backgroundColor: cs.bg }]}>
                    {item.imageUri ? (
                      <Image source={{ uri: item.imageUri }} style={styles.manageThumb} resizeMode="cover" />
                    ) : (
                      <Ionicons name={cs.icon} size={22} color={item.isActive ? cs.iconColor : Colors.textMuted} />
                    )}
                  </View>
                  <View style={styles.manageInfo}>
                    <Text style={[styles.manageName, !item.isActive && { color: Colors.textMuted }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.manageMeta}>{catName(item.categoryId)} · Stok: {item.stock}</Text>
                    <View style={styles.managePriceRow}>
                      <Text style={styles.managePrice}>{formatRupiah(item.sellPrice)}</Text>
                      {marginPct > 0 && (
                        <View style={[styles.marginTag, { backgroundColor: marginColor(marginPct) + '18' }]}>
                          <Text style={[styles.marginTagText, { color: marginColor(marginPct) }]}>
                            {marginPct.toFixed(0)}%
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.manageActions}>
                    {!item.isActive && (
                      <View style={styles.inactiveBadge}>
                        <Text style={styles.inactiveBadgeText}>Nonaktif</Text>
                      </View>
                    )}
                    <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
                      <Ionicons name="pencil-outline" size={19} color={Colors.info} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleActive(item.id)} style={styles.iconBtn}>
                      <Ionicons
                        name={item.isActive ? 'eye-outline' : 'eye-off-outline'}
                        size={19}
                        color={item.isActive ? Colors.primary : Colors.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="restaurant-outline" size={48} color={Colors.border} />
                <Text style={styles.emptyTitle}>Belum ada menu</Text>
                <Text style={styles.emptyDesc}>Ketuk tombol + untuk tambah menu pertama</Text>
              </View>
            }
          />

          <TouchableOpacity style={styles.fab} onPress={openAdd}>
            <Ionicons name="add" size={28} color={Colors.white} />
          </TouchableOpacity>
        </>
      )}

      {/* ── Modal Tambah / Edit ─────────────────────────── */}
      <Modal visible={showForm} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{editMenu ? 'Edit Menu' : 'Tambah Menu'}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Foto Menu</Text>
              <TouchableOpacity style={styles.imgPicker} onPress={pickImage}>
                {form.imageUri ? (
                  <>
                    <Image source={{ uri: form.imageUri }} style={styles.imgPickerPreview} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.imgRemoveBtn}
                      onPress={() => setForm((prev) => ({ ...prev, imageUri: '' }))}
                    >
                      <Ionicons name="close-circle" size={24} color={Colors.danger} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={32} color={Colors.textMuted} />
                    <Text style={styles.imgPickerHint}>Ketuk untuk pilih foto dari galeri</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.label}>Nama Menu *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                placeholder="cth. Nasi Goreng Spesial"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.label}>Kategori *</Text>
              {categories.length === 0 ? (
                <View style={styles.catEmpty}>
                  <Ionicons name="warning-outline" size={14} color={Colors.amber} />
                  <Text style={styles.catEmptyText}>Kategori belum tersedia.</Text>
                </View>
              ) : (
                <View style={styles.catPicker}>
                  {categories.map((c) => {
                    const cs = getCatStyle(c.id);
                    const active = form.categoryId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.catPickerChip, active && { backgroundColor: cs.accent, borderColor: cs.accent }]}
                        onPress={() => setForm({ ...form, categoryId: c.id })}
                      >
                        <Ionicons name={cs.icon} size={13} color={active ? Colors.white : cs.iconColor} />
                        <Text style={[styles.catPickerText, active && styles.catPickerTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <Text style={styles.label}>Harga Jual (Rp) *</Text>
              <TextInput
                style={styles.input}
                value={form.sellPrice}
                onChangeText={(v) => setForm({ ...form, sellPrice: v })}
                keyboardType="numeric"
                placeholder="cth. 15000"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.label}>HPP / Harga Modal (Rp)</Text>
              <TextInput
                style={styles.input}
                value={form.hpp}
                onChangeText={(v) => setForm({ ...form, hpp: v })}
                keyboardType="numeric"
                placeholder="cth. 8000 (opsional)"
                placeholderTextColor={Colors.textMuted}
              />

              {margin !== null && (
                <View style={[styles.marginBox, { backgroundColor: marginColor(parseFloat(margin)) + '15' }]}>
                  <Ionicons name="trending-up" size={14} color={marginColor(parseFloat(margin))} />
                  <Text style={[styles.marginText, { color: marginColor(parseFloat(margin)) }]}>
                    Margin: {margin}%
                  </Text>
                </View>
              )}

              <Text style={styles.label}>Stok Awal</Text>
              <TextInput
                style={styles.input}
                value={form.stock}
                onChangeText={(v) => setForm({ ...form, stock: v })}
                keyboardType="numeric"
                placeholder="cth. 50"
                placeholderTextColor={Colors.textMuted}
              />

              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.label}>Menu Aktif</Text>
                  <Text style={styles.switchHint}>Menu nonaktif tidak muncul di katalog</Text>
                </View>
                <Switch
                  value={form.isActive}
                  onValueChange={(v) => setForm({ ...form, isActive: v })}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor={Colors.white}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={styles.saveBtnText}>{editMenu ? 'Simpan Perubahan' : 'Tambah Menu'}</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Menu Card Component ──────────────────────────────────────────────────────

interface MenuCardProps {
  menu: Menu;
  categories: { id: string; name: string }[];
  items: { menuId: string; qty: number }[];
  addItem: (item: { menuId: string; name: string; price: number }) => void;
  updateQty: (menuId: string, qty: number) => void;
  removeItem: (menuId: string) => void;
}

function MenuCard({ menu, categories, items, addItem, updateQty, removeItem }: MenuCardProps) {
  const cs = getCatStyle(menu.categoryId);
  const catName = categories.find((c) => c.id === menu.categoryId)?.name ?? '';
  const inCart = items.find((i) => i.menuId === menu.id)?.qty ?? 0;
  const isOut = menu.stock === 0;
  const isLow = menu.stock > 0 && menu.stock <= 10;
  const marginPct = menu.sellPrice > 0 && menu.hpp > 0
    ? ((menu.sellPrice - menu.hpp) / menu.sellPrice * 100)
    : 0;

  return (
    <View style={[cardS.card, isOut && cardS.cardOut]}>
      {/* ── Top visual section ─── */}
      <View style={[cardS.topBg, { backgroundColor: cs.bg }]}>
        {menu.imageUri ? (
          <Image source={{ uri: menu.imageUri }} style={cardS.topImg} resizeMode="cover" />
        ) : (
          <Ionicons name={cs.icon} size={36} color={isOut ? Colors.textMuted : cs.iconColor} />
        )}
        {isOut && (
          <View style={cardS.outOverlay}>
            <Text style={cardS.outText}>HABIS</Text>
          </View>
        )}
        {isLow && !isOut && (
          <View style={[cardS.stockBadge, { backgroundColor: Colors.amberLight }]}>
            <Text style={[cardS.stockBadgeText, { color: Colors.amber }]}>Stok {menu.stock}</Text>
          </View>
        )}
        {inCart > 0 && (
          <View style={cardS.cartDot}>
            <Text style={cardS.cartDotText}>{inCart}</Text>
          </View>
        )}
      </View>

      {/* ── Info ─── */}
      <View style={cardS.body}>
        <View style={[cardS.catTag, { backgroundColor: cs.bg }]}>
          <Text style={[cardS.catTagText, { color: cs.iconColor }]} numberOfLines={1}>{catName}</Text>
        </View>
        <Text style={cardS.name} numberOfLines={2}>{menu.name}</Text>
        <View style={cardS.priceRow}>
          <Text style={[cardS.price, isOut && { color: Colors.textMuted }]}>{formatRupiah(menu.sellPrice)}</Text>
          {marginPct >= 5 && !isOut && (
            <View style={[cardS.marginBadge, { backgroundColor: marginColor(marginPct) + '15' }]}>
              <Text style={[cardS.marginBadgeText, { color: marginColor(marginPct) }]}>
                {marginPct.toFixed(0)}%
              </Text>
            </View>
          )}
        </View>

        {/* ── Qty Control / Tambah Button ─── */}
        {inCart > 0 ? (
          <View style={cardS.qtyRow}>
            <TouchableOpacity
              style={[cardS.qtyBtn, { backgroundColor: inCart === 1 ? Colors.dangerLight : Colors.primaryLight }]}
              onPress={() => inCart === 1 ? removeItem(menu.id) : updateQty(menu.id, inCart - 1)}
            >
              <Ionicons
                name={inCart === 1 ? 'trash-outline' : 'remove'}
                size={16}
                color={inCart === 1 ? Colors.danger : Colors.primary}
              />
            </TouchableOpacity>
            <Text style={cardS.qtyNum}>{inCart}</Text>
            <TouchableOpacity
              style={[cardS.qtyBtn, { backgroundColor: Colors.primaryLight }]}
              onPress={() => updateQty(menu.id, inCart + 1)}
            >
              <Ionicons name="add" size={16} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[cardS.addBtn, isOut && cardS.addBtnDisabled]}
            onPress={() => !isOut && addItem({ menuId: menu.id, name: menu.name, price: menu.sellPrice })}
            disabled={isOut}
          >
            {isOut
              ? <Text style={cardS.addBtnTextDisabled}>Tidak tersedia</Text>
              : <>
                  <Ionicons name="add-circle" size={14} color={Colors.white} />
                  <Text style={cardS.addBtnText}>Tambah</Text>
                </>
            }
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const isWeb = Platform.OS === 'web';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: FontSize.sm, color: Colors.textMuted },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    gap: Spacing.sm, backgroundColor: Colors.primary,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full, paddingHorizontal: 12, gap: 6,
  },
  searchInput: {
    flex: 1, fontSize: FontSize.sm, color: Colors.white,
    paddingVertical: 9,
  },
  modeBtn: {
    width: 38, height: 38, borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  modeBtnActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  cartBtn: {
    width: 38, height: 38, borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  cartBadge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: Colors.danger, borderRadius: 8,
    width: 17, height: 17, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.primary,
  },
  cartBadgeText: { color: Colors.white, fontSize: 9, fontWeight: '800' },

  /* Mode Banner */
  modeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.amberLight,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
  },
  modeBannerText: { fontSize: FontSize.xs, color: Colors.amber, fontWeight: '600' },

  /* Category filter */
  catWrap: { backgroundColor: Colors.white, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
  catList: { paddingHorizontal: Spacing.md, paddingVertical: 10, gap: 6 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  catChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },
  catChipTextActive: { color: Colors.white, fontWeight: '700' },

  /* Grid */
  grid: { padding: Spacing.sm, paddingBottom: 100 },
  gridRow: { gap: Spacing.sm },

  /* Kelola list */
  manageList: { padding: Spacing.md, paddingBottom: 100 },
  manageCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    gap: Spacing.sm,
  },
  manageCardInactive: { opacity: 0.55 },
  manageIconBox: { width: 48, height: 48, borderRadius: Radius.sm, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  manageInfo: { flex: 1 },
  manageName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  manageMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  managePriceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  managePrice: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '700' },
  marginTag: { borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  marginTagText: { fontSize: 10, fontWeight: '700' },
  manageActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inactiveBadge: { backgroundColor: Colors.background, borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 3 },
  inactiveBadgeText: { fontSize: FontSize.xs, color: Colors.textMuted },
  iconBtn: { padding: 6 },

  /* FAB */
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    elevation: 8, shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },

  /* Cart floating summary */
  cartSummary: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    elevation: 8, shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  cartSummaryLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cartCountBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  cartCountText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '800' },
  cartSummaryText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: '600' },
  cartSummaryTotal: { color: Colors.white, fontSize: FontSize.base, fontWeight: '800' },

  /* Empty */
  emptyWrap: { flex: 1, alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: FontSize.base, fontWeight: '600', color: Colors.textSecondary },
  emptyDesc: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

  /* Modal / Sheet */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.md, maxHeight: '94%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.md,
  },
  sheetTitle: { fontSize: FontSize.md, fontWeight: '800', color: Colors.textPrimary },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center',
  },

  /* Image picker */
  imgPicker: {
    height: 130, borderRadius: Radius.sm, borderWidth: 1.5,
    borderColor: Colors.border, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', gap: 6,
    backgroundColor: Colors.background, overflow: 'hidden',
    position: 'relative',
  },
  imgPickerPreview: { width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 },
  imgPickerHint: { fontSize: FontSize.xs, color: Colors.textMuted },
  imgRemoveBtn: { position: 'absolute', top: 6, right: 6 },
  manageThumb: { width: 48, height: 48, borderRadius: Radius.sm },

  /* Form */
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.md, marginBottom: 4 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 11,
    fontSize: FontSize.base, color: Colors.textPrimary, backgroundColor: Colors.white,
  },
  catEmpty: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.amberLight, padding: Spacing.sm, borderRadius: Radius.sm,
  },
  catEmptyText: { flex: 1, fontSize: FontSize.xs, color: Colors.amber },
  catPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  catPickerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.sm, paddingVertical: 7,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border,
  },
  catPickerText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  catPickerTextActive: { color: Colors.white, fontWeight: '700' },
  marginBox: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, alignSelf: 'flex-start',
  },
  marginText: { fontSize: FontSize.sm, fontWeight: '700' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md },
  switchHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    padding: Spacing.md, alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.lg, marginBottom: Spacing.xl, flexDirection: 'row', gap: 6,
  },
  saveBtnText: { color: Colors.white, fontSize: FontSize.base, fontWeight: '700' },
});

const cardS = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardOut: { opacity: 0.7 },

  /* Top visual */
  topBg: {
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  topImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  outOverlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  outText: {
    fontSize: FontSize.sm, fontWeight: '800',
    color: Colors.textMuted, letterSpacing: 1,
  },
  stockBadge: {
    position: 'absolute', top: 6, right: 6,
    borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2,
  },
  stockBadgeText: { fontSize: 10, fontWeight: '700' },
  cartDot: {
    position: 'absolute', top: 6, left: 6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  cartDotText: { color: Colors.white, fontSize: 11, fontWeight: '800' },

  /* Body */
  body: { padding: 10, gap: 4 },
  catTag: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 7, paddingVertical: 2 },
  catTagText: { fontSize: 10, fontWeight: '600' },
  name: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary, lineHeight: 18 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  price: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '800' },
  marginBadge: { borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  marginBadgeText: { fontSize: 10, fontWeight: '700' },

  /* Qty control */
  qtyRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 6,
  },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  qtyNum: {
    fontSize: FontSize.md, fontWeight: '800',
    color: Colors.textPrimary, minWidth: 28, textAlign: 'center',
  },

  /* Add button */
  addBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.sm,
    paddingVertical: 8, marginTop: 6,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4,
  },
  addBtnDisabled: { backgroundColor: Colors.background },
  addBtnText: { color: Colors.white, fontSize: FontSize.xs, fontWeight: '700' },
  addBtnTextDisabled: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },
});
