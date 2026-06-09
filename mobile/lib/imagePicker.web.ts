export type PickImageResult = { uri: string } | null;

export async function pickImageFromGallery(): Promise<PickImageResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (ev) => resolve({ uri: ev.target?.result as string });
      reader.readAsDataURL(file);
    };
    // Resolve null if dialog is closed without selection
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
