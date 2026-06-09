import * as ExpoImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

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
