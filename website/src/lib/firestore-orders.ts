import {
  collection,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc,
  type FieldValue,
  type Timestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firestore-users';

export const ORDERS_COLLECTION = 'ORDERS';

export type OrderStatus = 'Placed' | 'Dispatched' | 'Delivered';

export interface OrderItemRecord {
  productID: string;
  name: string;
  quantity: number;
  unitPrice: number;
  baseUnit: string;
  vendorID: string;
  vendorName: string;
  lineSubtotal: number;
  commissionPercentage: number;
}

export interface OrderAddressRecord {
  id: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderRecord {
  customerName: string;
  customerPhone: string;
  customerID: string;
  vendorID: string;
  vendorName: string;
  address: OrderAddressRecord;
  status: OrderStatus;
  totalAmount: number;
  items: OrderItemRecord[];
  created_at: Timestamp | FieldValue;
  updated_at: Timestamp | FieldValue;
}

interface RawOrderRecord extends Partial<OrderRecord> {
  userID?: string;
  orderSignature?: string;
  products?: unknown;
  billing?: {
    grandTotal?: number;
  };
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
}

export interface OrderDoc extends Omit<OrderRecord, 'created_at' | 'updated_at'> {
  orderID: string;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

export interface OrderFinancials {
  revenue: number;
  commission: number;
  receivable: number;
  income: number;
}

function normalizeItems(value: unknown): OrderItemRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const safeItem = (item ?? {}) as Partial<OrderItemRecord>;
    return {
      productID: String(safeItem.productID ?? ''),
      name: String(safeItem.name ?? ''),
      quantity: Number(safeItem.quantity ?? 0),
      unitPrice: Number(safeItem.unitPrice ?? 0),
      baseUnit: String(safeItem.baseUnit ?? ''),
      vendorID: String(safeItem.vendorID ?? ''),
      vendorName: String(safeItem.vendorName ?? ''),
      lineSubtotal: Number(safeItem.lineSubtotal ?? (Number(safeItem.quantity ?? 0) * Number(safeItem.unitPrice ?? 0))),
      commissionPercentage: Number(safeItem.commissionPercentage ?? 0),
    };
  });
}

function getRelevantItems(order: OrderDoc, viewer: 'admin' | 'vendor' | 'customer', vendorID?: string): OrderItemRecord[] {
  if (viewer !== 'vendor' || !vendorID) {
    return order.items;
  }

  return order.items.filter((item) => item.vendorID === vendorID);
}

export function calculateOrderFinancials(
  order: OrderDoc,
  viewer: 'admin' | 'vendor' | 'customer',
  vendorID?: string,
  commissionByProductID: Record<string, number> = {},
): OrderFinancials {
  if (viewer !== 'vendor') {
    const revenue = Number(order.totalAmount ?? 0);
    return {
      revenue,
      commission: 0,
      receivable: revenue,
      income: revenue,
    };
  }

  const relevantItems = getRelevantItems(order, viewer, vendorID);

  const revenue = relevantItems.reduce((sum, item) => {
    const lineSubtotal = Number(item.lineSubtotal ?? (Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0)));
    return sum + lineSubtotal;
  }, 0);

  const commission = relevantItems.reduce((sum, item) => {
    const lineSubtotal = Number(item.lineSubtotal ?? (Number(item.quantity ?? 0) * Number(item.unitPrice ?? 0)));
    const commissionPercentage = Number(
      item.commissionPercentage ?? commissionByProductID[item.productID] ?? 0,
    );

    return sum + (lineSubtotal * commissionPercentage) / 100;
  }, 0);

  const receivable = revenue - commission;

  return {
    revenue,
    commission,
    receivable,
    income: receivable,
  };
}

function pickVendorID(items: OrderItemRecord[], fallbackVendorID: unknown): string {
  const explicitVendorID = String(fallbackVendorID ?? '').trim();
  if (explicitVendorID) {
    return explicitVendorID;
  }

  const uniqueVendorIDs = [...new Set(items.map((item) => item.vendorID).filter(Boolean))];
  if (uniqueVendorIDs.length === 1) {
    return uniqueVendorIDs[0];
  }

  return '';
}

function pickVendorName(items: OrderItemRecord[], fallbackVendorName: unknown): string {
  const explicitVendorName = String(fallbackVendorName ?? '').trim();
  if (explicitVendorName) {
    return explicitVendorName;
  }

  const uniqueVendorNames = [...new Set(items.map((item) => item.vendorName).filter(Boolean))];
  return uniqueVendorNames.join(', ');
}

function normalizeAddress(value: unknown): OrderAddressRecord {
  const safeAddress = (value ?? {}) as Partial<OrderAddressRecord>;
  return {
    id: String(safeAddress.id ?? ''),
    addressLine1: String(safeAddress.addressLine1 ?? ''),
    addressLine2: String(safeAddress.addressLine2 ?? ''),
    city: String(safeAddress.city ?? ''),
    state: String(safeAddress.state ?? ''),
    pincode: String(safeAddress.pincode ?? ''),
  };
}

function normalizeStatus(value: unknown): OrderStatus {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'dispatched') return 'Dispatched';
  if (normalized === 'delivered') return 'Delivered';
  return 'Placed';
}

function normalizeOrderRecord(data: RawOrderRecord, orderID: string): OrderDoc {
  const items = normalizeItems(data.items ?? data.products);
  return {
    orderID,
    customerName: String(data.customerName ?? ''),
    customerPhone: String(data.customerPhone ?? ''),
    customerID: String(data.customerID ?? data.userID ?? ''),
    vendorID: pickVendorID(items, data.vendorID),
    vendorName: pickVendorName(items, data.vendorName),
    address: normalizeAddress(data.address),
    status: normalizeStatus(data.status),
    totalAmount: Number(data.totalAmount ?? data.billing?.grandTotal ?? 0),
    items,
    created_at: (data.created_at as Timestamp | null) ?? (data.createdAt as Timestamp | null) ?? null,
    updated_at: (data.updated_at as Timestamp | null) ?? (data.updatedAt as Timestamp | null) ?? null,
  };
}

export function subscribeOrders(
  onData: (orders: OrderDoc[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, ORDERS_COLLECTION),
    (snapshot) => {
      const orders = snapshot.docs.map((item) => {
        const data = item.data() as RawOrderRecord;
        return normalizeOrderRecord(data, item.id);
      });
      onData(orders);
    },
    (error) => {
      onError?.(error as Error);
    },
  );
}

export async function updateOrderStatus(orderID: string, status: OrderStatus): Promise<void> {
  await updateDoc(doc(db, ORDERS_COLLECTION, orderID), {
    status,
    updated_at: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
