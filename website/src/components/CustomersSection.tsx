'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import OrdersSection from '@/components/OrdersSection';
import { subscribeProducts } from '@/lib/firestore-products';
import { calculateOrderFinancials, subscribeOrders, type OrderDoc } from '@/lib/firestore-orders';

type CustomersSectionProps = {
  viewer: 'admin' | 'vendor';
  vendorID?: string;
  title?: string;
  emptyMessage?: string;
};

type CustomerRow = {
  key: string;
  customerID: string;
  customerName: string;
  customerPhone: string;
  orderCount: number;
  totalRevenue: number;
  totalCommission: number;
  totalReceivable: number;
  totalIncome: number;
  placedCount: number;
  dispatchedCount: number;
  deliveredCount: number;
  lastOrderDate: Date | null;
};

type SelectedCustomer = {
  customerID: string;
  customerName: string;
  customerPhone: string;
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

function toDate(order: OrderDoc): Date | null {
  const millis = order.created_at?.toMillis?.();
  return typeof millis === 'number' && Number.isFinite(millis) ? new Date(millis) : null;
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

function summarizeRowStatus(row: CustomerRow): string {
  if (row.placedCount > 0) return 'Placed pending';
  if (row.dispatchedCount > 0) return 'In transit';
  if (row.deliveredCount > 0) return 'Delivered';
  return 'No status';
}

function customerKey(order: OrderDoc): string {
  const id = String(order.customerID ?? '').trim();
  if (id) return `id:${id}`;

  const phone = normalizePhoneDigits(order.customerPhone);
  if (phone) return `phone:${phone}`;

  const name = String(order.customerName ?? '').trim().toLowerCase();
  return name ? `name:${name}` : `order:${order.orderID}`;
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-(--border) bg-(--surface-soft) px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-(--soft-text)">{label}</p>
      <p className="mt-1 text-sm font-semibold text-(--foreground-strong)">{value}</p>
    </div>
  );
}

export default function CustomersSection({
  viewer,
  vendorID,
  title,
  emptyMessage = 'No customers found for this filter.',
}: CustomersSectionProps) {
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [commissionByProductID, setCommissionByProductID] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);

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
        setLoadError('Could not load customers right now.');
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const scopedOrders = useMemo(() => {
    if (viewer === 'admin') {
      return orders;
    }

    if (!vendorID) {
      return [];
    }

    return orders.filter((order) => {
      const orderVendorIDs = [
        order.vendorID,
        ...order.items.map((item) => item.vendorID),
      ].filter(Boolean);

      return orderVendorIDs.includes(vendorID);
    });
  }, [orders, viewer, vendorID]);

  const customerRows = useMemo(() => {
    const map = new Map<string, CustomerRow>();

    for (const order of scopedOrders) {
      const key = customerKey(order);
      const name = String(order.customerName ?? '').trim() || 'Unknown customer';
      const phone = String(order.customerPhone ?? '').trim();
      const date = toDate(order);
      const financials = calculateOrderFinancials(order, viewer, vendorID, commissionByProductID);
      const current = map.get(key);

      if (!current) {
        map.set(key, {
          key,
          customerID: String(order.customerID ?? '').trim(),
          customerName: name,
          customerPhone: phone,
          orderCount: 1,
          totalRevenue: financials.revenue,
          totalCommission: financials.commission,
          totalReceivable: financials.receivable,
          totalIncome: financials.income,
          placedCount: order.status === 'Placed' ? 1 : 0,
          dispatchedCount: order.status === 'Dispatched' ? 1 : 0,
          deliveredCount: order.status === 'Delivered' ? 1 : 0,
          lastOrderDate: date,
        });
      } else {
        current.orderCount += 1;
        current.totalRevenue += financials.revenue;
        current.totalCommission += financials.commission;
        current.totalReceivable += financials.receivable;
        current.totalIncome += financials.income;
        if (order.status === 'Placed') current.placedCount += 1;
        if (order.status === 'Dispatched') current.dispatchedCount += 1;
        if (order.status === 'Delivered') current.deliveredCount += 1;

        if (date && (!current.lastOrderDate || date.getTime() > current.lastOrderDate.getTime())) {
          current.lastOrderDate = date;
        }

        if (!current.customerID) {
          current.customerID = String(order.customerID ?? '').trim();
        }

        if (!current.customerPhone && phone) {
          current.customerPhone = phone;
        }

        if (current.customerName === 'Unknown customer' && name !== 'Unknown customer') {
          current.customerName = name;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const aDate = a.lastOrderDate?.getTime() ?? 0;
      const bDate = b.lastOrderDate?.getTime() ?? 0;
      return bDate - aDate;
    });
  }, [scopedOrders, viewer, vendorID, commissionByProductID]);

  const visibleCustomers = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    if (!normalizedSearch) {
      return customerRows;
    }

    return customerRows.filter((row) => {
      const matchesName = row.customerName.toLowerCase().includes(normalizedSearch);
      const searchDigits = normalizePhoneDigits(normalizedSearch);
      const matchesPhone = searchDigits
        ? phonesMatch(row.customerPhone, searchDigits)
        : row.customerPhone.toLowerCase().includes(normalizedSearch);

      return matchesName || matchesPhone;
    });
  }, [customerRows, searchValue]);

  const summary = useMemo(() => {
    const totalCustomers = visibleCustomers.length;
    const totalOrders = visibleCustomers.reduce((sum, row) => sum + row.orderCount, 0);
    const totalRevenue = visibleCustomers.reduce((sum, row) => sum + row.totalRevenue, 0);
    const totalCommission = visibleCustomers.reduce((sum, row) => sum + row.totalCommission, 0);
    const totalReceivable = visibleCustomers.reduce((sum, row) => sum + row.totalReceivable, 0);
    const totalIncome = visibleCustomers.reduce((sum, row) => sum + row.totalIncome, 0);
    const averageOrderValue = totalOrders > 0 ? totalReceivable / totalOrders : 0;

    return {
      totalCustomers,
      totalOrders,
      totalRevenue,
      totalCommission,
      totalReceivable,
      totalIncome,
      averageOrderValue,
    };
  }, [visibleCustomers]);

  const resolvedTitle = title ?? (viewer === 'admin' ? 'Customer Section' : 'Vendor Customers');

  return (
    <section className="relative left-1/2 w-[120%] -translate-x-1/2">
      <div className="glass-card-strong rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-xl font-semibold tracking-tight text-(--foreground-strong)">{resolvedTitle}</h2>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Search customer"
          className="w-full rounded-xl border border-(--border) bg-(--surface-soft) px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent) sm:w-64"
        />
      </div>

      <div className={`mt-4 grid grid-cols-2 gap-2 ${viewer === 'vendor' ? 'sm:grid-cols-4 lg:grid-cols-6' : 'sm:grid-cols-4'}`}>
        <SummaryCard label="Customers" value={summary.totalCustomers} />
        <SummaryCard label="Orders" value={summary.totalOrders} />
        <SummaryCard label="Revenue" value={formatCurrency(summary.totalRevenue)} />
        {viewer === 'vendor' && <SummaryCard label="Commission" value={formatCurrency(summary.totalCommission)} />}
        {viewer === 'vendor' && <SummaryCard label="Receivable" value={formatCurrency(summary.totalReceivable)} />}
        <SummaryCard label={viewer === 'vendor' ? 'Income' : 'Avg Order Value'} value={formatCurrency(viewer === 'vendor' ? summary.totalIncome : summary.averageOrderValue)} />
      </div>

      {isLoading && <p className="mt-4 text-sm text-(--muted)">Loading customers...</p>}
      {!isLoading && loadError && <p className="mt-4 text-sm text-rose-600">{loadError}</p>}
      {!isLoading && !loadError && visibleCustomers.length === 0 && (
        <p className="mt-4 text-sm text-(--muted)">{emptyMessage}</p>
      )}

      {!isLoading && !loadError && visibleCustomers.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--border) text-(--soft-text)">
                <th className="px-2 py-2 font-medium">Customer</th>
                <th className="px-2 py-2 font-medium">Phone</th>
                <th className="px-2 py-2 font-medium">Orders</th>
                <th className="px-2 py-2 font-medium">Revenue</th>
                {viewer === 'vendor' && <th className="px-2 py-2 font-medium">Commission</th>}
                <th className="px-2 py-2 font-medium">{viewer === 'vendor' ? 'Receivable' : 'Total'}</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Last Order</th>
                <th className="px-2 py-2 font-medium">Ledger</th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.map((row) => (
                <tr key={row.key} className="border-b border-(--border) last:border-0">
                  <td className="px-2 py-3">{row.customerName}</td>
                  <td className="px-2 py-3">{row.customerPhone || <span className="text-(--muted)">Unknown</span>}</td>
                  <td className="px-2 py-3">{row.orderCount}</td>
                  <td className="px-2 py-3">{formatCurrency(row.totalRevenue)}</td>
                  {viewer === 'vendor' && <td className="px-2 py-3">-{formatCurrency(row.totalCommission)}</td>}
                  <td className="px-2 py-3">{formatCurrency(viewer === 'vendor' ? row.totalReceivable : row.totalRevenue)}</td>
                  <td className="px-2 py-3">{summarizeRowStatus(row)}</td>
                  <td className="px-2 py-3">{formatDate(row.lastOrderDate)}</td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer({
                          customerID: row.customerID,
                          customerName: row.customerName,
                          customerPhone: row.customerPhone,
                        });
                      }}
                      className="rounded-lg border border-(--border) px-2 py-1 text-xs font-semibold text-foreground transition hover:border-(--accent)"
                    >
                      View Ledger
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCustomer && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-80 flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-20 backdrop-blur-[2px] sm:items-center sm:pt-4">
          <div className="w-full max-w-5xl rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-[0_28px_80px_rgba(68,39,34,0.28)] sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-(--foreground-strong)">{selectedCustomer.customerName} Ledger</p>
                <p className="text-xs text-(--muted)">{selectedCustomer.customerPhone || 'Unknown phone'}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="rounded-full border border-(--border) px-3 py-1 text-xs font-semibold text-foreground transition hover:border-(--accent)"
              >
                Close
              </button>
            </div>

            <OrdersSection
              title="Ledger"
              viewer={viewer}
              vendorID={viewer === 'vendor' ? vendorID : undefined}
              customerID={selectedCustomer.customerID || undefined}
              customerPhone={selectedCustomer.customerPhone || undefined}
              customerName={selectedCustomer.customerName}
              showMonthFilter
              compact
              emptyMessage="No orders found for this customer in the selected month."
            />
          </div>
        </div>,
        document.body,
      )}
      </div>
    </section>
  );
}