'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  createProduct,
  deleteProduct,
  subscribeProducts,
  updateProduct,
  updateProductActive,
  updateProductVerificationStatus,
} from '@/lib/firestore-products';
import { uploadProductImage } from '@/lib/storage-products';
import {
  addProductToVendor,
  removeProductFromVendor,
  subscribeVendors,
} from '@/lib/firestore-vendors';

const CATEGORY_OPTIONS = [
  'Construction Materials',
  'Electrical & Plumbing',
  'Finishing Materials',
];

const PRODUCT_TYPE_OPTIONS = [
  { value: 'brick_block', label: 'Brick/Block', units: 'Nos' },
  { value: 'tiles_marble', label: 'Tiles/Marble', units: 'Pieces per Box,Sales' },
  { value: 'paints_coatings', label: 'Paints & Coatings', units: '1Nos' },
  { value: 'tmt_linear', label: 'TMT Steel & Linear Materials', units: 'Nos' },
  { value: 'custom', label: 'Custom', units: 'Custom' },
];

const PRODUCT_TYPE_LABELS = PRODUCT_TYPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

function getUnitsForProductType(productType) {
  return PRODUCT_TYPE_OPTIONS.find((option) => option.value === productType)?.units ?? 'Custom';
}

function getNormalizedUnitsCsv(productType, unitsCsv) {
  if (productType === 'custom') {
    return unitsCsv
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(',');
  }

  return getUnitsForProductType(productType);
}

function getDefaultAttributes() {
  return {
    length: '',
    width: '',
    height: '',
    dimensionUnit: 'mm',
    paintMeasureUnit: 'Liter',
    coverageAreaPer: '',
    weightPerMeter: '',
  };
}

function mapAttributesForForm(productType, rawAttributes) {
  const defaults = getDefaultAttributes();
  const source = rawAttributes && typeof rawAttributes === 'object' ? rawAttributes : {};

  if (productType === 'brick_block') {
    return {
      ...defaults,
      length: String(source.length ?? ''),
      width: String(source.width ?? ''),
      height: String(source.height ?? ''),
      dimensionUnit: String(source.dimensionUnit ?? 'mm'),
    };
  }

  if (productType === 'tiles_marble') {
    return {
      ...defaults,
      length: String(source.length ?? ''),
      width: String(source.width ?? ''),
      dimensionUnit: String(source.dimensionUnit ?? 'mm'),
    };
  }

  if (productType === 'paints_coatings') {
    return {
      ...defaults,
      paintMeasureUnit: String(source.paintMeasureUnit ?? source.measureUnit ?? 'Liter'),
      coverageAreaPer: String(source.coverageAreaPer ?? ''),
    };
  }

  if (productType === 'tmt_linear') {
    return {
      ...defaults,
      length: String(source.length ?? ''),
      weightPerMeter: String(source.weightPerMeter ?? ''),
    };
  }

  return defaults;
}

function buildAttributesForPayload(productType, attributes) {
  if (productType === 'brick_block') {
    return {
      length: Number(attributes.length),
      width: Number(attributes.width),
      height: Number(attributes.height),
      dimensionUnit: attributes.dimensionUnit,
    };
  }

  if (productType === 'tiles_marble') {
    return {
      length: Number(attributes.length),
      width: Number(attributes.width),
      dimensionUnit: attributes.dimensionUnit,
    };
  }

  if (productType === 'paints_coatings') {
    return {
      paintMeasureUnit: attributes.paintMeasureUnit,
      coverageAreaPer: Number(attributes.coverageAreaPer),
    };
  }

  if (productType === 'tmt_linear') {
    return {
      length: Number(attributes.length),
      weightPerMeter: Number(attributes.weightPerMeter),
    };
  }

  return {};
}

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
  productType: PRODUCT_TYPE_OPTIONS[0].value,
  unitsCsv: PRODUCT_TYPE_OPTIONS[0].units,
  productAttributes: getDefaultAttributes(),
  baseUnit: 'Nos',
  unitPrice: '',
  commission: '',
  lead_time_days: '',
  perKmPerUnit: '',
  min_deliverable_quantity: '1',
  max_deliverable_quantity: '999',
  adminVerificationStatus: 'approved',
  images: [],
  isActive: true,
  vendorID: '',
};

