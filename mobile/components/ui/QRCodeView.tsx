import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import qrcode from 'qrcode-generator';

interface Props {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
}

interface Segment { dark: boolean; span: number }

/**
 * Render QR code murni pakai View (tanpa react-native-svg, jadi tidak
 * perlu rebuild dev client). Modul yang bersebelahan dan sewarna digabung
 * jadi satu View agar jumlah elemen tetap kecil.
 */
export default function QRCodeView({
  value,
  size = 220,
  color = '#111827',
  backgroundColor = '#FFFFFF',
}: Props) {
  const { rows, moduleCount } = useMemo(() => {
    const qr = qrcode(0, 'M'); // 0 = ukuran otomatis, koreksi error Medium
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const result: Segment[][] = [];
    for (let r = 0; r < n; r++) {
      const segs: Segment[] = [];
      let c = 0;
      while (c < n) {
        const dark = qr.isDark(r, c);
        let span = 1;
        while (c + span < n && qr.isDark(r, c + span) === dark) span++;
        segs.push({ dark, span });
        c += span;
      }
      result.push(segs);
    }
    return { rows: result, moduleCount: n };
  }, [value]);

  const cell = size / moduleCount;

  return (
    <View style={[styles.wrap, { backgroundColor, padding: cell * 2 }]}>
      <View style={{ width: size, height: size }}>
        {rows.map((segs, r) => (
          <View key={r} style={{ flexDirection: 'row', height: cell }}>
            {segs.map((s, i) => (
              <View
                key={i}
                style={{
                  width: s.span * cell,
                  height: cell,
                  backgroundColor: s.dark ? color : 'transparent',
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, alignSelf: 'center' },
});
