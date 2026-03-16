'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  calculateOrderFinancials,
  subscribeOrders,
  updateOrderStatus,
  type OrderDoc,
  type OrderStatus,
} from '@/lib/firestore-orders';
import { subscribeProducts } from '@/lib/firestore-products';

type OrdersSectionProps = {
  title: string;
  viewer: 'admin' | 'vendor' | 'customer';
  canEditStatus?: boolean;
  showMonthFilter?: boolean;
  vendorID?: string;
  customerID?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
  emptyMessage?: string;
  compact?: boolean;
};

function normalizePhoneDigits(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

function phonesMatch(left: string, right: string): boolean {
  const leftDigits = normalizePhoneDigits(left);
  const rightDigits = normalizePhoneDigits(right);

  if (!leftDigits || !rightDigits) {
    return false;
  }

  return (
    leftDigits === rightDigits
    || leftDigits.endsWith(rightDigits)
    || rightDigits.endsWith(leftDigits)
  );
}

function formatCurrency(value: number): string {
  return `Rs ${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(date: Date | null): string {
  if (!date) return 'Unknown date';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAddress(order: OrderDoc): string {
  const parts = [
    order.address?.addressLine1,
    order.address?.addressLine2,
    order.address?.city,
    order.address?.state,
    order.address?.pincode,
  ].filter(Boolean);

  return parts.join(', ');
}

function monthFromDate(date: Date | null): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function statusBadgeClasses(status: OrderStatus): string {
  if (status === 'Delivered') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Dispatched') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
}

function toDate(order: OrderDoc): Date | null {
  const millis = order.created_at?.toMillis?.();
  return Number.isFinite(millis) ? new Date(millis) : null;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-(--border) bg-(--surface-soft) px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-(--soft-text)">{label}</p>
      <p className="mt-1 text-sm font-semibold text-(--foreground-strong)">{value}</p>
    </div>
  );
}

function StatusSwitchRow({
  status,
  onChange,
  disabled,
}: {
  status: OrderStatus;
  onChange: (nextStatus: OrderStatus) => void;
  disabled: boolean;
}) {
  const isDispatchedOn = status === 'Dispatched' || status === 'Delivered';
  const isDeliveredOn = status === 'Delivered';

  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button
        type="button"
        role="switch"
        aria-checked={isDispatchedOn}
        disabled={disabled || status === 'Delivered'}
        onClick={() => {
          if (isDispatchedOn) {
            onChange('Placed');
          } else {
            onChange('Dispatched');
          }
        }}
        className="flex items-center justify-between rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="text-xs text-(--muted)">Dispatched</span>
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            isDispatchedOn ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
              isDispatchedOn ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </span>
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={isDeliveredOn}
        disabled={disabled || status === 'Placed'}
        onClick={() => {
          if (isDeliveredOn) {
            onChange('Dispatched');
          } else {
            onChange('Delivered');
          }
        }}
        className="flex items-center justify-between rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="text-xs text-(--muted)">Delivered</span>
        <span
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            isDeliveredOn ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
              isDeliveredOn ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </span>
      </button>
    </div>
  );
}

export default function OrdersSection({
  title,
  viewer,
  canEditStatus = false,
  showMonthFilter = false,
  vendorID,
  customerID,
  customerPhone,
  customerName,
  emptyMessage = 'No orders found for this filter.',
  compact = false,
}: OrdersSectionProps) {
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [commissionByProductID, setCommissionByProductID] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingOrderID, setSavingOrderID] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
  });

  useEffect(() => {
    const unsubscribe = subscribeProducts((products) => {
      setCommissionByProductID(
        products.reduce<Record<string, number>>((acc, product) => {
          acc[product.productID] = Number(product.commission ?? 0);
          return acc;
        }, {}),
      );
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeOrders(
      (nextOrders) => {
        setOrders(nextOrders);
        setIsLoading(false);
      },
      () => {
        setLoadError('Could not load orders right now.');
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (vendorID) {
        const orderVendorIDs = [
          order.vendorID,
          ...order.items.map((item) => item.vendorID),
        ].filter(Boolean);

        if (!orderVendorIDs.includes(vendorID)) {
          return false;
        }
      }

      if (customerID && order.customerID !== customerID) {
        return false;
      }

      if (customerPhone) {
        const matchesPhone = phonesMatch(order.customerPhone, customerPhone);
        const matchesName = customerName
          ? order.customerName.trim().toLowerCase() === String(customerName).trim().toLowerCase()
          : false;
        if (!matchesPhone && !matchesName) {
          return false;
        }
      }

      if (showMonthFilter && selectedMonth) {
        const orderDate = toDate(order);
        if (monthFromDate(orderDate) !== selectedMonth) {
          return false;
        }
      }

      return true;
    });
  }, [orders, vendorID, customerID, customerPhone, customerName, showMonthFilter, selectedMonth]);

  const summary = useMemo(() => {
    const placed = filteredOrders.filter((order) => order.status === 'Placed').length;
    const dispatched = filteredOrders.filter((order) => order.status === 'Dispatched').length;
    const delivered = filteredOrders.filter((order) => order.status === 'Delivered').length;
    const totals = filteredOrders.reduce(
      (acc, order) => {
        const financials = calculateOrderFinancials(order, viewer, vendorID, commissionByProductID);
        acc.revenue += financials.revenue;
        acc.commission += financials.commission;
        acc.receivable += financials.receivable;
        acc.income += financials.income;
        return acc;
      },
      { revenue: 0, commission: 0, receivable: 0, income: 0 },
    );

    return {
      total: filteredOrders.length,
      placed,
      dispatched,
      delivered,
      ...totals,
    };
  }, [filteredOrders, viewer, vendorID, commissionByProductID]);

  const handleStatusChange = async (orderID: string, nextStatus: OrderStatus) => {
    setSavingOrderID(orderID);
    try {
      await updateOrderStatus(orderID, nextStatus);
    } finally {
      setSavingOrderID(null);
    }
  };

  return (
    <section className={`glass-card-strong rounded-3xl ${compact ? 'p-4 sm:p-5' : 'p-6 sm:p-8'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-(--foreground-strong)">{title}</h2>

        {showMonthFilter && (
          <label className="inline-flex items-center gap-2 rounded-xl border border-(--border) bg-(--surface-soft) px-3 py-2 text-xs text-(--muted)">
            <span>Month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="bg-transparent text-xs text-(--foreground-strong) outline-none"
            />
          </label>
        )}
      </div>

      {showMonthFilter && (
        <div className={`mt-4 grid grid-cols-2 gap-2 ${viewer === 'vendor' ? 'sm:grid-cols-4 lg:grid-cols-8' : 'sm:grid-cols-5'}`}>
          <SummaryCard label="Total" value={summary.total} />
          <SummaryCard label="Placed" value={summary.placed} />
          <SummaryCard label="Dispatched" value={summary.dispatched} />
          <SummaryCard label="Delivered" value={summary.delivered} />
          <SummaryCard label="Revenue" value={formatCurrency(summary.revenue)} />
          {viewer === 'vendor' && <SummaryCard label="Commission" value={formatCurrency(summary.commission)} />}
          {viewer === 'vendor' && <SummaryCard label="Receivable" value={formatCurrency(summary.receivable)} />}
          {viewer === 'vendor' && <SummaryCard label="Income" value={formatCurrency(summary.income)} />}
        </div>
      )}

      {isLoading && <p className="mt-4 text-sm text-(--muted)">Loading orders...</p>}
      {!isLoading && loadError && <p className="mt-4 text-sm text-rose-600">{loadError}</p>}

      {!isLoading && !loadError && filteredOrders.length === 0 && (
        <p className="mt-4 text-sm text-(--muted)">{emptyMessage}</p>
      )}

      <div className="mt-4 space-y-3">
        {filteredOrders.map((order) => {
          const orderDate = toDate(order);
          const orderAddress = formatAddress(order);
          const financials = calculateOrderFinancials(order, viewer, vendorID, commissionByProductID);
          const visibleItems = viewer === 'vendor' && vendorID
            ? order.items.filter((item) => item.vendorID === vendorID)
            : order.items;

          return (
            <article key={order.orderID} className="rounded-2xl border border-(--border) bg-white/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-(--foreground-strong)">Order #{order.orderID.slice(0, 8)}</p>
                  <p className="text-xs text-(--muted)">{formatDate(orderDate)}</p>
                  {(viewer === 'admin' || viewer === 'vendor' || viewer === 'customer') && (
                    <p className="mt-1 text-xs text-(--muted)">Customer: {order.customerName || 'Unknown'}</p>
                  )}
                  {viewer === 'admin' && (
                    <p className="text-xs text-(--muted)">Vendor: {order.vendorName || 'Unknown'}</p>
                  )}
                  <p className="text-xs text-(--muted)">Address: {orderAddress || 'Unknown'}</p>
                </div>

                <div className="text-right">
                  <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${statusBadgeClasses(order.status)}`}>
                    {order.status}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-(--foreground-strong)">{formatCurrency(financials.revenue)}</p>
                  {viewer === 'vendor' && (
                    <div className="mt-2 space-y-1 text-xs text-(--muted)">
                      <p>Ask Build Ease Commission: -{formatCurrency(financials.commission)}</p>
                      <p>Receivable: {formatCurrency(financials.receivable)}</p>
                      <p>Income: {formatCurrency(financials.income)}</p>
                    </div>
                  )}
                </div>
              </div>

              {Array.isArray(visibleItems) && visibleItems.length > 0 && (
                <div className="mt-3 rounded-xl border border-(--border) bg-(--surface-soft) px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-(--soft-text)">Items</p>
                  <ul className="mt-1 space-y-1">
                    {visibleItems.map((item, index) => (
                      <li key={`${order.orderID}-${item.productID || index}`} className="text-xs text-(--muted)">
                        {item.name || 'Item'} x {Number(item.quantity ?? 0)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {canEditStatus ? (
                <StatusSwitchRow
                  status={order.status}
                  disabled={savingOrderID === order.orderID}
                  onChange={(nextStatus) => void handleStatusChange(order.orderID, nextStatus)}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
