'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronLeft, Minus, Plus, X } from 'lucide-react';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';

import { firebaseAuth } from '@/lib/firebase-auth';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firestore-users';

const DUPLICATE_ORDER_WINDOW_MS = 20 * 1000;

export default function Cart({
  isOpen,
  items,
  totalAmount,
  onClose,
  onDecrease,
  onIncrease,
  onRemove,
  onClearCart,
}) {
  const { isAuthReady, user } = useAuth();
  const placeOrderLockRef = useRef(false);

  const [panelStep, setPanelStep] = useState('cart');
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isPincodeLoading, setIsPincodeLoading] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [addressSuccess, setAddressSuccess] = useState('');
  const [placeOrderError, setPlaceOrderError] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [placedOrderMeta, setPlacedOrderMeta] = useState(null);
  const [applyGst, setApplyGst] = useState(false);
  const [gstin, setGstin] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [addressForm, setAddressForm] = useState({
    addressLine1: '',
    addressLine2: '',
    pincode: '',
    city: '',
    state: '',
  });

  const selectedAddress = useMemo(() => {
    return savedAddresses.find((entry) => entry.id === selectedAddressId) ?? null;
  }, [savedAddresses, selectedAddressId]);

  const isUserLoggedIn = useMemo(() => {
    if (!isAuthReady) {
      return false;
    }

    return Boolean(firebaseAuth.currentUser?.uid || user);
  }, [isAuthReady, user]);

  const orderSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [items]);

  const orderGstAmount = useMemo(() => {
    if (!applyGst) {
      return 0;
    }

    return items.reduce((sum, item) => {
      const gstPercent = Number(item.gstPercentage ?? 0);
      if (!Number.isFinite(gstPercent) || gstPercent <= 0) {
        return sum;
      }

      const lineSubtotal = item.unitPrice * item.quantity;
      return sum + (lineSubtotal * gstPercent) / 100;
    }, 0);
  }, [applyGst, items]);

  const orderGrandTotal = useMemo(() => {
    return orderSubtotal + orderGstAmount;
  }, [orderSubtotal, orderGstAmount]);

  const deliveryLeadTimes = useMemo(() => {
    return items
      .map((item) => Number(item.lead_times_in_day ?? item.leadTimeDays ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0);
  }, [items]);

  const averageLeadTimeDays = useMemo(() => {
    if (deliveryLeadTimes.length === 0) return null;
    const sum = deliveryLeadTimes.reduce((acc, value) => acc + value, 0);
    return sum / deliveryLeadTimes.length;
  }, [deliveryLeadTimes]);

  const medianLeadTimeDays = useMemo(() => {
    if (deliveryLeadTimes.length === 0) return null;
    const sorted = [...deliveryLeadTimes].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }

    return sorted[middle];
  }, [deliveryLeadTimes]);

  const estimatedDeliveryDays = useMemo(() => {
    if (!averageLeadTimeDays) return null;
    return Math.max(1, Math.round(averageLeadTimeDays));
  }, [averageLeadTimeDays]);

  useEffect(() => {
    if (!isOpen) {
      setPanelStep('cart');
      setAddressError('');
      setAddressSuccess('');
      setPlaceOrderError('');
      setPlacedOrderMeta(null);
      placeOrderLockRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    const savedSelectedAddress = window.localStorage.getItem('selected-order-address-id');
    if (savedSelectedAddress) {
      setSelectedAddressId(savedSelectedAddress);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || panelStep !== 'address') {
      return;
    }

    const user = firebaseAuth.currentUser;
    if (!user) {
      setSavedAddresses([]);
      return;
    }

    void getDoc(doc(db, 'USERS', user.uid)).then((snapshot) => {
      if (!snapshot.exists()) {
        setSavedAddresses([]);
        return;
      }

      const data = snapshot.data();
      const addressMap =
        data && data.addresses && typeof data.addresses === 'object' && !Array.isArray(data.addresses)
          ? data.addresses
          : {};

      const normalized = Object.entries(addressMap)
        .map(([id, value]) => {
          const entry = value && typeof value === 'object' ? value : {};
          return {
            id,
            addressLine1: String(entry.addressLine1 ?? entry.line1 ?? ''),
            addressLine2: String(entry.addressLine2 ?? entry.landmark ?? ''),
            city: String(entry.city ?? ''),
            state: String(entry.state ?? ''),
            pincode: String(entry.pincode ?? ''),
            createdAtMs: Number(entry.createdAtMs ?? 0),
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);

      setSavedAddresses(normalized);

      if (selectedAddressId && !normalized.some((entry) => entry.id === selectedAddressId)) {
        setSelectedAddressId('');
        window.localStorage.removeItem('selected-order-address-id');
      }
    });
  }, [isOpen, panelStep, selectedAddressId]);

  useEffect(() => {
    const pincode = addressForm.pincode.trim();
    if (!/^\d{6}$/.test(pincode)) {
      return;
    }

    let ignore = false;
    setIsPincodeLoading(true);

    void fetch(`https://api.postalpincode.in/pincode/${pincode}`)
      .then((response) => response.json())
      .then((data) => {
        if (ignore) return;

        const firstResult = Array.isArray(data) ? data[0] : null;
        const postOffices = firstResult && Array.isArray(firstResult.PostOffice)
          ? firstResult.PostOffice
          : [];

        if (postOffices.length === 0) {
          setAddressError('Could not auto-detect city/state from this pincode.');
          return;
        }

        const primaryOffice = postOffices[0];
        const nextCity = String(primaryOffice?.District ?? '').trim();
        const nextState = String(primaryOffice?.State ?? '').trim();

        setAddressForm((prev) => ({
          ...prev,
          city: nextCity || prev.city,
          state: nextState || prev.state,
        }));
        setAddressError('');
      })
      .catch(() => {
        if (!ignore) {
          setAddressError('Could not auto-detect city/state from this pincode.');
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsPincodeLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [addressForm.pincode]);

  const handleSaveAddress = async () => {
    const user = firebaseAuth.currentUser;
    if (!user) {
      setAddressError('Please login to save addresses.');
      setAddressSuccess('');
      return;
    }

    const addressLine1 = addressForm.addressLine1.trim();
    const addressLine2 = addressForm.addressLine2.trim();
    const city = addressForm.city.trim();
    const state = addressForm.state.trim();
    const pincode = addressForm.pincode.trim();

    if (!addressLine1 || !addressLine2 || !city || !state || !/^\d{6}$/.test(pincode)) {
      setAddressError('Enter valid address lines and a 6 digit pincode.');
      setAddressSuccess('');
      return;
    }

    const addressId = `address_${Date.now()}`;
    const entry = {
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      createdAtMs: Date.now(),
    };

    setAddressError('');
    setAddressSuccess('');
    setIsSavingAddress(true);

    try {
      await setDoc(
        doc(db, 'USERS', user.uid),
        {
          addresses: {
            [addressId]: entry,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setSavedAddresses((prev) => [{ id: addressId, ...entry }, ...prev]);
      setAddressForm({
        addressLine1: '',
        addressLine2: '',
        pincode: '',
        city: '',
        state: '',
      });
      setAddressSuccess('Address saved successfully.');
    } catch {
      setAddressError('Could not save address. Please try again.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleUseSavedAddress = (entry) => {
    setSelectedAddressId(entry.id);
    window.localStorage.setItem('selected-order-address-id', entry.id);

    const payload = {
      addressId: entry.id,
      addressLine1: entry.addressLine1,
      addressLine2: entry.addressLine2,
      city: entry.city,
      state: entry.state,
      pincode: entry.pincode,
    };

    window.localStorage.setItem('selected-order-address', JSON.stringify(payload));
    window.dispatchEvent(
      new CustomEvent('order-address-selected', {
        detail: payload,
      }),
    );

    setAddressSuccess('Address selected for this order.');
    setAddressError('');
  };

  const handlePlaceOrder = async () => {
    if (placeOrderLockRef.current || isPlacingOrder) {
      setPlaceOrderError('Order is already being placed. Please wait.');
      return;
    }

    if (!isAuthReady) {
      setPlaceOrderError('Checking login status. Please wait and try again.');
      return;
    }

    const user = firebaseAuth.currentUser;
    if (!user) {
      setPlaceOrderError('Please login to place your order.');
      return;
    }

    if (!selectedAddress) {
      setPlaceOrderError('Please select an address for this order.');
      return;
    }

    if (items.length === 0) {
      setPlaceOrderError('Your cart is empty.');
      return;
    }

    const hasOutOfRangeQuantity = items.some((item) => {
      const minQty = Math.max(1, Number(item.min_deliverable_quantity ?? 1));
      const maxQty = Math.max(minQty, Number(item.max_deliverable_quantity ?? 999));
      return item.quantity < minQty || item.quantity > maxQty;
    });

    if (hasOutOfRangeQuantity) {
      setPlaceOrderError('One or more products have quantity outside vendor deliverable range.');
      return;
    }

    const sanitizedProducts = items
      .map((item) => ({
        productID: item.productID,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        min_deliverable_quantity: Number(item.min_deliverable_quantity ?? 1),
        max_deliverable_quantity: Number(item.max_deliverable_quantity ?? 999),
      }))
      .sort((a, b) => a.productID.localeCompare(b.productID));

    const orderSignature = JSON.stringify({
      userID: user.uid,
      addressID: selectedAddress.id,
      products: sanitizedProducts,
      applyGst,
      gstin: gstin.trim(),
      companyName: companyName.trim(),
      grandTotal: Number(orderGrandTotal.toFixed(2)),
    });

    const duplicateKey = `last-order-signature:${user.uid}`;
    const previousOrderRaw = window.localStorage.getItem(duplicateKey);
    if (previousOrderRaw) {
      try {
        const previousOrder = JSON.parse(previousOrderRaw);
        const sameSignature = previousOrder?.signature === orderSignature;
        const placedAtMs = Number(previousOrder?.placedAtMs ?? 0);
        const isWithinWindow = Date.now() - placedAtMs < DUPLICATE_ORDER_WINDOW_MS;

        if (sameSignature && isWithinWindow) {
          setPlaceOrderError('This order was just placed. Please wait before retrying.');
          return;
        }
      } catch {
        // Ignore invalid local storage data.
      }
    }

    placeOrderLockRef.current = true;
    setIsPlacingOrder(true);
    setPlaceOrderError('');

    try {
      const userSnapshot = await getDoc(doc(db, 'USERS', user.uid));
      if (!userSnapshot.exists()) {
        setPlaceOrderError('Your account profile is not ready. Please sign in again and complete registration.');
        return;
      }

      const userData = userSnapshot.exists() ? userSnapshot.data() : null;
      const hasAcceptedCustomerAgreement = Boolean(
        userData?.documents?.customerPlatformAgreement?.isCompleted,
      );

      if (!hasAcceptedCustomerAgreement) {
        setPlaceOrderError('Please complete Rules & Agreement from your profile before placing an order.');
        return;
      }

      const firstName = String(userData?.firstName ?? '').trim();
      const lastName = String(userData?.lastName ?? '').trim();
      const customerName = [firstName, lastName].filter(Boolean).join(' ') || user.phoneNumber || 'Customer';

      await addDoc(collection(db, 'ORDERS'), {
        userID: user.uid,
        customerID: user.uid,
        customerName,
        customerPhone: user.phoneNumber ?? '',
        orderSignature,
        status: 'Placed',
        products: items.map((item) => ({
          productID: item.productID,
          name: item.name,
          vendorID: item.vendorID,
          vendorName: item.vendorName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          commissionPercentage: Number(item.commission ?? 0),
          gstPercentage: Number(item.gstPercentage ?? 0),
          lead_times_in_day: Number(item.lead_times_in_day ?? item.leadTimeDays ?? 0),
          per_km_delivery_price: Number(item.per_km_delivery_price ?? 0),
          min_deliverable_quantity: Number(item.min_deliverable_quantity ?? 1),
          max_deliverable_quantity: Number(item.max_deliverable_quantity ?? 999),
          lineSubtotal: item.unitPrice * item.quantity,
        })),
        address: selectedAddress,
        billing: {
          applyGst,
          gstin: gstin.trim(),
          companyName: companyName.trim(),
          gstAmount: orderGstAmount,
          subtotal: orderSubtotal,
          grandTotal: orderGrandTotal,
        },
        delivery: {
          note: 'Delivery Charges will apply which will be conveyed by the vendor upon placing the order',
          estimatedDeliveryDays,
          estimationMethod: 'average',
          averageLeadTimeDays,
          medianLeadTimeDays,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      window.localStorage.setItem(
        duplicateKey,
        JSON.stringify({
          signature: orderSignature,
          placedAtMs: Date.now(),
        }),
      );

      setPlacedOrderMeta({
        totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
        grandTotal: Number(orderGrandTotal.toFixed(2)),
        estimatedDeliveryDays,
      });
      setPanelStep('success');

      if (typeof onClearCart === 'function') {
        onClearCart();
      }
    } catch {
      setPlaceOrderError('Could not place order. Please try again.');
    } finally {
      placeOrderLockRef.current = false;
      setIsPlacingOrder(false);
    }
  };

  return (
    <>
      <motion.button
        type="button"
        aria-label="Close cart"
        className="fixed inset-0 z-80 bg-black/30 backdrop-blur-[1px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={onClose}
      />

      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="fixed right-0 top-0 z-90 h-screen w-full max-w-md border-l border-(--border) bg-(--surface) p-4 sm:p-5"
      >
        <div className="flex h-full flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(panelStep === 'address' || panelStep === 'checkout') && (
                <button
                  type="button"
                  onClick={() => setPanelStep(panelStep === 'checkout' ? 'address' : 'cart')}
                  className="rounded-full border border-(--border) p-1.5 text-(--soft-text) transition hover:border-(--accent) hover:text-foreground"
                  aria-label={panelStep === 'checkout' ? 'Back to address step' : 'Back to cart'}
                >
                  <ChevronLeft size={16} />
                </button>
              )}

              <h2 className="text-base font-semibold text-(--foreground-strong)">
                {panelStep === 'checkout'
                  ? 'Checkout'
                  : panelStep === 'address'
                    ? 'Add Address'
                    : panelStep === 'success'
                      ? 'Order Confirmed'
                      : 'Cart'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-(--border) p-1.5 text-(--soft-text) transition hover:border-(--accent) hover:text-foreground"
              aria-label="Close cart panel"
            >
              <X size={16} />
            </button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {panelStep === 'cart' ? (
              <motion.div
                key="cart-step"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex h-full flex-col"
              >
                {items.length === 0 ? (
                  <p className="text-sm text-(--muted)">Your cart is empty.</p>
                ) : (
                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    {items.map((item) => (
                      <article key={item.productID} className="rounded-2xl border border-(--border) bg-white/60 p-3">
                        <p className="text-sm font-semibold text-(--foreground-strong)">{item.name}</p>
                        <p className="mt-1 text-xs text-(--muted)">Vendor: {item.vendorName}</p>
                        <p className="mt-1 text-xs text-(--muted)">Rs {item.unitPrice.toFixed(2)} / {item.baseUnit}</p>
                        <p className="mt-1 text-xs text-(--muted)">Per KM Delivery: Rs {Number(item.per_km_delivery_price ?? 0).toFixed(2)}</p>
                        <p className="mt-1 text-xs text-(--muted)">
                          Deliverable Qty: {Math.max(1, Number(item.min_deliverable_quantity ?? 1))} - {Math.max(Math.max(1, Number(item.min_deliverable_quantity ?? 1)), Number(item.max_deliverable_quantity ?? 999))}
                        </p>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="inline-flex items-center rounded-xl border border-(--border) bg-white/80">
                            <button
                              type="button"
                              onClick={() => onDecrease(item.productID)}
                              className="px-2 py-2 text-(--soft-text) transition hover:text-foreground"
                              aria-label={`Decrease ${item.name} quantity`}
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-8 border-x border-(--border) text-center text-xs font-semibold text-foreground">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => onIncrease(item.productID)}
                              className="px-2 py-2 text-(--soft-text) transition hover:text-foreground"
                              aria-label={`Increase ${item.name} quantity`}
                            >
                              <Plus size={14} />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => onRemove(item.productID)}
                            className="text-xs font-semibold text-rose-700 transition hover:text-rose-900"
                          >
                            Remove
                          </button>
                        </div>

                        <p className="mt-2 text-right text-xs font-semibold text-(--foreground-strong)">
                          Subtotal: Rs {(item.unitPrice * item.quantity).toFixed(2)}
                        </p>
                      </article>
                    ))}
                  </div>
                )}

                <div className="mt-4 border-t border-(--border) pt-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-(--foreground-strong)">
                    <span>Total</span>
                    <span>Rs {totalAmount.toFixed(2)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPanelStep('address')}
                    className="mt-3 w-full rounded-xl bg-(--accent) px-4 py-2.5 text-sm font-semibold text-(--accent-contrast) transition hover:brightness-95"
                  >
                    Continue to add address
                  </button>
                </div>
              </motion.div>
            ) : panelStep === 'address' ? (
              <motion.div
                key="address-step"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex h-full flex-col"
              >
                {!selectedAddressId ? (
                  <>
                    <div className="space-y-2">
                      <input
                        value={addressForm.addressLine1}
                        onChange={(event) => setAddressForm((prev) => ({ ...prev, addressLine1: event.target.value }))}
                        placeholder="Address line 1"
                        className="w-full rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-sm text-foreground outline-none"
                      />
                      <input
                        value={addressForm.addressLine2}
                        onChange={(event) => setAddressForm((prev) => ({ ...prev, addressLine2: event.target.value }))}
                        placeholder="Address line 2"
                        className="w-full rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-sm text-foreground outline-none"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={addressForm.city}
                          onChange={(event) => setAddressForm((prev) => ({ ...prev, city: event.target.value }))}
                          placeholder="City"
                          className="w-full rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-sm text-foreground outline-none"
                        />
                        <input
                          value={addressForm.state}
                          onChange={(event) => setAddressForm((prev) => ({ ...prev, state: event.target.value }))}
                          placeholder="State"
                          className="w-full rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-sm text-foreground outline-none"
                        />
                      </div>

                      <input
                        value={addressForm.pincode}
                        onChange={(event) => {
                          const next = event.target.value.replace(/\D/g, '').slice(0, 6);
                          setAddressForm((prev) => ({ ...prev, pincode: next }));
                        }}
                        inputMode="numeric"
                        placeholder="Pincode"
                        className="w-full rounded-xl border border-(--border) bg-white/70 px-3 py-2 text-sm text-foreground outline-none"
                      />

                      {isPincodeLoading && (
                        <p className="text-xs text-(--muted)">Auto-filling city and state...</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveAddress}
                      disabled={isSavingAddress}
                      className="mt-3 w-full rounded-xl bg-(--accent) px-4 py-2.5 text-sm font-semibold text-(--accent-contrast) transition hover:brightness-95 disabled:opacity-60"
                    >
                      {isSavingAddress ? 'Saving...' : 'Save Address'}
                    </button>
                  </>
                ) : (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Address selected for this order.
                    <button
                      type="button"
                      onClick={() => setSelectedAddressId('')}
                      className="ml-2 font-semibold underline underline-offset-2"
                    >
                      Change
                    </button>
                  </div>
                )}

                {addressError && <p className="mt-2 text-xs text-rose-600">{addressError}</p>}
                {addressSuccess && <p className="mt-2 text-xs text-emerald-600">{addressSuccess}</p>}

                <div className="mt-4 flex-1 border-t border-(--border) pt-3">
                  <p className="mb-2 text-sm font-semibold text-(--foreground-strong)">Saved Addresses</p>
                  {savedAddresses.length === 0 ? (
                    <p className="text-xs text-(--muted)">No saved addresses yet.</p>
                  ) : (
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {savedAddresses.map((entry) => {
                        const isSelected = selectedAddressId === entry.id;

                        return (
                        <article
                          key={entry.id}
                          className={`rounded-xl border p-2.5 transition-colors ${
                            isSelected
                              ? 'border-emerald-400 bg-emerald-50'
                              : 'border-(--border) bg-white/60'
                          }`}
                        >
                          <p className="text-xs font-semibold text-(--foreground-strong)">Saved Address</p>
                          <p className="mt-1 text-xs text-(--muted)">
                            {entry.addressLine1}
                          </p>
                          <p className="text-xs text-(--muted)">{entry.addressLine2}</p>
                          <p className="text-xs text-(--muted)">{entry.city}, {entry.state} - {entry.pincode}</p>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            {!isSelected ? (
                              <button
                                type="button"
                                onClick={() => handleUseSavedAddress(entry)}
                                className="rounded-lg border border-(--border) bg-white/80 px-2.5 py-1 text-xs font-semibold text-foreground transition hover:border-(--accent)"
                              >
                                Use for this order
                              </button>
                            ) : (
                              <span />
                            )}

                            {isSelected && (
                              <span className="text-[11px] font-semibold text-emerald-700">
                                Selected
                              </span>
                            )}
                          </div>
                        </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-(--border) pt-3">
                  <button
                    type="button"
                    disabled={!selectedAddress}
                    onClick={() => setPanelStep('checkout')}
                    className="w-full rounded-xl bg-(--accent) px-4 py-2.5 text-sm font-semibold text-(--accent-contrast) transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Continue to checkout
                  </button>
                </div>
              </motion.div>
            ) : panelStep === 'checkout' ? (
              <motion.div
                key="checkout-step"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="flex h-full flex-col"
              >
                <div className="flex-1 overflow-y-auto pr-1">
                  <p className="text-sm font-semibold text-(--foreground-strong)">Order Summary</p>
                  <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-(--border) bg-white/60">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-(--border) text-(--muted)">
                        <th className="px-2 py-2 font-semibold">Product</th>
                        <th className="px-2 py-2 font-semibold">Qty</th>
                        <th className="px-2 py-2 font-semibold">Price</th>
                        <th className="px-2 py-2 font-semibold">GST %</th>
                        <th className="px-2 py-2 font-semibold">GST Amt</th>
                        <th className="px-2 py-2 font-semibold">Per KM</th>
                        <th className="px-2 py-2 font-semibold">Allowed Qty</th>
                        <th className="px-2 py-2 font-semibold">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const lineSubtotal = item.unitPrice * item.quantity;
                        const gstPercent = Number(item.gstPercentage ?? 0);
                        const normalizedLineGstPercent = Number.isFinite(gstPercent) && gstPercent > 0 ? gstPercent : 0;
                        const lineGst = applyGst ? (lineSubtotal * normalizedLineGstPercent) / 100 : 0;
                        const lineTotal = lineSubtotal + lineGst;

                        return (
                          <tr key={item.productID} className="border-b border-(--border) last:border-b-0">
                            <td className="px-2 py-2 text-(--foreground-strong)">{item.name}</td>
                            <td className="px-2 py-2 text-(--foreground-strong)">{item.quantity}</td>
                            <td className="px-2 py-2 text-(--foreground-strong)">Rs {item.unitPrice.toFixed(2)}</td>
                            <td className="px-2 py-2 text-(--foreground-strong)">{normalizedLineGstPercent.toFixed(2)}</td>
                            <td className="px-2 py-2 text-(--foreground-strong)">Rs {lineGst.toFixed(2)}</td>
                            <td className="px-2 py-2 text-(--foreground-strong)">Rs {Number(item.per_km_delivery_price ?? 0).toFixed(2)}</td>
                            <td className="px-2 py-2 text-(--foreground-strong)">{Math.max(1, Number(item.min_deliverable_quantity ?? 1))} - {Math.max(Math.max(1, Number(item.min_deliverable_quantity ?? 1)), Number(item.max_deliverable_quantity ?? 999))}</td>
                            <td className="px-2 py-2 font-semibold text-(--foreground-strong)">Rs {lineTotal.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>

                  <div className="mt-4 rounded-xl border border-(--border) bg-white/60 p-3">
                    <label className="flex items-center gap-2 text-xs font-semibold text-(--foreground-strong)">
                      <input
                        type="checkbox"
                        checked={applyGst}
                        onChange={(event) => setApplyGst(event.target.checked)}
                      />
                      Add GST details (optional)
                    </label>

                    {applyGst && (
                      <div className="mt-3 space-y-2">
                        <input
                          value={companyName}
                          onChange={(event) => setCompanyName(event.target.value)}
                          placeholder="Company Name"
                          className="w-full rounded-lg border border-(--border) bg-white px-3 py-2 text-xs text-foreground outline-none"
                        />
                        <input
                          value={gstin}
                          onChange={(event) => setGstin(event.target.value.toUpperCase())}
                          placeholder="GSTIN"
                          className="w-full rounded-lg border border-(--border) bg-white px-3 py-2 text-xs text-foreground outline-none"
                        />
                        <p className="text-[11px] text-(--muted)">
                          GST percentage is taken from each product record.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-(--border) bg-white/60 p-3 text-xs">
                    <div className="flex items-center justify-between text-(--muted)">
                      <span>Subtotal</span>
                      <span>Rs {orderSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-(--muted)">
                      <span>GST (from product records)</span>
                      <span>Rs {orderGstAmount.toFixed(2)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-(--border) pt-2 text-sm font-semibold text-(--foreground-strong)">
                      <span>Grand Total</span>
                      <span>Rs {orderGrandTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {selectedAddress ? (
                    <div className="mt-4 rounded-xl border border-(--border) bg-white/60 p-3">
                      <p className="text-xs font-semibold text-(--foreground-strong)">Deliver to</p>
                      <p className="mt-1 text-xs text-(--muted)">{selectedAddress.addressLine1}</p>
                      <p className="text-xs text-(--muted)">{selectedAddress.addressLine2}</p>
                      <p className="text-xs text-(--muted)">
                        {selectedAddress.city}, {selectedAddress.state} - {selectedAddress.pincode}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-rose-600">No address selected for this order.</p>
                  )}
                </div>

                <div className="mt-4 border-t border-(--border) pt-3">
                  <p className="mb-2 text-[11px] text-(--muted)">
                    Delivery Charges will apply which will be conveyed by the vendor upon placing the order
                  </p>

                  {estimatedDeliveryDays ? (
                    <p className="mb-2 text-[11px] text-(--muted)">
                      Estimated delivery: around {estimatedDeliveryDays} day{estimatedDeliveryDays === 1 ? '' : 's'}
                    </p>
                  ) : null}

                  {placeOrderError && <p className="mb-2 text-xs text-rose-600">{placeOrderError}</p>}

                  {!isAuthReady && (
                    <p className="mb-2 text-xs text-(--muted)">Checking login status...</p>
                  )}

                  {isAuthReady && !isUserLoggedIn && (
                    <p className="mb-2 text-xs text-rose-600">Please login before placing the order.</p>
                  )}

                  <button
                    type="button"
                    disabled={!selectedAddress || isPlacingOrder || !isAuthReady || !isUserLoggedIn}
                    onClick={handlePlaceOrder}
                    className="w-full rounded-xl bg-(--accent) px-4 py-2.5 text-sm font-semibold text-(--accent-contrast) transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPlacingOrder ? 'Placing order...' : 'Place order'}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="success-step"
                initial={{ opacity: 0, x: 18, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex h-full flex-col"
              >
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-center">
                  <motion.div
                    initial={{ scale: 0.88, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 20 }}
                    className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300 bg-white text-emerald-700"
                  >
                    <CheckCircle2 size={24} />
                  </motion.div>

                  <p className="text-sm font-semibold text-emerald-800">Order placed successfully</p>
                  <p className="mt-1 text-xs text-emerald-700/90">
                    Your vendor will confirm delivery charges and dispatch details shortly.
                  </p>

                  <div className="mt-4 w-full rounded-xl border border-emerald-200 bg-white/80 p-3 text-left text-xs text-emerald-900">
                    <p>
                      Items: <span className="font-semibold">{placedOrderMeta?.totalItems ?? 0}</span>
                    </p>
                    <p className="mt-1">
                      Paid: <span className="font-semibold">Rs {(placedOrderMeta?.grandTotal ?? 0).toFixed(2)}</span>
                    </p>
                    {placedOrderMeta?.estimatedDeliveryDays ? (
                      <p className="mt-1">
                        Estimated delivery: around {placedOrderMeta.estimatedDeliveryDays} day{placedOrderMeta.estimatedDeliveryDays === 1 ? '' : 's'}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 border-t border-(--border) pt-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-xl bg-(--accent) px-4 py-2.5 text-sm font-semibold text-(--accent-contrast) transition hover:brightness-95"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>
    </>
  );
}
