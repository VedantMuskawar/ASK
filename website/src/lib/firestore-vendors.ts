import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FieldValue,
  type Timestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firestore-users';

export const VENDORS_COLLECTION = 'VENDORS';

export interface VendorRecord {
  vendorID: string;
  vendorName: string;
  vendorPhoneNumber: string;
  products: Record<string, boolean>;
  category: string;
  lead_time_days: number;
  status: string;
  created_at: Timestamp | FieldValue;
  updated_at: Timestamp | FieldValue;
}

export interface VendorDoc extends Omit<VendorRecord, 'created_at' | 'updated_at'> {
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

export interface VendorInput {
  vendorName: string;
  vendorPhoneNumber: string;
  products: Record<string, boolean>;
  category: string;
  lead_time_days: number;
  status: string;
}

function normalizeProductsMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, boolean>>(
    (acc, [key, mapValue]) => {
      if (key.trim() && Boolean(mapValue)) {
        acc[key] = true;
      }
      return acc;
    },
    {},
  );
}

function normalizeVendorRecord(data: Partial<VendorRecord>, vendorID: string): VendorDoc {
  return {
    vendorID: String(data.vendorID ?? vendorID),
    vendorName: String(data.vendorName ?? ''),
    vendorPhoneNumber: String(data.vendorPhoneNumber ?? ''),
    products: normalizeProductsMap(data.products),
    category: String(data.category ?? ''),
    lead_time_days: Number(data.lead_time_days ?? 0),
    status: String(data.status ?? 'active'),
    created_at: (data.created_at as Timestamp | null) ?? null,
    updated_at: (data.updated_at as Timestamp | null) ?? null,
  };
}

export function subscribeVendors(
  onData: (vendors: VendorDoc[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, VENDORS_COLLECTION),
    (snapshot) => {
      const vendors = snapshot.docs.map((item) => {
        const data = item.data() as Partial<VendorRecord>;
        return normalizeVendorRecord(data, item.id);
      });
      onData(vendors);
    },
    (error) => {
      onError?.(error as Error);
    },
  );
}

export async function createVendor(input: VendorInput): Promise<void> {
  const vendorRef = doc(collection(db, VENDORS_COLLECTION));

  await setDoc(vendorRef, {
    vendorID: vendorRef.id,
    ...input,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

export async function updateVendor(vendorID: string, input: VendorInput): Promise<void> {
  await updateDoc(doc(db, VENDORS_COLLECTION, vendorID), {
    ...input,
    vendorID,
    updated_at: serverTimestamp(),
  });
}

export async function deleteVendor(vendorID: string): Promise<void> {
  await deleteDoc(doc(db, VENDORS_COLLECTION, vendorID));
}

export async function updateVendorStatus(vendorID: string, status: string): Promise<void> {
  await updateDoc(doc(db, VENDORS_COLLECTION, vendorID), {
    status,
    updated_at: serverTimestamp(),
  });
}