export default function ProductsSection({
  scopedVendorID = '',
  canCreateProduct = true,
  createDisabledReason = '',
}) {
  const isVendorScoped = Boolean(scopedVendorID);
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

    const vendorScoped = scopedVendorID
      ? products.filter((product) => product.vendorID === scopedVendorID)
      : products;

    const searched = vendorScoped.filter((product) => {
      if (!normalizedSearch) return true;
      return (
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.category.toLowerCase().includes(normalizedSearch) ||
        String(product.unitsCsv ?? product.baseUnit ?? '').toLowerCase().includes(normalizedSearch)
      );
    });

    const sorted = [...searched].sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'price-asc') return a.unitPrice - b.unitPrice;
      if (sortBy === 'price-desc') return b.unitPrice - a.unitPrice;
      if (isVendorScoped) return 0;
      if (sortBy === 'commission-asc') return a.commission - b.commission;
      if (sortBy === 'commission-desc') return b.commission - a.commission;
      return 0;
    });

    return sorted;
  }, [isVendorScoped, products, scopedVendorID, searchValue, sortBy]);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, images: [], productAttributes: getDefaultAttributes(), vendorID: scopedVendorID || '' });
    setEditingProductId(null);
    setSelectedImageFiles([]);
  };

  const handleStartCreate = () => {
    if (isVendorScoped && !canCreateProduct) {
      setActionError(createDisabledReason || 'Complete required vendor documents before adding products.');
      return;
    }

    resetForm();
    setShowForm(true);
  };

  const handleCloseFormModal = () => {
    resetForm();
    setShowForm(false);
  };

  const handleEdit = (product) => {
    const productType = String(product.productType ?? 'custom');
    const unitsCsv = String(product.unitsCsv ?? product.baseUnit ?? '');

    setEditingProductId(product.productID);
    setForm({
      name: product.name,
      category: product.category,
      productType,
      unitsCsv: getNormalizedUnitsCsv(productType, unitsCsv),
      productAttributes: mapAttributesForForm(productType, product.productAttributes),
      baseUnit: String(product.baseUnit ?? unitsCsv.split(',')[0] ?? ''),
      unitPrice: String(product.unitPrice),
      commission: String(product.commission),
      lead_time_days: String(product.lead_time_days ?? 0),
      perKmPerUnit: String(product.perKmPerUnit ?? product.per_km_delivery_price ?? 0),
      min_deliverable_quantity: String(product.min_deliverable_quantity ?? 1),
      max_deliverable_quantity: String(product.max_deliverable_quantity ?? 999),
      adminVerificationStatus: product.adminVerificationStatus ?? 'approved',
      images: Array.isArray(product.images) ? product.images : [],
      isActive: Boolean(product.isActive),
      vendorID: product.vendorID ?? '',
    });
    setSelectedImageFiles([]);
    setShowForm(true);
  };

  const handleDelete = (productID) => {
    setActionError('');
    const product = products.find((item) => item.productID === productID);

    void (async () => {
      try {
        await deleteProduct(productID);

        if (product?.vendorID) {
          await removeProductFromVendor(product.vendorID, productID);
        }

        if (editingProductId === productID) {
          resetForm();
          setShowForm(false);
        }
      } catch {
        setActionError('Delete failed. Please try again.');
      }
    })();
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

  const handleVerificationChange = (productID, status) => {
    const product = products.find((item) => item.productID === productID);

    if (status === 'approved' && Number(product?.commission ?? 0) <= 0) {
      setActionError('Set a commission greater than 0 before approving this product.');
      return;
    }

    setActionError('');
    void updateProductVerificationStatus(productID, status).catch(() => {
      setActionError('Could not update verification status.');
    });
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
        lead_time_days: Number(previewProduct.lead_time_days ?? 0),
        per_km_delivery_price: Number(previewProduct.perKmPerUnit ?? previewProduct.per_km_delivery_price ?? 0),
        perKmPerUnit: Number(previewProduct.perKmPerUnit ?? previewProduct.per_km_delivery_price ?? 0),
        min_deliverable_quantity: Number(previewProduct.min_deliverable_quantity ?? 1),
        max_deliverable_quantity: Number(previewProduct.max_deliverable_quantity ?? 999),
        adminVerificationStatus: previewProduct.adminVerificationStatus ?? 'approved',
        images: nextImages,
        isActive: Boolean(previewProduct.isActive),
        vendorID: String(previewProduct.vendorID ?? ''),
      });

      handleCloseImagePreview();
    } catch {
      setActionError('Image update failed. Please try again.');
      setIsPreviewSaving(false);
    }
  };

  const handleFormSubmit = async (event) => {
    event.preventDefault();

    if (isVendorScoped && !canCreateProduct) {
      setActionError(createDisabledReason || 'Complete required vendor documents before adding products.');
      return;
    }

    const trimmedName = form.name.trim();
    const normalizedUnitsCsv = getNormalizedUnitsCsv(form.productType, form.unitsCsv);
    const resolvedBaseUnit = String(normalizedUnitsCsv.split(',')[0] ?? '').trim();

    if (!trimmedName || !resolvedBaseUnit) {
      setActionError('Product name and unit configuration are required.');
      return;
    }

    if (form.productType === 'custom' && !normalizedUnitsCsv) {
      setActionError('Custom units are required for Custom product type.');
      return;
    }

    const parsedUnitPrice = Number(form.unitPrice);
    const parsedCommission = Number(form.commission);
    const parsedLeadTime = Number(form.lead_time_days);
    const parsedPerKmPerUnit = Number(form.perKmPerUnit);
    const parsedMinQty = Number(form.min_deliverable_quantity);
    const parsedMaxQty = Number(form.max_deliverable_quantity);

    if (!Number.isFinite(parsedUnitPrice)) return;

    if (!isVendorScoped && !Number.isFinite(parsedCommission)) return;

    if (!Number.isInteger(parsedLeadTime) || parsedLeadTime < 0) {
      setActionError('Lead time must be a non-negative whole number.');
      return;
    }

    if (!Number.isFinite(parsedPerKmPerUnit) || parsedPerKmPerUnit < 0) {
      setActionError('perKmPerUnit must be a non-negative number.');
      return;
    }

    if (!Number.isInteger(parsedMinQty) || parsedMinQty <= 0 || !Number.isInteger(parsedMaxQty) || parsedMaxQty < parsedMinQty) {
      setActionError('Deliverable quantity range is invalid.');
      return;
    }

    if (form.productType === 'brick_block') {
      const length = Number(form.productAttributes.length);
      const width = Number(form.productAttributes.width);
      const height = Number(form.productAttributes.height);
      if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        setActionError('Brick/Block attributes L, W, and H must be positive numbers.');
        return;
      }
    }

    if (form.productType === 'tiles_marble') {
      const length = Number(form.productAttributes.length);
      const width = Number(form.productAttributes.width);
      if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(width) || width <= 0) {
        setActionError('Tiles/Marble attributes L and W must be positive numbers.');
        return;
      }
    }

    if (form.productType === 'paints_coatings') {
      const coverageAreaPer = Number(form.productAttributes.coverageAreaPer);
      if (!Number.isFinite(coverageAreaPer) || coverageAreaPer <= 0) {
        setActionError('Coverage Area per must be a positive number.');
        return;
      }
    }

    if (form.productType === 'tmt_linear') {
      const length = Number(form.productAttributes.length);
      const weightPerMeter = Number(form.productAttributes.weightPerMeter);
      if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(weightPerMeter) || weightPerMeter <= 0) {
        setActionError('TMT attributes L and Weight/meter must be positive numbers.');
        return;
      }
    }

    const resolvedVendorID = scopedVendorID || form.vendorID;
    if (!resolvedVendorID) {
      setActionError('Please select a vendor for this product.');
      return;
    }

    setActionError('');
    setIsSubmitting(true);

    try {
      const existingProduct = editingProductId
        ? products.find((item) => item.productID === editingProductId)
        : null;
      const resolvedCommission = isVendorScoped
        ? Number(existingProduct?.commission ?? 0)
        : parsedCommission;

      const uploadedImageUrls = await Promise.all(
        selectedImageFiles.map((file) => uploadProductImage(file)),
      );

      const mergedImages = [...form.images, ...uploadedImageUrls];

      const payload = {
        name: trimmedName,
        category: form.category,
        productType: form.productType,
        unitsCsv: normalizedUnitsCsv,
        productAttributes: buildAttributesForPayload(form.productType, form.productAttributes),
        baseUnit: resolvedBaseUnit,
        unitPrice: parsedUnitPrice,
        commission: resolvedCommission,
        lead_time_days: parsedLeadTime,
        per_km_delivery_price: parsedPerKmPerUnit,
        perKmPerUnit: parsedPerKmPerUnit,
        min_deliverable_quantity: parsedMinQty,
        max_deliverable_quantity: parsedMaxQty,
        adminVerificationStatus: isVendorScoped ? 'pending' : (form.adminVerificationStatus ?? 'approved'),
        images: mergedImages,
        isActive: form.isActive,
        vendorID: resolvedVendorID,
      };

      if (editingProductId) {
        await updateProduct(editingProductId, payload);

        if (existingProduct?.vendorID && existingProduct.vendorID !== resolvedVendorID) {
          await removeProductFromVendor(existingProduct.vendorID, editingProductId);
        }

        await addProductToVendor(resolvedVendorID, editingProductId);
      } else {
        const newProductID = await createProduct(payload);
        await addProductToVendor(resolvedVendorID, newProductID);
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
            {!isVendorScoped && <option value={SORT_OPTIONS[4]}>Sort: Commission (Low-High)</option>}
            {!isVendorScoped && <option value={SORT_OPTIONS[5]}>Sort: Commission (High-Low)</option>}
          </select>
          <button
            type="button"
            onClick={handleStartCreate}
            disabled={isVendorScoped && !canCreateProduct}
            className="rounded-full bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
            title={isVendorScoped && !canCreateProduct ? (createDisabledReason || 'Complete required vendor documents before adding products.') : ''}
          >
            Add Product
          </button>
        </div>

        {isVendorScoped && !canCreateProduct && (
          <p className="mt-3 text-sm text-amber-700">
            {createDisabledReason || 'Complete required vendor documents before adding products.'}
          </p>
        )}

        {actionError && <p className="mt-3 text-sm text-rose-600">{actionError}</p>}
        {isLoading && <p className="mt-3 text-sm text-(--muted)">Loading products...</p>}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--border) text-(--soft-text)">
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Category</th>
                <th className="px-2 py-2 font-medium">Product Type</th>
                <th className="px-2 py-2 font-medium">Units</th>
                <th className="px-2 py-2 font-medium">Unit Price</th>
                {!isVendorScoped && <th className="px-2 py-2 font-medium">Commission %</th>}
                <th className="px-2 py-2 font-medium">Expected Delivery Time (Days)</th>
                <th className="px-2 py-2 font-medium">Per KM Delivery Cost</th>
                <th className="px-2 py-2 font-medium">Min Qty</th>
                <th className="px-2 py-2 font-medium">Max Qty</th>
                <th className="px-2 py-2 font-medium">Verification</th>
                {!scopedVendorID && <th className="px-2 py-2 font-medium">Vendor</th>}
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
                  <td className="px-2 py-3">{PRODUCT_TYPE_LABELS[String(product.productType ?? 'custom')] ?? 'Custom'}</td>
                  <td className="px-2 py-3">{String(product.unitsCsv ?? product.baseUnit ?? '')}</td>
                  <td className="px-2 py-3">{product.unitPrice}</td>
                  {!isVendorScoped && <td className="px-2 py-3">{product.commission}</td>}
                  <td className="px-2 py-3">{product.lead_time_days ?? 0}</td>
                  <td className="px-2 py-3">{product.perKmPerUnit ?? product.per_km_delivery_price ?? 0}</td>
                  <td className="px-2 py-3">{product.min_deliverable_quantity ?? 1}</td>
                  <td className="px-2 py-3">{product.max_deliverable_quantity ?? 999}</td>
                  <td className="px-2 py-3">
                    {scopedVendorID ? (
                      <span className="text-xs font-semibold capitalize text-(--muted)">{product.adminVerificationStatus ?? 'pending'}</span>
                    ) : (
                      <select
                        value={product.adminVerificationStatus ?? 'approved'}
                        onChange={(event) => handleVerificationChange(product.productID, event.target.value)}
                        className="rounded-lg border border-(--border) bg-white px-2 py-1 text-xs text-foreground outline-none"
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    )}
                  </td>
                  {!scopedVendorID && (
                    <td className="px-2 py-3">
                      {vendors.find((v) => v.vendorID === product.vendorID)?.vendorName ?? <span className="text-(--muted)">—</span>}
                    </td>
                  )}
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
                <select
                  value={form.productType}
                  onChange={(event) => {
                    const nextType = event.target.value;
                    setForm((prev) => ({
                      ...prev,
                      productType: nextType,
                      unitsCsv: getNormalizedUnitsCsv(nextType, prev.unitsCsv),
                      productAttributes: mapAttributesForForm(nextType, prev.productAttributes),
                    }));
                  }}
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                >
                  {PRODUCT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <input
                  value={form.unitsCsv}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setForm((prev) => ({
                      ...prev,
                      unitsCsv: prev.productType === 'custom' ? nextValue : getUnitsForProductType(prev.productType),
                    }));
                  }}
                  placeholder="Units (comma separated)"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  disabled={form.productType !== 'custom'}
                  required
                />

                {form.productType === 'brick_block' && (
                  <>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.productAttributes.length}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, length: event.target.value },
                      }))}
                      placeholder="L"
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.productAttributes.width}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, width: event.target.value },
                      }))}
                      placeholder="W"
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.productAttributes.height}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, height: event.target.value },
                      }))}
                      placeholder="H"
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                      required
                    />
                    <select
                      value={form.productAttributes.dimensionUnit}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, dimensionUnit: event.target.value },
                      }))}
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                    >
                      <option value="mm">mm</option>
                      <option value="inches">inches</option>
                    </select>
                  </>
                )}

                {form.productType === 'tiles_marble' && (
                  <>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.productAttributes.length}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, length: event.target.value },
                      }))}
                      placeholder="L"
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.productAttributes.width}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, width: event.target.value },
                      }))}
                      placeholder="W"
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                      required
                    />
                    <select
                      value={form.productAttributes.dimensionUnit}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, dimensionUnit: event.target.value },
                      }))}
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                    >
                      <option value="mm">mm</option>
                      <option value="inches">inches</option>
                    </select>
                  </>
                )}

                {form.productType === 'paints_coatings' && (
                  <>
                    <select
                      value={form.productAttributes.paintMeasureUnit}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, paintMeasureUnit: event.target.value },
                      }))}
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                    >
                      <option value="Liter">Liter</option>
                      <option value="KG">KG</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.productAttributes.coverageAreaPer}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, coverageAreaPer: event.target.value },
                      }))}
                      placeholder="Coverage Area per"
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                      required
                    />
                  </>
                )}

                {form.productType === 'tmt_linear' && (
                  <>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.productAttributes.length}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, length: event.target.value },
                      }))}
                      placeholder="L"
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.productAttributes.weightPerMeter}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        productAttributes: { ...prev.productAttributes, weightPerMeter: event.target.value },
                      }))}
                      placeholder="Weight / meter"
                      className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                      required
                    />
                  </>
                )}
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
                {!isVendorScoped && (
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
                )}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.lead_time_days}
                  onChange={(event) => setForm((prev) => ({ ...prev, lead_time_days: event.target.value }))}
                  placeholder="Expected delivery time (days)"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  required
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.perKmPerUnit}
                  onChange={(event) => setForm((prev) => ({ ...prev, perKmPerUnit: event.target.value }))}
                  placeholder="Per KM Delivery Cost"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  required
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.min_deliverable_quantity}
                  onChange={(event) => setForm((prev) => ({ ...prev, min_deliverable_quantity: event.target.value }))}
                  placeholder="Min deliverable quantity"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  required
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.max_deliverable_quantity}
                  onChange={(event) => setForm((prev) => ({ ...prev, max_deliverable_quantity: event.target.value }))}
                  placeholder="Max deliverable quantity"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  required
                />
                {!scopedVendorID && (
                  <select
                    value={form.adminVerificationStatus}
                    onChange={(event) => setForm((prev) => ({ ...prev, adminVerificationStatus: event.target.value }))}
                    className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                  >
                    <option value="approved">Verification: Approved</option>
                    <option value="pending">Verification: Pending</option>
                    <option value="rejected">Verification: Rejected</option>
                  </select>
                )}
                {!scopedVendorID && (
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
                )}
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
