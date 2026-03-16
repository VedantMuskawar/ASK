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
  productType?: string;
  unitsCsv?: string;
  productAttributes?: Record<string, unknown>;
  baseUnit: string;
  unitPrice: number;
  commission: number;
  lead_time_days: number;
  perKmPerUnit?: number;
  per_km_delivery_price: number;
  min_deliverable_quantity: number;
  max_deliverable_quantity: number;
  adminVerificationStatus: 'pending' | 'approved' | 'rejected';
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
  productType?: string;
  unitsCsv?: string;
  productAttributes?: Record<string, unknown>;
  baseUnit: string;
  unitPrice: number;
  commission: number;
  lead_time_days: number;
  perKmPerUnit?: number;
  per_km_delivery_price: number;
  min_deliverable_quantity: number;
  max_deliverable_quantity: number;
  adminVerificationStatus: 'pending' | 'approved' | 'rejected';
  images: string[];
  isActive: boolean;
  vendorID: string;
}

function normalizeProductRecord(data: Partial<ProductRecord>, productID: string): ProductDoc {
  const normalizedUnitsCsv = String(data.unitsCsv ?? data.baseUnit ?? '');
  const normalizedBaseUnit = String(data.baseUnit ?? normalizedUnitsCsv.split(',')[0] ?? '').trim();

  return {
    productID,
    name: String(data.name ?? ''),
    category: String(data.category ?? ''),
    productType: String(data.productType ?? 'custom'),
    unitsCsv: normalizedUnitsCsv,
    productAttributes:
      data.productAttributes && typeof data.productAttributes === 'object' && !Array.isArray(data.productAttributes)
        ? data.productAttributes
        : {},
    baseUnit: normalizedBaseUnit,
    unitPrice: Number(data.unitPrice ?? 0),
    commission: Number(data.commission ?? 0),
    lead_time_days: Number(data.lead_time_days ?? 0),
    per_km_delivery_price: Number(data.perKmPerUnit ?? data.per_km_delivery_price ?? 0),
    perKmPerUnit: Number(data.perKmPerUnit ?? data.per_km_delivery_price ?? 0),
    min_deliverable_quantity: Number(data.min_deliverable_quantity ?? 1),
    max_deliverable_quantity: Number(data.max_deliverable_quantity ?? 999),
    adminVerificationStatus: (data.adminVerificationStatus as 'pending' | 'approved' | 'rejected') ?? 'approved',
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

export async function createProduct(input: ProductInput): Promise<string> {
  const productRef = await addDoc(collection(db, PRODUCTS_COLLECTION), {
    ...input,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return productRef.id;
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

export async function updateProductVerificationStatus(
  productID: string,
  adminVerificationStatus: 'pending' | 'approved' | 'rejected',
): Promise<void> {
  await updateDoc(doc(db, PRODUCTS_COLLECTION, productID), {
    adminVerificationStatus,
    updated_at: serverTimestamp(),
  });
}
