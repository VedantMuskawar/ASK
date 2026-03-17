import {
  collection,
  deleteField,
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
  vendorAddress: string;
  products: Record<string, boolean>;
  category: string;
  status: string;
  documents?: {
    marketplaceAgreement?: VendorMarketplaceAgreementRecord | null;
  };
  created_at: Timestamp | FieldValue;
  updated_at: Timestamp | FieldValue;
}

export interface VendorMarketplaceAgreement {
  isCompleted: boolean;
  executedDay: string;
  executedMonth: string;
  executedYear: string;
  marketplaceName: string;
  marketplaceRegisteredOffice: string;
  supplierLegalName: string;
  supplierBusinessAddress: string;
  supplierGstNumber: string;
  jurisdiction: string;
  confirmations: {
    documentationTrue: boolean;
    allowAuditAndVerification: boolean;
    qualityAndCompliance: boolean;
    commercialAndPaymentTerms: boolean;
    indemnityAndConfidentiality: boolean;
    terminationAndDisputeResolution: boolean;
    finalConsent: boolean;
  };
  acceptedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface VendorMarketplaceAgreementInput {
  executedDay: string;
  executedMonth: string;
  executedYear: string;
  marketplaceName: string;
  marketplaceRegisteredOffice: string;
  supplierLegalName: string;
  supplierBusinessAddress: string;
  supplierGstNumber: string;
  jurisdiction: string;
  confirmations: {
    documentationTrue: boolean;
    allowAuditAndVerification: boolean;
    qualityAndCompliance: boolean;
    commercialAndPaymentTerms: boolean;
    indemnityAndConfidentiality: boolean;
    terminationAndDisputeResolution: boolean;
    finalConsent: boolean;
  };
}

type VendorMarketplaceAgreementRecord = {
  isCompleted?: boolean;
  executedDay?: string;
  executedMonth?: string;
  executedYear?: string;
  marketplaceName?: string;
  marketplaceRegisteredOffice?: string;
  supplierLegalName?: string;
  supplierBusinessAddress?: string;
  supplierGstNumber?: string;
  jurisdiction?: string;
  confirmations?: Partial<VendorMarketplaceAgreement['confirmations']>;
  acceptedAt?: Timestamp | FieldValue | null;
  updatedAt?: Timestamp | FieldValue | null;
};

export interface VendorDoc extends Omit<VendorRecord, 'created_at' | 'updated_at'> {
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

export interface VendorInput {
  vendorName: string;
  vendorPhoneNumber: string;
  vendorAddress: string;
  products: Record<string, boolean>;
  category: string;
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
    vendorAddress: String(data.vendorAddress ?? ''),
    products: normalizeProductsMap(data.products),
    category: String(data.category ?? ''),
    status: String(data.status ?? 'active'),
    documents: {
      marketplaceAgreement: normalizeVendorMarketplaceAgreement(data.documents?.marketplaceAgreement),
    },
    created_at: (data.created_at as Timestamp | null) ?? null,
    updated_at: (data.updated_at as Timestamp | null) ?? null,
  };
}

function normalizeVendorMarketplaceAgreement(
  value: VendorMarketplaceAgreementRecord | null | undefined,
): VendorMarketplaceAgreement | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const confirmations: Partial<VendorMarketplaceAgreement['confirmations']> =
    value.confirmations && typeof value.confirmations === 'object'
      ? (value.confirmations as Partial<VendorMarketplaceAgreement['confirmations']>)
      : {};

  return {
    isCompleted: Boolean(value.isCompleted),
    executedDay: String(value.executedDay ?? ''),
    executedMonth: String(value.executedMonth ?? ''),
    executedYear: String(value.executedYear ?? ''),
    marketplaceName: String(value.marketplaceName ?? ''),
    marketplaceRegisteredOffice: String(value.marketplaceRegisteredOffice ?? ''),
    supplierLegalName: String(value.supplierLegalName ?? ''),
    supplierBusinessAddress: String(value.supplierBusinessAddress ?? ''),
    supplierGstNumber: String(value.supplierGstNumber ?? ''),
    jurisdiction: String(value.jurisdiction ?? ''),
    confirmations: {
      documentationTrue: Boolean(confirmations.documentationTrue),
      allowAuditAndVerification: Boolean(confirmations.allowAuditAndVerification),
      qualityAndCompliance: Boolean(confirmations.qualityAndCompliance),
      commercialAndPaymentTerms: Boolean(confirmations.commercialAndPaymentTerms),
      indemnityAndConfidentiality: Boolean(confirmations.indemnityAndConfidentiality),
      terminationAndDisputeResolution: Boolean(confirmations.terminationAndDisputeResolution),
      finalConsent: Boolean(confirmations.finalConsent),
    },
    acceptedAt: (value.acceptedAt as Timestamp | null) ?? null,
    updatedAt: (value.updatedAt as Timestamp | null) ?? null,
  };
}

export function hasCompletedMarketplaceAgreement(vendor: VendorDoc | null | undefined): boolean {
  return Boolean(vendor?.documents?.marketplaceAgreement?.isCompleted);
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

export async function createVendor(input: VendorInput): Promise<string> {
  const vendorRef = doc(collection(db, VENDORS_COLLECTION));

  await setDoc(vendorRef, {
    vendorID: vendorRef.id,
    ...input,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return vendorRef.id;
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

export async function addProductToVendor(vendorID: string, productID: string): Promise<void> {
  await updateDoc(doc(db, VENDORS_COLLECTION, vendorID), {
    [`products.${productID}`]: true,
    updated_at: serverTimestamp(),
  });
}

export async function removeProductFromVendor(vendorID: string, productID: string): Promise<void> {
  await updateDoc(doc(db, VENDORS_COLLECTION, vendorID), {
    [`products.${productID}`]: deleteField(),
    updated_at: serverTimestamp(),
  });
}

export async function saveVendorMarketplaceAgreement(
  vendorID: string,
  input: VendorMarketplaceAgreementInput,
): Promise<void> {
  await updateDoc(doc(db, VENDORS_COLLECTION, vendorID), {
    'documents.marketplaceAgreement': {
      ...input,
      isCompleted: true,
      acceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    updated_at: serverTimestamp(),
  });
}
