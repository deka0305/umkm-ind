import * as ExpoImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';

export type PickImageResult = { uri: string } | null;

export async function pickImageFromGallery(): Promise<PickImageResult> {
  if (Platform.OS !== 'web') {
    const { status } = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Izin Diperlukan', 'Izin akses galeri diperlukan untuk memilih foto menu.');
      return null;
    }
  }
  const result = await ExpoImagePicker.launchImageLibraryAsync({
    mediaTypes: ExpoImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.7,
  });
  if (!result.canceled && result.assets[0]) {
    return { uri: result.assets[0].uri };
  }
  return null;
}

/** Konversi URI lokal ke Blob untuk upload. Mendukung data: dan blob: URI. */
async function uriBlobWeb(localUri: string): Promise<Blob> {
  if (localUri.startsWith('data:')) {
    // Parse data URI langsung — tidak perlu fetch, lebih cepat dan tidak hang
    const commaIdx = localUri.indexOf(',');
    const meta = localUri.slice(0, commaIdx);           // "data:image/jpeg;base64"
    const base64 = localUri.slice(commaIdx + 1);
    const mime = meta.split(':')[1]?.split(';')[0] ?? 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  // blob: URL — fetch dengan timeout 6 detik supaya tidak hang selamanya
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(localUri, { signal: controller.signal });
    return await response.blob();
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Upload gambar lokal ke Supabase Storage, return public URL atau null jika gagal. */
export async function uploadMenuImage(localUri: string, menuId: string): Promise<string | null> {
  try {
    // Deteksi ekstensi dari URI; data: dan blob: URI → pakai jpg sebagai default
    const uriForExt = localUri.startsWith('data:')
      ? localUri.split(';')[0].split('/')[1]   // "data:image/jpeg;..." → "jpeg"
      : localUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg';
    const ext = uriForExt === 'png' ? 'png' : 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const path = `menu-images/${menuId}.${ext}`;

    let fileData: Blob | Uint8Array;

    if (Platform.OS === 'web') {
      fileData = await uriBlobWeb(localUri);
    } else {
      // Native: fetch tidak support file:// URI — pakai expo-file-system
      const FileSystem = await import('expo-file-system');
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      fileData = bytes;
    }

    const { error } = await supabase.storage
      .from('menu-images')
      .upload(path, fileData, { upsert: true, contentType: mimeType });

    if (error) {
      console.warn('[uploadMenuImage]', error.message);
      return null;
    }

    const { data } = supabase.storage.from('menu-images').getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.warn('[uploadMenuImage] error:', e);
    return null;
  }
}
