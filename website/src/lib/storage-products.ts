import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

import { firebaseApp } from '@/lib/firebase';

const storage = getStorage(firebaseApp);

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadProductImage(file: File): Promise<string> {
  const safeName = sanitizeFileName(file.name || 'product-image');
  const uniqueName = `${Date.now()}-${safeName}`;
  const imageRef = ref(storage, `PRODUCTS/${uniqueName}`);

  await uploadBytes(imageRef, file, {
    contentType: file.type || 'image/jpeg',
  });

  return getDownloadURL(imageRef);
}
