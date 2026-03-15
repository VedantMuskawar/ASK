import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type FieldValue,
  type Timestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firestore-users';

export const PRODUCTS_COLLECTION = 'PRODUCTS';

export interface ProductRecord {
  name: string;
  category: string;
  baseUnit: string;
  unitPrice: number;
  commission: number;
  images: string[] | Record<string, string>;
  created_at: Timestamp | FieldValue;
  updated_at: Timestamp | FieldValue;
  isActive: boolean;
  vendorID: string;
}

export interface ProductDoc extends Omit<ProductRecord, 'created_at' | 'updated_at'> {
  productID: string;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

export interface ProductInput {
  name: string;
  category: string;
  baseUnit: string;
  unitPrice: number;
  commission: number;
  images: string[];
  isActive: boolean;
  vendorID: string;
}

function normalizeProductRecord(data: Partial<ProductRecord>, productID: string): ProductDoc {
  return {
    productID,
    name: String(data.name ?? ''),
    category: String(data.category ?? ''),
    baseUnit: String(data.baseUnit ?? ''),
    unitPrice: Number(data.unitPrice ?? 0),
    commission: Number(data.commission ?? 0),
    images: Array.isArray(data.images) ? data.images : [],
    created_at: (data.created_at as Timestamp | null) ?? null,
    updated_at: (data.updated_at as Timestamp | null) ?? null,
    isActive: Boolean(data.isActive),
    vendorID: String(data.vendorID ?? ''),
  };
}

export function subscribeProducts(
  onData: (products: ProductDoc[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, PRODUCTS_COLLECTION),
    (snapshot) => {
      const products = snapshot.docs.map((item) => {
        const data = item.data() as Partial<ProductRecord>;
        return normalizeProductRecord(data, item.id);
      });
      onData(products);
    },
    (error) => {
      onError?.(error as Error);
    },
  );
}

export async function createProduct(input: ProductInput): Promise<void> {
  await addDoc(collection(db, PRODUCTS_COLLECTION), {
    ...input,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

export async function updateProduct(productID: string, input: ProductInput): Promise<void> {
  await updateDoc(doc(db, PRODUCTS_COLLECTION, productID), {
    ...input,
    updated_at: serverTimestamp(),
  });
}

export async function deleteProduct(productID: string): Promise<void> {
  await deleteDoc(doc(db, PRODUCTS_COLLECTION, productID));
}

export async function updateProductActive(productID: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, PRODUCTS_COLLECTION, productID), {
    isActive,
    updated_at: serverTimestamp(),
  });
}
