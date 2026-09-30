import { Platform, View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useSessionStore, useIsOwner } from '../../stores/sessionStore';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

const TABS = [
  { name: 'index',   title: 'Dashboard', icon: 'grid'       },
  { name: 'katalog', title: 'Katalog',   icon: 'restaurant' },
  { name: 'stok',    title: 'Stok',      icon: 'layers'     },
  { name: 'hpp',     title: 'HPP',       icon: 'calculator', ownerOnly: true },
  { name: 'laporan', title: 'Laporan',   icon: 'bar-chart',  ownerOnly: true },
] as const;

const isWeb = Platform.OS === 'web';

/** Petugas yang sedang login + tombol ganti petugas. */
function PetugasBadge() {
  const { petugas, logout } = useSessionStore();
  if (!petugas) return null;
  return (
    <TouchableOpacity
      style={s.petugas}
      onPress={() => Alert.alert('Ganti petugas?', `Saat ini: ${petugas.name}`, [
        { text: 'Batal', style: 'cancel' },
        { text: 'Keluar', onPress: () => { logout(); } },
      ])}
    >
      <Ionicons name={petugas.role === 'owner' ? 'shield-checkmark' : 'person-circle'} size={16} color={Colors.primary} />
      <Text style={s.petugasText} numberOfLines={1}>{petugas.name}</Text>
      <Ionicons name="swap-horizontal" size={13} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}
const SIDEBAR_W = 224;

/** Tab yang boleh dilihat petugas yang sedang login. */
function useVisibleTab() {
  const isOwner = useIsOwner();
  return (routeName: string) => {
    const tab = TABS.find((t) => t.name === routeName);
    return tab && (isOwner || !('ownerOnly' in tab)) ? tab : null;
  };
}

function WebSidebar({ state, navigation }: any) {
  const visibleTab = useVisibleTab();
  return (
    <View style={s.sidebar}>
      {/* Brand */}
      <View style={s.brand}>
        <View style={s.brandIcon}>
          <Ionicons name="storefront" size={20} color={Colors.white} />
        </View>
        <View>
          <Text style={s.brandName}>UMKM Pro</Text>
          <Text style={s.brandSub}>Manajemen Bisnis</Text>
        </View>
      </View>
      <View style={s.divider} />

      {/* Nav items */}
      {state.routes.map((route: any, i: number) => {
        const tab = visibleTab(route.name);
        if (!tab) return null;
        const focused = state.index === i;
        return (
          <TouchableOpacity
            key={route.key}
            style={[s.navItem, focused && s.navItemActive]}
            onPress={() => navigation.navigate(route.name)}
          >
            <View style={[s.navIconWrap, focused && s.navIconActive]}>
              <Ionicons
                name={(focused ? tab.icon : `${tab.icon}-outline`) as any}
                size={18}
                color={focused ? Colors.white : Colors.textSecondary}
              />
            </View>
            <Text style={[s.navLabel, focused && s.navLabelActive]}>{tab.title}</Text>
          </TouchableOpacity>
        );
      })}

      {/* Footer */}
      <View style={{ flex: 1 }} />
      <PetugasBadge />
      <View style={s.sidebarFooter}>
        <Ionicons name="leaf-outline" size={14} color={Colors.textMuted} />
        <Text style={s.footerText}>v1.0.0</Text>
      </View>
    </View>
  );
}

function MobileTabBar({ state, navigation }: any) {
  const visibleTab = useVisibleTab();
  return (
    <View style={s.tabBar}>
      {state.routes.map((route: any, i: number) => {
        const tab = visibleTab(route.name);
        if (!tab) return null;
        const focused = state.index === i;
        return (
          <TouchableOpacity
            key={route.key}
            style={s.tabItem}
            onPress={() => navigation.navigate(route.name)}
          >
            <View style={[s.tabIconWrap, focused && s.tabIconActive]}>
              <Ionicons
                name={(focused ? tab.icon : `${tab.icon}-outline`) as any}
                size={20}
                color={focused ? Colors.white : Colors.textMuted}
              />
            </View>
            <Text style={[s.tabLabel, focused && s.tabLabelFocused]}>
              {tab.title}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => isWeb ? <WebSidebar {...props} /> : <MobileTabBar {...props} />}
      sceneContainerStyle={isWeb ? { marginLeft: SIDEBAR_W } : undefined}
      screenOptions={{
        headerShown: !isWeb,
        headerStyle: { backgroundColor: Colors.white },
        headerTitleStyle: { fontWeight: '700', color: Colors.textPrimary, fontSize: FontSize.base },
        headerShadowVisible: false,
        headerRight: () => <PetugasBadge />,
      }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="katalog" options={{ title: 'Menu' }} />
      <Tabs.Screen name="stok"    options={{ title: 'Manajemen Stok' }} />
      <Tabs.Screen name="hpp"     options={{ title: 'Kalkulator HPP' }} />
      <Tabs.Screen name="laporan" options={{ title: 'Laporan' }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  petugas: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 170,
    paddingHorizontal: 10, paddingVertical: 6, marginHorizontal: 12,
    borderRadius: Radius.sm, backgroundColor: Colors.primaryLight,
  },
  petugasText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
  /* ── Web Sidebar ─────────────────────────── */
  sidebar: {
    position: 'fixed' as any,
    left: 0, top: 0, bottom: 0,
    width: SIDEBAR_W,
    backgroundColor: Colors.white,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.md },
  brandIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  brandName: { fontSize: FontSize.base, fontWeight: '800', color: Colors.textPrimary },
  brandSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: Colors.border, marginBottom: Spacing.sm },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: Radius.sm, marginBottom: 2,
  },
  navItemActive: { backgroundColor: Colors.primaryLight },
  navIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  navIconActive: { backgroundColor: Colors.primary },
  navLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  navLabelActive: { color: Colors.primary, fontWeight: '700' },
  sidebarFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: Spacing.sm },
  footerText: { fontSize: FontSize.xs, color: Colors.textMuted },

  /* ── Mobile Tab Bar ───────────────────────── */
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
    paddingBottom: 12,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 3 },
  tabIconWrap: {
    width: 44, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  tabIconActive: { backgroundColor: Colors.primary },
  tabLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '500' },
  tabLabelFocused: { color: Colors.primary, fontWeight: '700' },
});
