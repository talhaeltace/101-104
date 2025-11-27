import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

export async function saveAndShareFile(filename: string, base64Data: string) {
  const path = `exports/${filename}`;
  // write file to cache directory
  await Filesystem.writeFile({
    path,
    data: base64Data,
    directory: Directory.Cache,
    recursive: true
  });

  const uri = (await Filesystem.getUri({ directory: Directory.Cache, path })).uri;
  // Share the file using native share sheet
  await Share.share({
    title: filename,
    text: filename,
    url: uri
  });
}

export async function saveArrayBufferAndShare(filename: string, buffer: ArrayBuffer) {
  const base64 = arrayBufferToBase64(buffer);
  return saveAndShareFile(filename, base64);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
