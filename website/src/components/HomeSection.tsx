'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import EstimatorEngine from './EstimatorEngine';
import { ArrowDownWideNarrow, Check, Minus, Plus, Search, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { subscribeProducts, type ProductDoc } from '@/lib/firestore-products';
import { subscribeVendors, type VendorDoc } from '@/lib/firestore-vendors';
import Cart from '@/components/cart';

const CATEGORY_OPTIONS = [
  'All Categories',
  'Construction Materials',
  'Electrical & Plumbing',
  'Finishing Materials',
];

const SORT_OPTIONS = [
  'Recommended',
  'Price: Low to High',
  'Price: High to Low',
  'Newest Arrivals',
];

const PRODUCTS_PER_BATCH = 12;

export default function HomeSection() {
  const prefersReducedMotion = useReducedMotion();
  const [searchValue, setSearchValue] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_OPTIONS[0]);
  const [selectedSort, setSelectedSort] = useState(SORT_OPTIONS[0]);
  const [products, setProducts] = useState<ProductDoc[]>([]);
  const [vendors, setVendors] = useState<VendorDoc[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [quantityByProduct, setQuantityByProduct] = useState<Record<string, number>>({});
  const [cartByProduct, setCartByProduct] = useState<Record<string, number>>({});
  const [imageIndexByProduct, setImageIndexByProduct] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [recentlyAddedProductID, setRecentlyAddedProductID] = useState<string | null>(null);
  const [visibleProductCount, setVisibleProductCount] = useState(PRODUCTS_PER_BATCH);

  const [estimatorProductSelection, setEstimatorProductSelection] = useState('');

  // Memoize vendorById before any effect uses it
  const vendorById = useMemo(() => {
    return vendors.reduce<Record<string, VendorDoc>>((acc, vendor) => {
      acc[vendor.vendorID] = vendor;
      return acc;
    }, {});
  }, [vendors]);

  useEffect(() => {
    const savedCart = window.localStorage.getItem('cart-by-product');
    const savedQuantities = window.localStorage.getItem('quantity-by-product');

    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart) as Record<string, number>;
        const normalized = Object.entries(parsed).reduce<Record<string, number>>((acc, [key, value]) => {
          const next = Number(value);
          if (key && Number.isFinite(next) && next > 0) {
            acc[key] = Math.floor(next);
          }
          return acc;
        }, {});
        setCartByProduct(normalized);
      } catch {
        // Ignore corrupted local storage entries.
      }
    }

    if (savedQuantities) {
      try {
        const parsed = JSON.parse(savedQuantities) as Record<string, number>;
        const normalized = Object.entries(parsed).reduce<Record<string, number>>((acc, [key, value]) => {
          const next = Number(value);
          if (key && Number.isFinite(next) && next > 0) {
            acc[key] = Math.floor(next);
          }
          return acc;
        }, {});
        setQuantityByProduct(normalized);
      } catch {
        // Ignore corrupted local storage entries.
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('cart-by-product', JSON.stringify(cartByProduct));
  }, [cartByProduct]);

  useEffect(() => {
    window.localStorage.setItem('quantity-by-product', JSON.stringify(quantityByProduct));
  }, [quantityByProduct]);

  useEffect(() => {
    const unsubscribeProducts = subscribeProducts(
      (nextProducts) => {
        setProducts(nextProducts);
        setIsLoadingProducts(false);
      },
      () => {
        setIsLoadingProducts(false);
      },
    );

    const unsubscribeVendors = subscribeVendors((nextVendors) => {
      setVendors(nextVendors);
    });

    return () => {
      unsubscribeProducts();
      unsubscribeVendors();
    };
  }, []);

  useEffect(() => {
    const handleOpenCartPanel = () => {
      setIsCartOpen(true);
    };

    window.addEventListener('open-cart-panel', handleOpenCartPanel);

    return () => {
      window.removeEventListener('open-cart-panel', handleOpenCartPanel);
    };
  }, []);

  useEffect(() => {
    if (!recentlyAddedProductID) return;

    const timeoutId = window.setTimeout(() => {
      setRecentlyAddedProductID(null);
    }, 950);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [recentlyAddedProductID]);


  const visibleProducts = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    const filtered = products.filter((product) => {
      if (!product.isActive) return false;
      if ((product.adminVerificationStatus ?? 'approved') !== 'approved') return false;

      const matchesCategory =
        selectedCategory === 'All Categories' || product.category === selectedCategory;

      if (!matchesCategory) return false;
      if (!normalizedSearch) return true;

      return (
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.category.toLowerCase().includes(normalizedSearch) ||
        product.baseUnit.toLowerCase().includes(normalizedSearch)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      if (selectedSort === 'Price: Low to High') return a.unitPrice - b.unitPrice;
      if (selectedSort === 'Price: High to Low') return b.unitPrice - a.unitPrice;
      if (selectedSort === 'Newest Arrivals') {
        const aDate = a.created_at?.toMillis?.() ?? 0;
        const bDate = b.created_at?.toMillis?.() ?? 0;
        return bDate - aDate;
      }

      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [products, searchValue, selectedCategory, selectedSort]);

  const displayedProducts = useMemo(() => {
    return visibleProducts.slice(0, visibleProductCount);
  }, [visibleProducts, visibleProductCount]);

  const estimatorProductOptions = useMemo(() => {
    return products
      .filter((product) => product.isActive && (product.adminVerificationStatus ?? 'approved') === 'approved')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((product) => {
        const vendorName = vendorById[product.vendorID]?.vendorName ?? 'No vendor';
        return {
          label: `${product.name} - ${vendorName}`,
          product,
          vendorName,
        };
      });
  }, [products, vendorById]);

  const estimatorSelectedOption = useMemo(() => {
    return estimatorProductOptions.find((option) => option.label === estimatorProductSelection) ?? null;
  }, [estimatorProductOptions, estimatorProductSelection]);

  const estimatorSelectedProduct = estimatorSelectedOption?.product ?? null;

  useEffect(() => {
    setVisibleProductCount(PRODUCTS_PER_BATCH);
  }, [searchValue, selectedCategory, selectedSort]);

  const totalCartItems = useMemo(() => {
    return Object.values(cartByProduct).reduce((sum, count) => sum + count, 0);
  }, [cartByProduct]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('cart-count-updated', {
        detail: { count: totalCartItems },
      }),
    );

    window.localStorage.setItem('cart-count', String(totalCartItems));
  }, [totalCartItems]);

  const cartItems = useMemo(() => {
    return Object.entries(cartByProduct)
      .map(([productID, quantity]) => {
        const product = products.find((item) => item.productID === productID);
        if (!product || quantity <= 0) return null;

        const vendor = vendorById[product.vendorID];
        const productWithGst = product as ProductDoc & { gstPercentage?: number };

        return {
          productID,
          quantity,
          name: product.name,
          vendorID: product.vendorID,
          vendorName: vendor?.vendorName ?? 'No vendor',
          lead_times_in_day: Number(product.lead_time_days ?? 0),
          leadTimeDays: Number(product.lead_time_days ?? 0),
          per_km_delivery_price: Number((product as ProductDoc & { perKmPerUnit?: number }).perKmPerUnit ?? product.per_km_delivery_price ?? 0),
          min_deliverable_quantity: Number(product.min_deliverable_quantity ?? 1),
          max_deliverable_quantity: Number(product.max_deliverable_quantity ?? 999),
          baseUnit: product.baseUnit,
          unitPrice: Number(product.unitPrice),
          gstPercentage: Number(productWithGst.gstPercentage ?? 0),
        };
      })
      .filter((item): item is {
        productID: string;
        quantity: number;
        name: string;
        vendorID: string;
        vendorName: string;
        lead_times_in_day: number;
        leadTimeDays: number;
        per_km_delivery_price: number;
        min_deliverable_quantity: number;
        max_deliverable_quantity: number;
        baseUnit: string;
        unitPrice: number;
        gstPercentage: number;
      } => item !== null);
  }, [cartByProduct, products, vendorById]);

  const totalCartAmount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [cartItems]);

  useEffect(() => {
    setImageIndexByProduct((prev) => {
      const nextIndexes: Record<string, number> = {};

      visibleProducts.forEach((product) => {
        const imageCount = Array.isArray(product.images) ? product.images.length : 0;
        if (imageCount > 0) {
          nextIndexes[product.productID] = (prev[product.productID] ?? 0) % imageCount;
        }
      });

      return nextIndexes;
    });
  }, [visibleProducts]);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const hasMultiImageProducts = visibleProducts.some(
      (product) => Array.isArray(product.images) && product.images.length > 1,
    );

    if (!hasMultiImageProducts) return;

    const intervalId = window.setInterval(() => {
      setImageIndexByProduct((prev) => {
        const nextIndexes = { ...prev };

        visibleProducts.forEach((product) => {
          const imageCount = Array.isArray(product.images) ? product.images.length : 0;
          if (imageCount > 1) {
            nextIndexes[product.productID] = ((nextIndexes[product.productID] ?? 0) + 1) % imageCount;
          }
        });

        return nextIndexes;
      });
    }, 3200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [prefersReducedMotion, visibleProducts]);

  const updateQuantity = (productID: string, nextQuantity: number) => {
    const product = products.find((item) => item.productID === productID);
    const minQty = Math.max(1, Number(product?.min_deliverable_quantity ?? 1));
    const maxQty = Math.max(minQty, Number(product?.max_deliverable_quantity ?? 999));
    const clamped = Math.min(maxQty, Math.max(minQty, nextQuantity));
    setQuantityByProduct((prev) => ({
      ...prev,
      [productID]: clamped,
    }));
  };

  const handleAddToCart = (productID: string) => {
    const product = products.find((item) => item.productID === productID);
    const minQty = Math.max(1, Number(product?.min_deliverable_quantity ?? 1));
    const maxQty = Math.max(minQty, Number(product?.max_deliverable_quantity ?? 999));
    const quantity = Math.min(maxQty, Math.max(minQty, quantityByProduct[productID] ?? minQty));
    setCartByProduct((prev) => ({
      ...prev,
      [productID]: (prev[productID] ?? 0) + quantity,
    }));
    setRecentlyAddedProductID(productID);
    window.dispatchEvent(
      new CustomEvent('cart-item-added', {
        detail: { productID, quantity },
      }),
    );
  };

  const handleDecreaseCartItem = (productID: string) => {
    setCartByProduct((prev) => {
      const current = prev[productID] ?? 0;
      if (current <= 1) {
        const { [productID]: _, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [productID]: current - 1,
      };
    });
  };

  const handleIncreaseCartItem = (productID: string) => {
    setCartByProduct((prev) => ({
      ...prev,
      [productID]: (prev[productID] ?? 0) + 1,
    }));
  };

  const handleRemoveCartItem = (productID: string) => {
    setCartByProduct((prev) => {
      const { [productID]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleClearCart = () => {
    setCartByProduct({});
    window.localStorage.removeItem('cart-by-product');
  };

  const handleSetImageIndex = (productID: string, imageIndex: number) => {
    setImageIndexByProduct((prev) => ({
      ...prev,
      [productID]: imageIndex,
    }));
  };

  return (
    <section id="top" className="section-pad relative overflow-hidden bg-transparent pt-32 sm:pt-40">
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? undefined : { duration: 0.65, ease: 'easeOut' }}
        className="relative left-1/2 w-[90%] max-w-none -translate-x-1/2 rounded-4xl bg-transparent px-5 py-6 sm:px-8 sm:py-8 lg:px-10"
      >
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-(--foreground-strong) sm:text-3xl lg:text-4xl">
                Search materials,
                <br />
                narrow by category,
                <br />
                and sort supply options in one pass.
              </h1>
              <p className="text-sm leading-relaxed text-(--muted) sm:text-base">
                Built for fast procurement workflows with a single control row that keeps search, filtering,
                and ranking immediately accessible.
              </p>
            </div>

            <div className="p-3 sm:p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(13rem,0.7fr)_minmax(13rem,0.7fr)]">
                <label className="group flex items-center gap-3 rounded-[1.35rem] border border-(--border) bg-white/70 px-4 py-3 transition focus-within:border-(--accent) focus-within:bg-white">
                  <Search size={18} className="text-(--soft-text) transition group-focus-within:text-(--accent)" />
                  <input
                    type="search"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Search cement, tiles, sanitaryware..."
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-(--soft-text) outline-none"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-[1.35rem] border border-(--border) bg-white/70 px-4 py-3 transition focus-within:border-(--accent) focus-within:bg-white">
                  <SlidersHorizontal size={18} className="text-(--soft-text)" />
                  <select
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                    className="w-full bg-transparent text-sm text-foreground outline-none"
                    aria-label="Filter by category"
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-[1.35rem] border border-(--border) bg-white/70 px-4 py-3 transition focus-within:border-(--accent) focus-within:bg-white">
                  <ArrowDownWideNarrow size={18} className="text-(--soft-text)" />
                  <select
                    value={selectedSort}
                    onChange={(event) => setSelectedSort(event.target.value)}
                    className="w-full bg-transparent text-sm text-foreground outline-none"
                    aria-label="Sort products"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-6 bg-transparent p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-(--foreground-strong)">Products</p>
                  <button
                    type="button"
                    onClick={() => setIsCartOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-(--border) bg-transparent px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-(--accent)"
                    aria-label={`Open cart with ${totalCartItems} item${totalCartItems === 1 ? '' : 's'}`}
                  >
                    <ShoppingCart size={14} />
                    <span>Cart: {totalCartItems}</span>
                  </button>
                </div>

                {isLoadingProducts && <p className="text-sm text-(--muted)">Loading products...</p>}

                {!isLoadingProducts && visibleProducts.length === 0 && (
                  <p className="text-sm text-(--muted)">No products found for this search.</p>
                )}

                {visibleProducts.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {displayedProducts.map((product) => {
                      const productVendor = vendorById[product.vendorID];
                      const leadTimeDays = Number(product.lead_time_days ?? 0);
                      const hasLeadTime = Number.isFinite(leadTimeDays) && leadTimeDays > 0;
                      const productWithPerKmPerUnit = product as ProductDoc & { perKmPerUnit?: number };
                      const perKmPerUnit = Number(productWithPerKmPerUnit.perKmPerUnit ?? product.per_km_delivery_price ?? 0);
                      const minQty = Math.max(1, Number(product.min_deliverable_quantity ?? 1));
                      const maxQty = Math.max(minQty, Number(product.max_deliverable_quantity ?? 999));
                      const productImages = Array.isArray(product.images)
                        ? product.images.filter((imageUrl) => Boolean(imageUrl))
                        : [];
                      const activeImageIndex = productImages.length
                        ? (imageIndexByProduct[product.productID] ?? 0) % productImages.length
                        : 0;
                      const activeImageUrl = productImages[activeImageIndex];
                      const rawSelectedQuantity = quantityByProduct[product.productID] ?? minQty;
                      const selectedQuantity = Math.min(maxQty, Math.max(minQty, rawSelectedQuantity));
                      const deliveryCostByQty = selectedQuantity * perKmPerUnit;
                      const isRecentlyAdded = recentlyAddedProductID === product.productID;

                      return (
                        <motion.article
                          key={product.productID}
                          className="glass-card-soft flex h-full flex-col rounded-2xl p-3"
                          whileHover={prefersReducedMotion ? undefined : { y: -4, scale: 1.02, boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                        >
                          <div className="relative aspect-16/10 overflow-hidden rounded-xl bg-(--surface-soft)">
                            {activeImageUrl ? (
                              <>
                                <AnimatePresence initial={false} mode="wait">
                                  <motion.img
                                    key={`${product.productID}-${activeImageIndex}-${activeImageUrl}`}
                                    src={activeImageUrl}
                                    alt={`${product.name} image ${activeImageIndex + 1}`}
                                    className="h-full w-full object-cover"
                                    initial={prefersReducedMotion ? false : { opacity: 0, x: 16 }}
                                    animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: -16 }}
                                    transition={{ duration: 0.35, ease: 'easeOut' }}
                                  />
                                </AnimatePresence>

                                {productImages.length > 1 && (
                                  <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
                                    {productImages.map((_, index) => (
                                      <button
                                        key={`${product.productID}-dot-${index}`}
                                        type="button"
                                        onClick={() => handleSetImageIndex(product.productID, index)}
                                        aria-label={`Show image ${index + 1} for ${product.name}`}
                                        className={`h-2.5 rounded-full transition ${
                                          index === activeImageIndex
                                            ? 'w-5 bg-white'
                                            : 'w-2.5 bg-white/60 hover:bg-white/80'
                                        }`}
                                      />
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-(--soft-text)">
                                No image
                              </div>
                            )}
                          </div>

                          <div className="mt-3 flex flex-1 flex-col">
                            <p className="text-sm font-semibold leading-snug text-(--foreground-strong)">{product.name}</p>

                            <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                              <div className="rounded-lg border border-(--border) bg-white/60 px-2 py-1.5 text-(--muted)">
                                Vendor: <span className="font-medium text-(--foreground-strong)">{productVendor?.vendorName ?? 'No vendor'}</span>
                              </div>
                              <div className="rounded-lg border border-(--border) bg-white/60 px-2 py-1.5 text-(--muted)">
                                Expected Delivery Time: <span className="font-medium text-(--foreground-strong)">{hasLeadTime ? `${leadTimeDays}d` : 'N/A'}</span>
                              </div>
                              <div className="rounded-lg border border-(--border) bg-white/60 px-2 py-1.5 text-(--muted)">
                                Per KM Delivery Cost: <span className="font-medium text-(--foreground-strong)">Rs {perKmPerUnit.toFixed(2)}</span>
                              </div>
                              <div className="rounded-lg border border-(--border) bg-white/60 px-2 py-1.5 text-(--muted)">
                                Qty: <span className="font-medium text-(--foreground-strong)">{minQty}-{maxQty}</span>
                              </div>
                            </div>

                            <p className="mt-2 text-base font-semibold text-(--foreground-strong)">
                              Rs {product.unitPrice.toFixed(2)}
                              <span className="ml-1 text-xs font-medium text-(--muted)">/ {product.baseUnit}</span>
                            </p>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <div className="inline-flex flex-1 items-center rounded-xl border border-(--border) bg-white/70">
                              <button
                                type="button"
                                aria-label={`Decrease quantity for ${product.name}`}
                                onClick={() => updateQuantity(product.productID, Math.max(minQty, selectedQuantity - 1))}
                                className="px-2 py-2 text-(--soft-text) transition hover:text-foreground"
                              >
                                <Minus size={14} />
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={selectedQuantity}
                                onChange={(event) => {
                                  const nextValue = event.target.value.replace(/\D/g, '');
                                  const parsed = Number(nextValue || minQty);
                                  const bounded = Math.min(maxQty, Math.max(minQty, parsed));
                                  updateQuantity(product.productID, bounded);
                                }}
                                className="w-12 border-x border-(--border) bg-transparent px-1 py-2 text-center text-xs font-semibold text-foreground outline-none"
                              />
                              <button
                                type="button"
                                aria-label={`Increase quantity for ${product.name}`}
                                onClick={() => updateQuantity(product.productID, Math.min(maxQty, selectedQuantity + 1))}
                                className="px-2 py-2 text-(--soft-text) transition hover:text-foreground"
                              >
                                <Plus size={14} />
                              </button>
                            </div>

                            <motion.button
                              type="button"
                              onClick={() => handleAddToCart(product.productID)}
                              whileTap={{ scale: 0.98 }}
                              animate={
                                isRecentlyAdded && !prefersReducedMotion
                                  ? { scale: [1, 1.04, 1] }
                                  : undefined
                              }
                              transition={{ duration: 0.34, ease: 'easeOut' }}
                              className="relative overflow-hidden rounded-xl bg-(--accent) px-3.5 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95"
                            >
                              <AnimatePresence mode="wait" initial={false}>
                                {isRecentlyAdded ? (
                                  <motion.span
                                    key="added"
                                    initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                                    transition={{ duration: 0.2, ease: 'easeOut' }}
                                    className="inline-flex items-center gap-1"
                                  >
                                    <Check size={12} />
                                    Added
                                  </motion.span>
                                ) : (
                                  <motion.span
                                    key="default"
                                    initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                                    transition={{ duration: 0.2, ease: 'easeOut' }}
                                  >
                                    Add to Cart
                                  </motion.span>
                                )}
                              </AnimatePresence>

                              {!prefersReducedMotion && isRecentlyAdded && (
                                <motion.span
                                  aria-hidden
                                  initial={{ opacity: 0.35, scale: 0.92 }}
                                  animate={{ opacity: 0, scale: 1.55 }}
                                  transition={{ duration: 0.45, ease: 'easeOut' }}
                                  className="pointer-events-none absolute inset-0 rounded-full border border-white/45"
                                />
                              )}
                            </motion.button>
                          </div>
                        </motion.article>
                      );
                    })}
                  </div>
                )}

                {visibleProducts.length > displayedProducts.length && (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setVisibleProductCount((prev) => prev + PRODUCTS_PER_BATCH)}
                      className="rounded-full border border-(--border) bg-(--surface) px-4 py-2 text-xs font-semibold text-foreground transition hover:border-(--accent) hover:bg-(--surface-soft)"
                    >
                      Load More
                    </button>
                  </div>
                )}

                <section className="mt-8 rounded-3xl border border-(--border) bg-linear-to-br from-white/85 via-white/70 to-[rgb(241,235,229,0.65)] p-5 shadow-[0_18px_54px_rgba(68,39,34,0.12)] sm:p-6">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.16em] text-(--soft-text)">ESTIMATOR ENGINE</p>
                      <h2 className="mt-2 text-xl font-semibold tracking-tight text-(--foreground-strong)">Wall Quantity Estimator</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-(--muted)">
                        Pick a brick or block product, enter wall dimensions in meters, and get a fast unit estimate with wastage included.
                      </p>
                    </div>

                    {estimatorSelectedOption && (
                      <motion.div
                        initial={prefersReducedMotion ? false : { opacity: 0, x: 12 }}
                        animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
                        className="rounded-full border border-(--border) bg-white/90 px-4 py-2 text-xs font-semibold tracking-[0.08em] text-(--foreground-strong)"
                      >
                        {estimatorSelectedOption.vendorName}
                      </motion.div>
                    )}
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                    <motion.div
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                      className="rounded-[28px] border border-(--border) bg-white/85 p-4 shadow-[0_14px_32px_rgba(68,39,34,0.08)]"
                    >
                      <label className="block">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-(--soft-text)">Choose Product</p>
                        <p className="mt-2 text-sm leading-relaxed text-(--muted)">
                          Search by product name and vendor. Select an approved brick or block item to unlock the estimator.
                        </p>
                        <input
                          type="text"
                          list="estimator-product-options"
                          value={estimatorProductSelection}
                          onChange={(event) => setEstimatorProductSelection(event.target.value)}
                          className="mt-4 w-full rounded-2xl border border-(--border) bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
                          aria-label="Estimator product selector"
                        />
                        <datalist id="estimator-product-options">
                          {estimatorProductOptions.map((option) => (
                            <option key={option.label} value={option.label} />
                          ))}
                        </datalist>
                      </label>
                    </motion.div>

                    <motion.div
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.2 }}
                      transition={{ duration: 0.5, ease: 'easeOut', delay: prefersReducedMotion ? 0 : 0.05 }}
                      className="rounded-[28px] border border-(--border) bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(244,238,232,0.86))] p-4 shadow-[0_14px_32px_rgba(68,39,34,0.08)]"
                    >
                      {estimatorSelectedProduct ? (
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl border border-white/70 bg-white/75 p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-(--soft-text)">Product</p>
                            <p className="mt-2 text-sm font-semibold text-(--foreground-strong)">{estimatorSelectedProduct.name}</p>
                          </div>
                          <div className="rounded-2xl border border-white/70 bg-white/75 p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-(--soft-text)">Type</p>
                            <p className="mt-2 text-sm font-semibold text-(--foreground-strong)">{estimatorSelectedProduct.productType.replaceAll('_', ' ')}</p>
                          </div>
                          <div className="rounded-2xl border border-white/70 bg-white/75 p-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-(--soft-text)">Unit</p>
                            <p className="mt-2 text-sm font-semibold text-(--foreground-strong)">{estimatorSelectedProduct.baseUnit || 'Nos'}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-full min-h-32 items-center justify-center rounded-2xl border border-dashed border-(--border) bg-white/55 px-4 py-8 text-center text-sm leading-relaxed text-(--muted)">
                          Select a product above to open the estimator.
                        </div>
                      )}
                    </motion.div>
                  </div>

                  {estimatorSelectedProduct && (
                    <div className="mt-4">
                      <EstimatorEngine selectedProduct={estimatorSelectedProduct} />
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
      </motion.div>

      <AnimatePresence>
        {isCartOpen && (
          <Cart
            isOpen={isCartOpen}
            items={cartItems}
            totalAmount={totalCartAmount}
            onClose={() => setIsCartOpen(false)}
            onDecrease={handleDecreaseCartItem}
            onIncrease={handleIncreaseCartItem}
            onRemove={handleRemoveCartItem}
            onClearCart={handleClearCart}
          />
        )}
      </AnimatePresence>
    </section>
  );
}