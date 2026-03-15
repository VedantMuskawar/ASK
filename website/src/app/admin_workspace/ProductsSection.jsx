'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  createProduct,
  deleteProduct,
  subscribeProducts,
  updateProduct,
  updateProductActive,
} from '@/lib/firestore-products';
import { uploadProductImage } from '@/lib/storage-products';
import { subscribeVendors } from '@/lib/firestore-vendors';

const CATEGORY_OPTIONS = [
  'Construction Materials',
  'Electrical & Plumbing',
  'Finishing Materials',
];

const SORT_OPTIONS = [
  'name-asc',
  'name-desc',
  'price-asc',
  'price-desc',
  'commission-asc',
  'commission-desc',
];

const EMPTY_FORM = {
  name: '',
  category: CATEGORY_OPTIONS[0],
  baseUnit: '',
  unitPrice: '',
  commission: '',
  images: [],
  isActive: true,
  vendorID: '',
};

export default function ProductsSection() {
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [showForm, setShowForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);
  const [previewImages, setPreviewImages] = useState([]);
  const [previewNewFiles, setPreviewNewFiles] = useState([]);
  const [isPreviewSaving, setIsPreviewSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeProducts(
      (nextProducts) => {
        setProducts(nextProducts);
        setIsLoading(false);
      },
      () => {
        setActionError('Could not load products from PRODUCTS collection.');
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeVendors((nextVendors) => {
      setVendors(nextVendors);
    });

    return unsubscribe;
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    const searched = products.filter((product) => {
      if (!normalizedSearch) return true;
      return (
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.category.toLowerCase().includes(normalizedSearch) ||
        product.baseUnit.toLowerCase().includes(normalizedSearch)
      );
    });

    const sorted = [...searched].sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'price-asc') return a.unitPrice - b.unitPrice;
      if (sortBy === 'price-desc') return b.unitPrice - a.unitPrice;
      if (sortBy === 'commission-asc') return a.commission - b.commission;
      if (sortBy === 'commission-desc') return b.commission - a.commission;
      return 0;
    });

    return sorted;
  }, [products, searchValue, sortBy]);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, images: [] });
    setEditingProductId(null);
    setSelectedImageFiles([]);
  };

  const handleStartCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const handleCloseFormModal = () => {
    resetForm();
    setShowForm(false);
  };

  const handleEdit = (product) => {
    setEditingProductId(product.productID);
    setForm({
      name: product.name,
      category: product.category,
      baseUnit: product.baseUnit,
      unitPrice: String(product.unitPrice),
      commission: String(product.commission),
      images: Array.isArray(product.images) ? product.images : [],
      isActive: Boolean(product.isActive),
      vendorID: product.vendorID ?? '',
    });
    setSelectedImageFiles([]);
    setShowForm(true);
  };

  const handleDelete = (productID) => {
    setActionError('');
    void deleteProduct(productID)
      .then(() => {
        if (editingProductId === productID) {
          resetForm();
          setShowForm(false);
        }
      })
      .catch(() => {
        setActionError('Delete failed. Please try again.');
      });
  };

  const handleToggleActive = (productID) => {
    const product = products.find((item) => item.productID === productID);
    if (!product) return;

    setActionError('');
    void updateProductActive(productID, !product.isActive).catch(() => {
      setActionError('Could not update active status.');
    });
  };

  const handleOpenImagePreview = (product) => {
    setPreviewProduct(product);
    setPreviewImages(Array.isArray(product.images) ? product.images : []);
    setPreviewNewFiles([]);
  };

  const handleCloseImagePreview = () => {
    setPreviewProduct(null);
    setPreviewImages([]);
    setPreviewNewFiles([]);
    setIsPreviewSaving(false);
  };

  const handleSavePreviewImages = async () => {
    if (!previewProduct) return;

    setActionError('');
    setIsPreviewSaving(true);

    try {
      const uploadedImageUrls = await Promise.all(
        previewNewFiles.map((file) => uploadProductImage(file)),
      );

      const nextImages = [...previewImages, ...uploadedImageUrls];

      await updateProduct(previewProduct.productID, {
        name: previewProduct.name,
        category: previewProduct.category,
        baseUnit: previewProduct.baseUnit,
        unitPrice: Number(previewProduct.unitPrice),
        commission: Number(previewProduct.commission),
        images: nextImages,
        isActive: Boolean(previewProduct.isActive),
      });

      handleCloseImagePreview();
    } catch {
      setActionError('Image update failed. Please try again.');
      setIsPreviewSaving(false);
    }
  };

  const handleFormSubmit = async (event) => {
    event.preventDefault();

    const trimmedName = form.name.trim();
    const trimmedBaseUnit = form.baseUnit.trim();

    if (!trimmedName || !trimmedBaseUnit) return;

    const parsedUnitPrice = Number(form.unitPrice);
    const parsedCommission = Number(form.commission);

    if (!Number.isFinite(parsedUnitPrice) || !Number.isFinite(parsedCommission)) return;

    setActionError('');
    setIsSubmitting(true);

    try {
      const uploadedImageUrls = await Promise.all(
        selectedImageFiles.map((file) => uploadProductImage(file)),
      );

      const mergedImages = [...form.images, ...uploadedImageUrls];

      const payload = {
        name: trimmedName,
        category: form.category,
        baseUnit: trimmedBaseUnit,
        unitPrice: parsedUnitPrice,
        commission: parsedCommission,
        images: mergedImages,
        isActive: form.isActive,
        vendorID: form.vendorID,
      };

      if (editingProductId) {
        await updateProduct(editingProductId, payload);
      } else {
        await createProduct(payload);
      }

      resetForm();
      setShowForm(false);
    } catch {
      setActionError(editingProductId ? 'Update failed. Please try again.' : 'Create failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="products" className="relative left-1/2 w-[150%] -translate-x-1/2 space-y-6">

      <div className="glass-card-strong rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="mr-auto text-lg font-semibold tracking-tight text-(--foreground-strong)">Products</h3>
          <input
            type="search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search product"
            className="w-full rounded-xl border border-(--border) bg-(--surface-soft) px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent) sm:w-64"
          />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="rounded-xl border border-(--border) bg-(--surface-soft) px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
          >
            <option value={SORT_OPTIONS[0]}>Sort: Name (A-Z)</option>
            <option value={SORT_OPTIONS[1]}>Sort: Name (Z-A)</option>
            <option value={SORT_OPTIONS[2]}>Sort: Unit Price (Low-High)</option>
            <option value={SORT_OPTIONS[3]}>Sort: Unit Price (High-Low)</option>
            <option value={SORT_OPTIONS[4]}>Sort: Commission (Low-High)</option>
            <option value={SORT_OPTIONS[5]}>Sort: Commission (High-Low)</option>
          </select>
          <button
            type="button"
            onClick={handleStartCreate}
            className="rounded-full bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95"
          >
            Add Product
          </button>
        </div>

        {actionError && <p className="mt-3 text-sm text-rose-600">{actionError}</p>}
        {isLoading && <p className="mt-3 text-sm text-(--muted)">Loading products...</p>}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--border) text-(--soft-text)">
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Category</th>
                <th className="px-2 py-2 font-medium">Base Unit</th>
                <th className="px-2 py-2 font-medium">Unit Price</th>
                <th className="px-2 py-2 font-medium">Commission %</th>
                <th className="px-2 py-2 font-medium">Vendor</th>
                <th className="px-2 py-2 font-medium">Images</th>
                <th className="px-2 py-2 font-medium">Active</th>
                <th className="px-2 py-2 font-medium">Edit</th>
                <th className="px-2 py-2 font-medium">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.productID} className="border-b border-(--border) last:border-0">
                  <td className="px-2 py-3">{product.name}</td>
                  <td className="px-2 py-3">{product.category}</td>
                  <td className="px-2 py-3">{product.baseUnit}</td>
                  <td className="px-2 py-3">{product.unitPrice}</td>
                  <td className="px-2 py-3">{product.commission}</td>
                  <td className="px-2 py-3">
                    {vendors.find((v) => v.vendorID === product.vendorID)?.vendorName ?? <span className="text-(--muted)">—</span>}
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={() => handleOpenImagePreview(product)}
                      className="rounded-lg border border-(--border) px-2 py-1 text-xs font-semibold text-foreground transition hover:border-(--accent)"
                    >
                      Preview ({Array.isArray(product.images) ? product.images.length : 0})
                    </button>
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={product.isActive}
                      onClick={() => handleToggleActive(product.productID)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                        product.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                          product.isActive ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={() => handleEdit(product)}
                      className="rounded-lg border border-(--border) px-2 py-1 text-xs font-semibold text-foreground transition hover:border-(--accent)"
                    >
                      Edit
                    </button>
                  </td>
                  <td className="px-2 py-3">
                    <button
                      type="button"
                      onClick={() => handleDelete(product.productID)}
                      className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-80 flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-20 backdrop-blur-[2px] sm:items-center sm:pt-4">
          <div className="w-full max-w-3xl rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-[0_28px_80px_rgba(68,39,34,0.28)] sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-(--foreground-strong)">
                {editingProductId ? `Edit Product (${editingProductId})` : 'Add Product'}
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
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Product name"
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
                  value={form.baseUnit}
                  onChange={(event) => setForm((prev) => ({ ...prev, baseUnit: event.target.value }))}
                  placeholder="Base unit (e.g. Bag, Piece, Box)"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  required
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unitPrice}
                  onChange={(event) => setForm((prev) => ({ ...prev, unitPrice: event.target.value }))}
                  placeholder="Unit price"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  required
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.commission}
                  onChange={(event) => setForm((prev) => ({ ...prev, commission: event.target.value }))}
                  placeholder="Commission (%)"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  required
                />
                <select
                  value={form.vendorID}
                  onChange={(event) => setForm((prev) => ({ ...prev, vendorID: event.target.value }))}
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                >
                  <option value="">No vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.vendorID} value={vendor.vendorID}>{vendor.vendorName}</option>
                  ))}
                </select>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(event) => setSelectedImageFiles(Array.from(event.target.files ?? []))}
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-(--surface-soft) file:px-3 file:py-1.5 file:text-xs file:font-semibold"
                />
              </div>

              {form.images.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-(--foreground-strong)">Existing Images</p>
                  <div className="flex flex-wrap gap-2">
                    {form.images.map((imageUrl, index) => (
                      <div key={`${imageUrl}-${index}`} className="inline-flex items-center gap-2 rounded-full bg-(--surface-soft) px-3 py-1 text-xs text-foreground">
                        <span>Image {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((prev) => ({
                              ...prev,
                              images: prev.images.filter((_, itemIndex) => itemIndex !== index),
                            }));
                          }}
                          className="text-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedImageFiles.length > 0 && (
                <p className="text-xs text-(--muted)">
                  New files selected: {selectedImageFiles.map((file) => file.name).join(', ')}
                </p>
              )}

              <label className="inline-flex items-center gap-2 text-sm text-(--foreground-strong)">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                Active Product
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-full bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95"
                >
                  {isSubmitting ? 'Saving...' : editingProductId ? 'Update Product' : 'Create Product'}
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

      {previewProduct && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-90 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-20 backdrop-blur-[2px] sm:items-center sm:pt-4">
          <div className="w-full max-w-3xl rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-[0_28px_80px_rgba(68,39,34,0.28)] sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-(--foreground-strong)">
                Photos - {previewProduct.name}
              </p>
              <button
                type="button"
                onClick={handleCloseImagePreview}
                className="rounded-full border border-(--border) px-2.5 py-1 text-xs font-semibold text-foreground transition hover:border-(--accent)"
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(event) => setPreviewNewFiles(Array.from(event.target.files ?? []))}
                className="w-full rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-(--surface-soft) file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              />

              {previewNewFiles.length > 0 && (
                <p className="text-xs text-(--muted)">
                  New files selected: {previewNewFiles.map((file) => file.name).join(', ')}
                </p>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {previewImages.length === 0 ? (
                  <p className="text-sm text-(--muted)">No saved photos yet.</p>
                ) : (
                  previewImages.map((imageUrl, index) => (
                    <div key={`${imageUrl}-${index}`} className="rounded-xl border border-(--border) bg-(--surface-soft) p-2">
                      <img
                        src={imageUrl}
                        alt={`Product image ${index + 1}`}
                        className="h-32 w-full rounded-lg object-cover"
                      />
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPreviewImages((prev) => prev.filter((_, i) => i !== index))}
                          className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSavePreviewImages}
                  disabled={isPreviewSaving}
                  className="rounded-full bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95 disabled:opacity-60"
                >
                  {isPreviewSaving ? 'Saving...' : 'Save Photos'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseImagePreview}
                  className="rounded-full border border-(--border) bg-(--surface) px-4 py-2 text-xs font-semibold text-foreground transition hover:border-(--accent)"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
