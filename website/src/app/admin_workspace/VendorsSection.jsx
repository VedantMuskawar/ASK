'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { subscribeProducts } from '@/lib/firestore-products';
import {
  createVendor,
  deleteVendor,
  subscribeVendors,
  updateVendor,
  updateVendorStatus,
} from '@/lib/firestore-vendors';

const CATEGORY_OPTIONS = [
  'Construction Materials',
  'Electrical & Plumbing',
  'Finishing Materials',
];

const SORT_OPTIONS = [
  'name-asc',
  'name-desc',
  'lead-asc',
  'lead-desc',
  'status-asc',
  'status-desc',
];

const STATUS_OPTIONS = ['active', 'inactive', 'on-hold'];

const EMPTY_FORM = {
  vendorName: '',
  vendorPhoneNumber: '',
  products: {},
  category: CATEGORY_OPTIONS[0],
  lead_time_days: '',
  status: STATUS_OPTIONS[0],
};

function normalizePhone(value) {
  return value.replace(/\D/g, '').slice(0, 15);
}

export default function VendorsSection() {
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [showForm, setShowForm] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeVendors(
      (nextVendors) => {
        setVendors(nextVendors);
        setIsLoading(false);
      },
      () => {
        setActionError('Could not load vendors from VENDORS collection.');
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeProducts(
      (nextProducts) => {
        setProducts(nextProducts);
      },
      () => {
        setActionError('Could not load products for vendor mapping.');
      },
    );

    return unsubscribe;
  }, []);

  const filteredVendors = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    const searched = vendors.filter((vendor) => {
      if (!normalizedSearch) return true;
      return (
        vendor.vendorName.toLowerCase().includes(normalizedSearch) ||
        vendor.vendorPhoneNumber.toLowerCase().includes(normalizedSearch) ||
        vendor.category.toLowerCase().includes(normalizedSearch) ||
        vendor.status.toLowerCase().includes(normalizedSearch)
      );
    });

    return [...searched].sort((a, b) => {
      if (sortBy === 'name-asc') return a.vendorName.localeCompare(b.vendorName);
      if (sortBy === 'name-desc') return b.vendorName.localeCompare(a.vendorName);
      if (sortBy === 'lead-asc') return a.lead_time_days - b.lead_time_days;
      if (sortBy === 'lead-desc') return b.lead_time_days - a.lead_time_days;
      if (sortBy === 'status-asc') return a.status.localeCompare(b.status);
      if (sortBy === 'status-desc') return b.status.localeCompare(a.status);
      return 0;
    });
  }, [vendors, searchValue, sortBy]);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, products: {} });
    setEditingVendorId(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const handleCloseFormModal = () => {
    resetForm();
    setShowForm(false);
  };

  const handleEdit = (vendor) => {
    setEditingVendorId(vendor.vendorID);
    setForm({
      vendorName: vendor.vendorName,
      vendorPhoneNumber: vendor.vendorPhoneNumber,
      products: vendor.products ?? {},
      category: vendor.category,
      lead_time_days: String(vendor.lead_time_days),
      status: vendor.status,
    });
    setShowForm(true);
  };

  const handleDelete = (vendorID) => {
    setActionError('');
    void deleteVendor(vendorID).catch(() => {
      setActionError('Delete failed. Please try again.');
    });
  };

  const handleStatusChange = (vendorID, status) => {
    setActionError('');
    void updateVendorStatus(vendorID, status).catch(() => {
      setActionError('Could not update vendor status.');
    });
  };

  const toggleProductInForm = (productID) => {
    setForm((prev) => {
      const nextProducts = { ...prev.products };

      if (nextProducts[productID]) {
        delete nextProducts[productID];
      } else {
        nextProducts[productID] = true;
      }

      return {
        ...prev,
        products: nextProducts,
      };
    });
  };

  const handleFormSubmit = async (event) => {
    event.preventDefault();

    const trimmedVendorName = form.vendorName.trim();
    const normalizedPhone = normalizePhone(form.vendorPhoneNumber);
    const parsedLeadTime = Number(form.lead_time_days);

    if (!trimmedVendorName || normalizedPhone.length < 7) {
      setActionError('Vendor name and valid phone number are required.');
      return;
    }

    if (!Number.isInteger(parsedLeadTime) || parsedLeadTime < 0) {
      setActionError('Lead time must be a non-negative whole number.');
      return;
    }

    setActionError('');
    setIsSubmitting(true);

    try {
      const payload = {
        vendorName: trimmedVendorName,
        vendorPhoneNumber: normalizedPhone,
        products: form.products,
        category: form.category,
        lead_time_days: parsedLeadTime,
        status: form.status,
      };

      if (editingVendorId) {
        await updateVendor(editingVendorId, payload);
      } else {
        await createVendor(payload);
      }

      resetForm();
      setShowForm(false);
    } catch {
      setActionError(editingVendorId ? 'Update failed. Please try again.' : 'Create failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="vendors" className="relative left-1/2 w-[150%] -translate-x-1/2 space-y-6">
      <div className="glass-card-strong rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="mr-auto text-lg font-semibold tracking-tight text-(--foreground-strong)">Vendors</h3>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search vendor"
            className="w-full rounded-xl border border-(--border) bg-(--surface-soft) px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent) sm:w-64"
          />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="rounded-xl border border-(--border) bg-(--surface-soft) px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
          >
            <option value={SORT_OPTIONS[0]}>Sort: Name (A-Z)</option>
            <option value={SORT_OPTIONS[1]}>Sort: Name (Z-A)</option>
            <option value={SORT_OPTIONS[2]}>Sort: Lead Time (Low-High)</option>
            <option value={SORT_OPTIONS[3]}>Sort: Lead Time (High-Low)</option>
            <option value={SORT_OPTIONS[4]}>Sort: Status (A-Z)</option>
            <option value={SORT_OPTIONS[5]}>Sort: Status (Z-A)</option>
          </select>
          <button
            type="button"
            onClick={handleStartCreate}
            className="rounded-full bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95"
          >
            Add Vendor
          </button>
        </div>

        {actionError && <p className="mt-3 text-sm text-rose-600">{actionError}</p>}
        {isLoading && <p className="mt-3 text-sm text-(--muted)">Loading vendors...</p>}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--border) text-(--soft-text)">
                <th className="px-2 py-2 font-medium">Vendor Name</th>
                <th className="px-2 py-2 font-medium">Vendor Phone Number</th>
                <th className="px-2 py-2 font-medium">Products</th>
                <th className="px-2 py-2 font-medium">Category</th>
                <th className="px-2 py-2 font-medium">Lead Time (Days)</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Edit</th>
                <th className="px-2 py-2 font-medium">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map((vendor) => {
                const mappedProductIDs = Object.keys(vendor.products ?? {});
                const mappedProductNames = mappedProductIDs
                  .map((id) => products.find((p) => p.productID === id)?.name)
                  .filter(Boolean)
                  .join(', ');
                return (
                  <tr key={vendor.vendorID} className="border-b border-(--border) last:border-0">
                    <td className="px-2 py-3">{vendor.vendorName}</td>
                    <td className="px-2 py-3">{vendor.vendorPhoneNumber}</td>
                    <td className="px-2 py-3">
                      {mappedProductNames || <span className="text-(--muted)">No products</span>}
                    </td>
                    <td className="px-2 py-3">{vendor.category}</td>
                    <td className="px-2 py-3">{vendor.lead_time_days}</td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={vendor.status === 'active'}
                        onClick={() => handleStatusChange(vendor.vendorID, vendor.status === 'active' ? 'inactive' : 'active')}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          vendor.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                            vendor.status === 'active' ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={() => handleEdit(vendor)}
                        className="rounded-lg border border-(--border) px-2 py-1 text-xs font-semibold text-foreground transition hover:border-(--accent)"
                      >
                        Edit
                      </button>
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(vendor.vendorID)}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-80 flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-20 backdrop-blur-[2px] sm:items-center sm:pt-4">
          <div className="w-full max-w-3xl rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-[0_28px_80px_rgba(68,39,34,0.28)] sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-(--foreground-strong)">
                {editingVendorId ? `Edit Vendor (${editingVendorId})` : 'Add Vendor'}
              </p>
              <button
                type="button"
                onClick={handleCloseFormModal}
                className="rounded-full border border-(--border) px-2.5 py-1 text-xs font-semibold text-foreground transition hover:border-(--accent)"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={form.vendorName}
                  onChange={(event) => setForm((prev) => ({ ...prev, vendorName: event.target.value }))}
                  placeholder="Vendor name"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  required
                />
                <input
                  value={form.vendorPhoneNumber}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, vendorPhoneNumber: normalizePhone(event.target.value) }))
                  }
                  placeholder="Vendor phone number"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  required
                />
                <select
                  value={form.category}
                  onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.lead_time_days}
                  onChange={(event) => setForm((prev) => ({ ...prev, lead_time_days: event.target.value }))}
                  placeholder="Lead time (days)"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  required
                />
                <select
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                >
                  {STATUS_OPTIONS.map((statusOption) => (
                    <option key={statusOption} value={statusOption}>{statusOption}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-(--foreground-strong)">Products (Map : ProductID)</p>
                {products.length === 0 ? (
                  <p className="text-xs text-(--muted)">No products found. Add products first.</p>
                ) : (
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-(--border) bg-white p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {products.map((product) => {
                        const checked = Boolean(form.products[product.productID]);
                        return (
                          <label
                            key={product.productID}
                            className="inline-flex items-center gap-2 rounded-lg bg-(--surface-soft) px-2 py-1.5 text-xs text-foreground"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleProductInForm(product.productID)}
                            />
                            <span className="truncate">{product.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-full bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95"
                >
                  {isSubmitting ? 'Saving...' : editingVendorId ? 'Update Vendor' : 'Create Vendor'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseFormModal}
                  className="rounded-full border border-(--border) bg-(--surface) px-4 py-2 text-xs font-semibold text-foreground transition hover:border-(--accent)"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
