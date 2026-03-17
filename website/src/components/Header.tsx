'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ConfirmationResult } from 'firebase/auth';
import { ChevronLeft, FileText, Home, LogOut, MapPin, Navigation, Package, ShoppingCart, User, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  firebaseAuth,
  getFirebaseAuthErrorMessage,
  firebaseSignOut,
  requestPhoneOtp,
  verifyPhoneOtp,
  canUserLogin,
} from '@/lib/firebase-auth';
import { useAuth } from '@/lib/auth-context';
import {
  getCustomerPlatformAgreement,
  saveCustomerPlatformAgreement,
  type CustomerPlatformAgreement,
} from '@/lib/firestore-users';
import {
  saveVendorMarketplaceAgreement,
  type VendorMarketplaceAgreement,
} from '@/lib/firestore-vendors';

const OrdersSection = dynamic(() => import('@/components/OrdersSection'));
const SignUpForm = dynamic(() => import('./SignUpForm'));

const COUNTRY_CODES = [
  { dialCode: '+91', minLength: 10, maxLength: 10, example: '9876543210' },
  { dialCode: '+1', minLength: 10, maxLength: 10, example: '2025550143' },
  { dialCode: '+44', minLength: 10, maxLength: 10, example: '7400123456' },
  { dialCode: '+971', minLength: 9, maxLength: 9, example: '501234567' },
  { dialCode: '+65', minLength: 8, maxLength: 8, example: '81234567' },
  { dialCode: '+61', minLength: 9, maxLength: 9, example: '412345678' },
] as const;

function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-60 bg-[rgb(34,19,16,0.24)] backdrop-blur-sm"
      onClick={onClose}
    />
  );
}

function ModalPanel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="glass-card-strong fixed left-1/2 top-24 z-70 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-[1.75rem] p-6 text-foreground shadow-[0_28px_80px_rgba(68,39,34,0.28)]"
    >
      {children}
    </motion.div>
  );
}

function LocationModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (loc: string) => void;
}) {
  const [pincode, setPincode] = useState('');
  const [error, setError] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [success, setSuccess] = useState('');

  const save = (value: string) => {
    onSave(value);
    setSuccess(value);
    setTimeout(onClose, 700);
  };

  const handleApply = () => {
    if (!/^\d{5,6}$/.test(pincode)) {
      setError('Enter a valid 5 or 6-digit pincode.');
      return;
    }
    save(pincode);
  };

  const handleDetect = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setDetecting(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const label = `${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`;
        setDetecting(false);
        save(label);
      },
      () => {
        setError('Location access denied. Enter your pincode manually.');
        setDetecting(false);
      },
    );
  };

  return (
    <>
      <Backdrop onClose={onClose} />
      <ModalPanel>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-(--foreground-strong)">Delivery location</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-(--soft-text) transition hover:text-(--foreground-strong)"
          >
            <X size={15} />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-(--muted)">
          Enter your pincode to see delivery estimates and available services.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={pincode}
            onChange={(e) => {
              setPincode(e.target.value.replace(/\D/g, ''));
              setError('');
            }}
            placeholder="Enter pincode"
            className="flex-1 rounded-xl border border-(--border) bg-(--surface-soft) px-3 py-2.5 text-sm text-foreground placeholder:text-(--soft-text) outline-none transition focus:border-(--accent)"
          />
          <button
            onClick={handleApply}
            className="rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95"
          >
            Apply
          </button>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        {success && <p className="mt-2 text-xs text-emerald-600">Saved: {success}</p>}

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-(--border)" />
          <span className="text-[11px] text-(--soft-text)">or</span>
          <div className="h-px flex-1 bg-(--border)" />
        </div>

        <button
          onClick={handleDetect}
          disabled={detecting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-(--border) bg-(--surface-soft) py-2.5 text-sm text-foreground transition hover:border-(--accent) hover:bg-(--surface) disabled:opacity-50"
        >
          <Navigation size={13} className={detecting ? 'animate-pulse' : ''} />
          {detecting ? 'Detecting...' : 'Use current location'}
        </button>
      </ModalPanel>
    </>
  );
}

function AccountModal({
  user,
  onSignUpCompleted,
  onSignOut,
  onClose,
}: {
  user: string | null;
  onSignUpCompleted: () => void;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}) {
  const [countryCode, setCountryCode] = useState<(typeof COUNTRY_CODES)[number]['dialCode']>('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [showSignUp, setShowSignUp] = useState(false);
  const [isSignUpFormComplete, setIsSignUpFormComplete] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState(1);
  const hasRequestedOtp = confirmationResult !== null;
  const selectedCountry = COUNTRY_CODES.find((country) => country.dialCode === countryCode) ?? COUNTRY_CODES[0];
  const shouldShowSignUp = showSignUp;
  const isPublicSignUpFlow = shouldShowSignUp;
  const shouldPreventSignUpClose = shouldShowSignUp && !isSignUpFormComplete;

  const handleAttemptClose = () => {
    if (shouldPreventSignUpClose) {
      return;
    }
    onClose();
  };

  const handleSendOtp = async () => {
    const phoneDigits = phoneNumber.replace(/\D/g, '');

    if (
      phoneDigits.length < selectedCountry.minLength ||
      phoneDigits.length > selectedCountry.maxLength
    ) {
      setError(
        `Enter a valid ${selectedCountry.minLength === selectedCountry.maxLength ? selectedCountry.minLength : `${selectedCountry.minLength}-${selectedCountry.maxLength}`} digit phone number.`,
      );
      return;
    }

    setIsLoading(true);
    setError('');
    setStatus('Sending OTP...');

    try {
      const e164PhoneNumber = `${selectedCountry.dialCode}${phoneDigits}`;
      const result = await requestPhoneOtp(e164PhoneNumber, 'phone-auth-recaptcha');
      setConfirmationResult(result);
      setStatus('OTP sent. Enter the 6-digit code.');
    } catch (err) {
      setError(getFirebaseAuthErrorMessage(err));
      setStatus('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmationResult) {
      setError('Request OTP first.');
      return;
    }
    if (!/^\d{6}$/.test(otpCode)) {
      setError('Enter a valid 6-digit OTP.');
      return;
    }
    setIsLoading(true);
    setError('');
    setStatus('Verifying OTP...');
    try {
      await verifyPhoneOtp(confirmationResult, otpCode);
      // Check if user exists in USERS collection
      const user = firebaseAuth.currentUser;
      if (user) {
        const allowed = await canUserLogin(user.uid, user.phoneNumber);
        if (!allowed) {
          await firebaseSignOut();
          setShowSignUp(false);
          setConfirmationResult(null);
          setOtpCode('');
          setStatus('Sign Up Before Login');
          return;
        }
      }
      setShowSignUp(false);
      setStatus('Signed in successfully.');
      setTimeout(onClose, 350);
    } catch {
      setError('Invalid OTP. Please try again.');
      setStatus('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Backdrop onClose={handleAttemptClose} />
      <ModalPanel>
        <div className="mb-4 grid grid-cols-[auto_1fr_auto] items-center">
          {isPublicSignUpFlow ? (
            <button
              type="button"
              onClick={() => {
                if (shouldPreventSignUpClose) {
                  return;
                }
                setTransitionDirection(-1);
                setShowSignUp(false);
                setIsSignUpFormComplete(false);
                setStatus('');
                setError('');
              }}
              aria-label="Back to login"
              className="justify-self-start rounded-full p-1 text-(--soft-text) transition hover:text-(--foreground-strong)"
            >
              <ChevronLeft size={16} />
            </button>
          ) : (
            <span />
          )}

          <h2 className="text-center text-sm font-semibold tracking-tight text-(--foreground-strong)">
            {isPublicSignUpFlow ? 'Sign up' : user ? `Hi, ${user}` : 'Login'}
          </h2>

          <button
            onClick={handleAttemptClose}
            aria-label="Close"
            className="justify-self-end rounded-full p-1 text-(--soft-text) transition hover:text-(--foreground-strong)"
          >
            <X size={15} />
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false} custom={transitionDirection}>
          {shouldShowSignUp ? (
            <motion.div
              key="signup"
              custom={transitionDirection}
              variants={{
                enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 28 : -28 }),
                center: { opacity: 1, x: 0 },
                exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -28 : 28 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="space-y-3"
            >
              <SignUpForm
                onSuccess={() => {
                  setIsSignUpFormComplete(false);
                  setShowSignUp(false);
                  onSignUpCompleted();
                  setStatus('Sign up complete. You can now use your account.');
                  setTimeout(onClose, 700);
                }}
                onAlreadyRegistered={() => {
                  setTransitionDirection(-1);
                  setIsSignUpFormComplete(false);
                  setShowSignUp(false);
                  setError('');
                  setStatus('Already a user. Please login.');
                }}
                onCompletionChange={setIsSignUpFormComplete}
              />
            </motion.div>
          ) : user ? (
            <motion.div
              key="signed-in"
              custom={transitionDirection}
              variants={{
                enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 28 : -28 }),
                center: { opacity: 1, x: 0 },
                exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -28 : 28 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="space-y-4"
            >
              <p className="text-sm text-(--muted)">
                Signed in as <span className="text-(--foreground-strong)">{user}</span>
              </p>
              <button
                onClick={async () => {
                  await onSignOut();
                  onClose();
                }}
                className="w-full rounded-xl border border-(--border) py-2.5 text-sm text-(--muted) transition hover:border-(--accent) hover:text-(--foreground-strong)"
              >
                Sign out
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="login"
              custom={transitionDirection}
              variants={{
                enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 28 : -28 }),
                center: { opacity: 1, x: 0 },
                exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -28 : 28 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="space-y-3"
            >
            <div className="flex items-center gap-2">
              <div className="relative shrink-0" style={{ minWidth: 0, width: 'auto', display: 'inline-block' }}>
                <select
                  value={countryCode}
                  disabled={hasRequestedOtp}
                  onChange={(e) => {
                    setCountryCode(e.target.value as (typeof COUNTRY_CODES)[number]['dialCode']);
                    setPhoneNumber('');
                    setError('');
                  }}
                  className="appearance-none rounded-xl border border-(--border) bg-(--surface-soft) px-2.5 py-2.5 text-sm font-semibold text-foreground outline-none transition focus:border-(--accent) disabled:opacity-70"
                  style={{ WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', width: 'auto', minWidth: '2.5rem' }}
                >
                  {COUNTRY_CODES.map((country) => (
                    <option key={country.dialCode} value={country.dialCode}>
                      {country.dialCode}
                    </option>
                  ))}
                </select>
                {/* Hide dropdown arrow visually */}
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-(--soft-text)" aria-hidden="true"></span>
              </div>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={selectedCountry.maxLength}
                value={phoneNumber}
                disabled={hasRequestedOtp}
                onChange={(e) => {
                  setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, selectedCountry.maxLength));
                  setError('');
                }}
                placeholder={selectedCountry.example}
                className="min-w-0 flex-1 rounded-xl border border-(--border) bg-(--surface-soft) px-3 py-2.5 text-sm text-foreground placeholder:text-(--soft-text) outline-none transition focus:border-(--accent) disabled:opacity-70"
              />
            </div>
            {hasRequestedOtp && (
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value.replace(/\D/g, ''));
                  setError('');
                }}
                placeholder="Enter OTP"
                className="w-full rounded-xl border border-(--border) bg-(--surface-soft) px-3 py-2.5 text-sm text-foreground placeholder:text-(--soft-text) outline-none transition focus:border-(--accent)"
              />
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
            {status && <p className="text-xs text-emerald-600">{status}</p>}
            <button
              onClick={hasRequestedOtp ? handleVerifyOtp : handleSendOtp}
              disabled={isLoading}
              className="w-full rounded-xl bg-(--accent) py-2.5 text-sm font-semibold text-(--accent-contrast) transition hover:brightness-95 disabled:opacity-60"
            >
              {hasRequestedOtp ? 'Verify OTP' : 'Login'}
            </button>
            {!hasRequestedOtp && (
              <p className="text-center text-xs text-(--muted)">
                New here?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setTransitionDirection(1);
                    setIsSignUpFormComplete(false);
                    setShowSignUp(true);
                    setStatus('');
                    setError('');
                  }}
                  className="text-(--foreground-strong) underline underline-offset-2 hover:text-(--accent)"
                >
                  Sign up
                </button>
              </p>
            )}
            <div id="phone-auth-recaptcha" />
            <p className="text-center text-xs text-(--muted)">Use your mobile number to sign in securely.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </ModalPanel>
    </>
  );
}

function CustomerOrdersModal({
  onClose,
  customerID,
  customerPhone,
  customerName,
}: {
  onClose: () => void;
  customerID: string | null;
  customerPhone: string | null;
  customerName: string | null;
}) {
  return (
    <>
      <Backdrop onClose={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="glass-card-strong fixed left-1/2 top-24 z-70 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-3xl p-4 sm:p-5 text-foreground shadow-[0_28px_80px_rgba(68,39,34,0.28)]"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-(--foreground-strong)">My Orders</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-(--soft-text) transition hover:text-(--foreground-strong)"
          >
            <X size={15} />
          </button>
        </div>

        {customerPhone ? (
          <OrdersSection
            title="Customer Orders"
            viewer="customer"
            customerID={customerID}
            customerPhone={customerPhone}
            customerName={customerName}
            canEditStatus={false}
            showMonthFilter={false}
            compact
            emptyMessage="No orders found for your account yet."
          />
        ) : (
          <p className="text-sm text-(--muted)">Please sign in with a phone number to view your orders.</p>
        )}
      </motion.div>
    </>
  );
}

function CustomerPlatformAgreementModal({
  onClose,
  userID,
  initialAgreement,
  initialView = 'agreement',
  onSaved,
}: {
  onClose: () => void;
  userID: string;
  initialAgreement?: CustomerPlatformAgreement | null;
  initialView?: 'rules' | 'agreement';
  onSaved: (agreement: CustomerPlatformAgreement) => void;
}) {
  const [activeView, setActiveView] = useState<'rules' | 'agreement'>(initialView);
  const [form, setForm] = useState(() => ({
    panNumber: initialAgreement?.panNumber ?? '',
    gstNumber: initialAgreement?.gstNumber ?? '',
    projectDetails: initialAgreement?.projectDetails ?? '',
    jurisdiction: initialAgreement?.jurisdiction ?? '',
    confirmations: {
      customerVerification: initialAgreement?.confirmations.customerVerification ?? false,
      platformRole: initialAgreement?.confirmations.platformRole ?? false,
      ordersAndPayments: initialAgreement?.confirmations.ordersAndPayments ?? false,
      inspectionAndComplaints: initialAgreement?.confirmations.inspectionAndComplaints ?? false,
      limitationOfLiability: initialAgreement?.confirmations.limitationOfLiability ?? false,
      governingLaw: initialAgreement?.confirmations.governingLaw ?? false,
      finalConsent: initialAgreement?.confirmations.finalConsent ?? false,
    },
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const updateConfirmation = (key: keyof typeof form.confirmations, value: boolean) => {
    setForm((prev) => ({
      ...prev,
      confirmations: {
        ...prev.confirmations,
        [key]: value,
      },
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const requiredValues = [form.panNumber, form.projectDetails, form.jurisdiction];

    if (requiredValues.some((value) => !String(value).trim())) {
      setError('Please complete PAN, project details, and jurisdiction.');
      return;
    }

    if (Object.values(form.confirmations).some((value) => !value)) {
      setError('Please accept all checklist confirmations before saving.');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await saveCustomerPlatformAgreement(userID, {
        panNumber: form.panNumber.trim().toUpperCase(),
        gstNumber: form.gstNumber.trim().toUpperCase(),
        projectDetails: form.projectDetails.trim(),
        jurisdiction: form.jurisdiction.trim(),
        confirmations: form.confirmations,
      });

      onSaved({
        isCompleted: true,
        panNumber: form.panNumber.trim().toUpperCase(),
        gstNumber: form.gstNumber.trim().toUpperCase(),
        projectDetails: form.projectDetails.trim(),
        jurisdiction: form.jurisdiction.trim(),
        confirmations: form.confirmations,
        acceptedAt: null,
        updatedAt: null,
      });
      onClose();
    } catch {
      setError('Could not save agreement right now. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <>
      <Backdrop onClose={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="glass-card-strong fixed left-1/2 top-10 z-70 w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 rounded-3xl p-4 text-foreground shadow-[0_28px_80px_rgba(68,39,34,0.28)] sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-(--foreground-strong)">
            Customer (Buyer) Verification & Platform Usage Agreement
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-(--soft-text) transition hover:text-(--foreground-strong)"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mb-3 inline-flex rounded-xl border border-(--border) bg-(--surface) p-1">
          <button
            type="button"
            onClick={() => setActiveView('rules')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeView === 'rules'
                ? 'bg-(--accent) text-(--accent-contrast)'
                : 'text-(--muted) hover:text-(--foreground-strong)'
            }`}
          >
            Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveView('agreement')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeView === 'agreement'
                ? 'bg-(--accent) text-(--accent-contrast)'
                : 'text-(--muted) hover:text-(--foreground-strong)'
            }`}
          >
            Agreement Form
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[78vh] space-y-4 overflow-y-auto pr-1">
          <section className="space-y-2 rounded-2xl border border-(--border) bg-(--surface) p-3 text-xs leading-relaxed text-(--muted)">
            <p className="font-semibold text-(--foreground-strong)">
              CUSTOMER (BUYER) VERIFICATION & PLATFORM USAGE AGREEMENT
            </p>
            <p>
              This Agreement governs the access and use of the Platform by customers for procurement of construction
              materials.
            </p>
            <p>
              <span className="font-semibold text-(--foreground-strong)">1. CUSTOMER VERIFICATION</span>
            </p>
            <p>
              Customers shall provide accurate KYC documents including PAN, GST (if applicable), and project details.
            </p>
            <p>
              <span className="font-semibold text-(--foreground-strong)">2. PLATFORM ROLE</span>
            </p>
            <p>
              The Platform acts solely as a marketplace facilitator and does not manufacture or alter materials
              supplied.
            </p>
            <p>
              <span className="font-semibold text-(--foreground-strong)">3. ORDERS & PAYMENTS</span>
            </p>
            <p>
              Orders once confirmed are binding. Payments shall be made through Platform-approved payment methods.
            </p>
            <p>
              <span className="font-semibold text-(--foreground-strong)">4. INSPECTION & COMPLAINTS</span>
            </p>
            <p>
              Customers must inspect materials at delivery and raise complaints within 72 hours.
            </p>
            <p>
              <span className="font-semibold text-(--foreground-strong)">5. LIMITATION OF LIABILITY</span>
            </p>
            <p>
              The Platform shall not be liable for misuse, improper storage, or design-related failures.
            </p>
            <p>
              <span className="font-semibold text-(--foreground-strong)">6. GOVERNING LAW</span>
            </p>
            <p>This Agreement shall be governed by Indian law with jurisdiction at the location entered below.</p>
          </section>

          {activeView === 'agreement' && (
            <>
              <section className="grid gap-3 rounded-2xl border border-(--border) bg-(--surface) p-3 sm:grid-cols-2">
                <input
                  value={form.panNumber}
                  onChange={(event) => setForm((prev) => ({ ...prev, panNumber: event.target.value.toUpperCase() }))}
                  placeholder="PAN Number"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm outline-none transition focus:border-(--accent)"
                  required
                />
                <input
                  value={form.gstNumber}
                  onChange={(event) => setForm((prev) => ({ ...prev, gstNumber: event.target.value.toUpperCase() }))}
                  placeholder="GST Number (if applicable)"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm outline-none transition focus:border-(--accent)"
                />
                <input
                  value={form.jurisdiction}
                  onChange={(event) => setForm((prev) => ({ ...prev, jurisdiction: event.target.value }))}
                  placeholder="Jurisdiction"
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm outline-none transition focus:border-(--accent)"
                  required
                />
                <textarea
                  value={form.projectDetails}
                  onChange={(event) => setForm((prev) => ({ ...prev, projectDetails: event.target.value }))}
                  placeholder="Project details"
                  rows={3}
                  className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm outline-none transition focus:border-(--accent) sm:col-span-2"
                  required
                />
              </section>

              <section className="grid gap-2 rounded-2xl border border-(--border) bg-(--surface) p-3 text-xs text-(--foreground-strong)">
                <label className="inline-flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.confirmations.customerVerification}
                    onChange={(event) => updateConfirmation('customerVerification', event.target.checked)}
                  />
                  <span>I confirm submitted KYC details are true and accurate.</span>
                </label>
                <label className="inline-flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.confirmations.platformRole}
                    onChange={(event) => updateConfirmation('platformRole', event.target.checked)}
                  />
                  <span>I understand the platform is only a marketplace facilitator.</span>
                </label>
                <label className="inline-flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.confirmations.ordersAndPayments}
                    onChange={(event) => updateConfirmation('ordersAndPayments', event.target.checked)}
                  />
                  <span>I accept that confirmed orders are binding and payments use platform-approved methods.</span>
                </label>
                <label className="inline-flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.confirmations.inspectionAndComplaints}
                    onChange={(event) => updateConfirmation('inspectionAndComplaints', event.target.checked)}
                  />
                  <span>I agree to inspect materials on delivery and raise complaints within 72 hours.</span>
                </label>
                <label className="inline-flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.confirmations.limitationOfLiability}
                    onChange={(event) => updateConfirmation('limitationOfLiability', event.target.checked)}
                  />
                  <span>I accept the platform liability limitations stated in this agreement.</span>
                </label>
                <label className="inline-flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.confirmations.governingLaw}
                    onChange={(event) => updateConfirmation('governingLaw', event.target.checked)}
                  />
                  <span>I agree this agreement is governed by Indian law and the entered jurisdiction.</span>
                </label>
                <label className="inline-flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.confirmations.finalConsent}
                    onChange={(event) => updateConfirmation('finalConsent', event.target.checked)}
                  />
                  <span>I digitally accept this Customer (Buyer) Verification & Platform Usage Agreement.</span>
                </label>
              </section>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95 disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Save to User Documents'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-(--border) bg-(--surface-soft) px-4 py-2 text-xs font-semibold text-foreground transition hover:border-(--accent)"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {activeView === 'rules' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveView('agreement')}
                className="rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95"
              >
                Continue to Agreement Form
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-(--border) bg-(--surface-soft) px-4 py-2 text-xs font-semibold text-foreground transition hover:border-(--accent)"
              >
                Close
              </button>
            </div>
          )}
        </form>
      </motion.div>
    </>
  );
}

function MarketplaceAgreementModal({
  onClose,
  vendorID,
  initialAgreement,
}: {
  onClose: () => void;
  vendorID: string;
  initialAgreement?: VendorMarketplaceAgreement | null;
}) {
  const todayIsoDate = new Date().toISOString().slice(0, 10);
  const initialExecutionDate = (() => {
    if (
      initialAgreement?.executedYear
      && initialAgreement?.executedMonth
      && initialAgreement?.executedDay
    ) {
      const year = String(initialAgreement.executedYear).padStart(4, '0');
      const month = String(initialAgreement.executedMonth).padStart(2, '0');
      const day = String(initialAgreement.executedDay).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return todayIsoDate;
  })();

  const [form, setForm] = useState(() => ({
    executionDate: initialExecutionDate,
    supplierLegalName: initialAgreement?.supplierLegalName ?? '',
    supplierBusinessAddress: initialAgreement?.supplierBusinessAddress ?? '',
    supplierGstNumber: initialAgreement?.supplierGstNumber ?? '',
    confirmations: {
      documentationTrue: initialAgreement?.confirmations.documentationTrue ?? false,
      allowAuditAndVerification: initialAgreement?.confirmations.allowAuditAndVerification ?? false,
      qualityAndCompliance: initialAgreement?.confirmations.qualityAndCompliance ?? false,
      commercialAndPaymentTerms: initialAgreement?.confirmations.commercialAndPaymentTerms ?? false,
      indemnityAndConfidentiality: initialAgreement?.confirmations.indemnityAndConfidentiality ?? false,
      terminationAndDisputeResolution: initialAgreement?.confirmations.terminationAndDisputeResolution ?? false,
      finalConsent: initialAgreement?.confirmations.finalConsent ?? false,
    },
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const updateConfirmation = (key: keyof typeof form.confirmations, value: boolean) => {
    setForm((prev) => ({
      ...prev,
      confirmations: {
        ...prev.confirmations,
        [key]: value,
      },
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const [executedYear = '', executedMonth = '', executedDay = ''] = form.executionDate.split('-');

    const requiredValues = [
      form.executionDate,
      form.supplierLegalName,
      form.supplierBusinessAddress,
      form.supplierGstNumber,
    ];

    if (requiredValues.some((value) => !String(value).trim())) {
      setError('Please complete all required agreement fields.');
      return;
    }

    if (Object.values(form.confirmations).some((value) => !value)) {
      setError('Please accept all verification confirmations to continue.');
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await saveVendorMarketplaceAgreement(vendorID, {
        executedDay: executedDay.trim(),
        executedMonth: executedMonth.trim(),
        executedYear: executedYear.trim(),
        marketplaceName: 'Ask BuildEase',
        marketplaceRegisteredOffice: '',
        supplierLegalName: form.supplierLegalName.trim(),
        supplierBusinessAddress: form.supplierBusinessAddress.trim(),
        supplierGstNumber: form.supplierGstNumber.trim().toUpperCase(),
        jurisdiction: 'Pune',
        confirmations: form.confirmations,
      });
      onClose();
    } catch {
      setError('Could not save agreement right now. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <>
      <Backdrop onClose={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="glass-card-strong fixed left-1/2 top-10 z-70 w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 rounded-3xl p-4 text-foreground shadow-[0_28px_80px_rgba(68,39,34,0.28)] sm:p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-(--foreground-strong)">
            Supplier Verification & Marketplace Participation Agreement
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-(--soft-text) transition hover:text-(--foreground-strong)"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[78vh] space-y-4 overflow-y-auto pr-1">
          <p className="text-xs leading-relaxed text-(--muted)">
            This digital verification form replaces physical signatures. Complete all fields and confirmations to
            activate your vendor listing eligibility.
          </p>

          <section className="grid gap-3 rounded-2xl border border-(--border) bg-(--surface) p-3 sm:grid-cols-3">
            <input
              type="date"
              value={form.executionDate}
              onChange={(event) => setForm((prev) => ({ ...prev, executionDate: event.target.value || todayIsoDate }))}
              className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm outline-none transition focus:border-(--accent)"
              max={todayIsoDate}
              required
            />
            <div className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-(--muted)">
              Marketplace: <span className="font-semibold text-(--foreground-strong)">Ask BuildEase</span>
            </div>
            <div className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-(--muted)">
              Jurisdiction: <span className="font-semibold text-(--foreground-strong)">Pune</span>
            </div>
            <input
              value={form.supplierGstNumber}
              onChange={(event) => setForm((prev) => ({ ...prev, supplierGstNumber: event.target.value.toUpperCase() }))}
              placeholder="Supplier GST No."
              className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm outline-none transition focus:border-(--accent)"
              required
            />
            <input
              value={form.supplierLegalName}
              onChange={(event) => setForm((prev) => ({ ...prev, supplierLegalName: event.target.value }))}
              placeholder="Supplier legal name"
              className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm outline-none transition focus:border-(--accent)"
              required
            />
            <input
              value={form.supplierBusinessAddress}
              onChange={(event) => setForm((prev) => ({ ...prev, supplierBusinessAddress: event.target.value }))}
              placeholder="Supplier business address"
              className="rounded-xl border border-(--border) bg-white px-3 py-2 text-sm outline-none transition focus:border-(--accent) sm:col-span-3"
              required
            />
          </section>

          <section className="space-y-2 rounded-2xl border border-(--border) bg-(--surface) p-3 text-xs leading-relaxed text-(--muted)">
            <p className="font-semibold text-(--foreground-strong)">SUPPLIER VERIFICATION & MARKETPLACE PARTICIPATION AGREEMENT</p>
            <p>This Agreement is executed on the day, month, and year provided above between the Platform and the Supplier entered in this digital form.</p>
            <p><span className="font-semibold text-(--foreground-strong)">1. PURPOSE AND SCOPE</span></p>
            <p>1.1 The Platform operates a digital B2B marketplace for procurement of civil and building construction materials, similar in nature to organized construction procurement platforms operating in India.</p>
            <p>1.2 This Agreement governs verification, onboarding, listing of products, commercial participation, and ongoing obligations of the Supplier on the Platform.</p>
            <p>1.3 The Platform acts as a marketplace facilitator and does not manufacture the materials supplied by the Supplier.</p>
            <p><span className="font-semibold text-(--foreground-strong)">2. SUPPLIER VERIFICATION & DUE DILIGENCE</span></p>
            <p>2.1 Supplier documentation includes, but is not limited to, certificate of incorporation/firm registration, PAN, GST registration, factory or warehouse address proof, product certifications, cancelled cheque with bank details, and authorized signatory proof.</p>
            <p>2.2 The Platform may conduct physical audits, video inspections, background checks, and third-party verification of facilities, stock, and compliance.</p>
            <p>2.3 Any misrepresentation or suppression of material facts may result in immediate termination.</p>
            <p><span className="font-semibold text-(--foreground-strong)">3. REPRESENTATIONS AND WARRANTIES</span></p>
            <p>Supplier warrants legal authority to enter this Agreement and confirms all materials are genuine, defect-free, not counterfeit/adulterated, and compliant with applicable Indian standards and laws including GST, labor, environmental, and safety regulations.</p>
            <p><span className="font-semibold text-(--foreground-strong)">4. QUALITY ASSURANCE & INSPECTION</span></p>
            <p>The Platform may conduct random quality inspections and third-party laboratory testing. On quality failure, Supplier bears rejection, replacement, testing, logistics, and penalties. Repeated failures may lead to suspension or delisting.</p>
            <p><span className="font-semibold text-(--foreground-strong)">5. PRICING & COMMERCIAL TERMS</span></p>
            <p>Supplier pricing must be transparent with GST treatment clearly stated. Platform may charge commission/service fee/margin as separately agreed. Price manipulation and off-platform transactions with Platform customers are prohibited.</p>
            <p><span className="font-semibold text-(--foreground-strong)">6. ORDER FULFILLMENT & LOGISTICS</span></p>
            <p>Supplier must fulfill orders within agreed delivery timelines. Packaging must meet industry safety standards. Delays or short supply may attract penalties or cancellation.</p>
            <p><span className="font-semibold text-(--foreground-strong)">7. PAYMENT TERMS</span></p>
            <p>Payments are routed through Platform-designated payment or escrow systems. Settlement occurs within entered working days from delivery confirmation. Platform may withhold payments in case of disputes or non-compliance.</p>
            <p><span className="font-semibold text-(--foreground-strong)">8. INDEMNITY & LIABILITY</span></p>
            <p>Supplier indemnifies and holds harmless the Platform against claims, losses, damages, penalties, tax demands, and legal expenses arising from defective materials, statutory non-compliance, or third-party claims.</p>
            <p><span className="font-semibold text-(--foreground-strong)">9. CONFIDENTIALITY & DATA PROTECTION</span></p>
            <p>All business, pricing, customer, and platform data are confidential and cannot be disclosed without prior written consent.</p>
            <p><span className="font-semibold text-(--foreground-strong)">10. TERMINATION</span></p>
            <p>Either Party may terminate with 30 days written notice. Platform may terminate immediately for fraud, misrepresentation, or repeated defaults.</p>
            <p><span className="font-semibold text-(--foreground-strong)">11. GOVERNING LAW & DISPUTE RESOLUTION</span></p>
            <p>This Agreement is governed by the laws of India. Disputes are resolved through arbitration under the Arbitration and Conciliation Act, 1996, with jurisdiction as entered in this form.</p>
            <p><span className="font-semibold text-(--foreground-strong)">12. DIGITAL ACCEPTANCE</span></p>
            <p>Physical signatures are replaced by successful digital submission of this verification form and mandatory confirmations below.</p>
          </section>

          <section className="grid gap-2 rounded-2xl border border-(--border) bg-(--surface) p-3 text-xs text-(--foreground-strong)">
            <label className="inline-flex items-start gap-2">
              <input
                type="checkbox"
                checked={form.confirmations.documentationTrue}
                onChange={(event) => updateConfirmation('documentationTrue', event.target.checked)}
              />
              <span>I confirm all supplier documents and declarations are true, complete, and accurate.</span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input
                type="checkbox"
                checked={form.confirmations.allowAuditAndVerification}
                onChange={(event) => updateConfirmation('allowAuditAndVerification', event.target.checked)}
              />
              <span>I permit audits, inspections, background checks, and third-party verification by the Platform.</span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input
                type="checkbox"
                checked={form.confirmations.qualityAndCompliance}
                onChange={(event) => updateConfirmation('qualityAndCompliance', event.target.checked)}
              />
              <span>I accept quality obligations and liability for non-compliance, rejection, or replacement.</span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input
                type="checkbox"
                checked={form.confirmations.commercialAndPaymentTerms}
                onChange={(event) => updateConfirmation('commercialAndPaymentTerms', event.target.checked)}
              />
              <span>I agree to commercial, logistics, and payment routing terms stated in this Agreement.</span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input
                type="checkbox"
                checked={form.confirmations.indemnityAndConfidentiality}
                onChange={(event) => updateConfirmation('indemnityAndConfidentiality', event.target.checked)}
              />
              <span>I agree to indemnity, confidentiality, and data-protection responsibilities.</span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input
                type="checkbox"
                checked={form.confirmations.terminationAndDisputeResolution}
                onChange={(event) => updateConfirmation('terminationAndDisputeResolution', event.target.checked)}
              />
              <span>I accept termination and dispute resolution terms, including arbitration under Indian law.</span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input
                type="checkbox"
                checked={form.confirmations.finalConsent}
                onChange={(event) => updateConfirmation('finalConsent', event.target.checked)}
              />
              <span>I digitally verify and consent to this Supplier Verification & Marketplace Participation Agreement.</span>
            </label>
          </section>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--accent-contrast) transition hover:brightness-95 disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save to Vendor Documents'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-(--border) bg-(--surface-soft) px-4 py-2 text-xs font-semibold text-foreground transition hover:border-(--accent)"
            >
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </>
  );
}

type ActiveModal =
  | 'location'
  | 'account'
  | 'customer-orders'
  | 'customer-rules'
  | 'customer-agreement'
  | 'marketplace-agreement'
  | null;

type HeaderVariant = 'default' | 'admin-workspace' | 'vendor-workspace';

type WorkspaceTab = 'workspace' | 'admin' | 'vendor';

function WorkspaceSwitcher({
  active,
  showAdmin = true,
  showVendor = true,
  className = '',
  reducedMotion = false,
}: {
  active: WorkspaceTab;
  showAdmin?: boolean;
  showVendor?: boolean;
  className?: string;
  reducedMotion?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const marketplaceRef = useRef<HTMLAnchorElement | null>(null);
  const adminRef = useRef<HTMLAnchorElement | null>(null);
  const vendorRef = useRef<HTMLAnchorElement | null>(null);
  const [pill, setPill] = useState({ x: 0, width: 0, ready: false });

  useEffect(() => {
    const updatePill = () => {
      const activeEl =
        active === 'workspace'
          ? marketplaceRef.current
          : active === 'admin'
            ? adminRef.current
            : vendorRef.current;

      if (!containerRef.current || !activeEl) {
        return;
      }

      setPill({
        x: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
        ready: true,
      });
    };

    updatePill();
    window.addEventListener('resize', updatePill);

    return () => {
      window.removeEventListener('resize', updatePill);
    };
  }, [active, showAdmin, showVendor]);

  return (
    <div
      ref={containerRef}
      className={`relative isolate inline-flex items-center rounded-full border border-(--border) bg-(--surface) p-1 ${className}`}
    >
      <motion.div
        aria-hidden
        initial={false}
        animate={{ x: pill.x, width: pill.width, opacity: pill.ready ? 1 : 0 }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 150, damping: 20, mass: 0.9 }
        }
        className="absolute bottom-1 left-0 top-1 z-0 rounded-full border border-(--accent) bg-(--accent)"
      />

      <Link
        href="/"
        ref={marketplaceRef}
        className={`relative z-10 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 ${
          active === 'workspace' ? 'text-(--accent-contrast)' : 'text-foreground hover:text-(--foreground-strong)'
        }`}
      >
        Marketplace
      </Link>

      {showAdmin && (
        <Link
          href="/admin_workspace"
          ref={adminRef}
          className={`relative z-10 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 ${
            active === 'admin' ? 'text-(--accent-contrast)' : 'text-foreground hover:text-(--foreground-strong)'
          }`}
        >
          Admin Workspace
        </Link>
      )}

      {showVendor && (
        <Link
          href="/vendor_workspace"
          ref={vendorRef}
          className={`relative z-10 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 ${
            active === 'vendor' ? 'text-(--accent-contrast)' : 'text-foreground hover:text-(--foreground-strong)'
          }`}
        >
          Vendor Workspace
        </Link>
      )}
    </div>
  );
}

export default function Header({
  variant = 'default',
  onAdminSectionChange,
  onVendorSectionChange,
  vendorID = '',
  hasMarketplaceAgreement = false,
  marketplaceAgreement = null,
}: {
  variant?: HeaderVariant;
  onAdminSectionChange?: (section: string) => void;
  onVendorSectionChange?: (section: string) => void;
  vendorID?: string;
  hasMarketplaceAgreement?: boolean;
  marketplaceAgreement?: VendorMarketplaceAgreement | null;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [modal, setModal] = useState<ActiveModal>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(() => {
    if (typeof window === 'undefined') {
      return 0;
    }

    const savedCount = window.localStorage.getItem('cart-count');
    const parsed = Number(savedCount ?? 0);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  const [cartPulseKey, setCartPulseKey] = useState(0);
  const [activeAdminSection, setActiveAdminSection] = useState('');
  const [activeVendorSection, setActiveVendorSection] = useState('');
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [customerAgreement, setCustomerAgreement] = useState<CustomerPlatformAgreement | null>(null);
  const profileIslandRef = useRef<HTMLDivElement>(null);
  const customerAgreementPromptedForUidRef = useRef<string | null>(null);
  const { user, phoneNumber, isAdmin, isVendor, signOut: authSignOut } = useAuth();
  const showAdminWorkspace = isAdmin;
  const showVendorWorkspace = !isAdmin && isVendor;
  const isCustomerUser = Boolean(user) && !isAdmin && !isVendor;
  const customerUid = firebaseAuth.currentUser?.uid ?? '';
  const hasCustomerAgreement = Boolean(customerAgreement?.isCompleted);
  const onAdminSectionChangeRef = useRef(onAdminSectionChange);
  const onVendorSectionChangeRef = useRef(onVendorSectionChange);

  useEffect(() => {
    onAdminSectionChangeRef.current = onAdminSectionChange;
  }, [onAdminSectionChange]);

  useEffect(() => {
    onVendorSectionChangeRef.current = onVendorSectionChange;
  }, [onVendorSectionChange]);

  useEffect(() => {
    const handleCartCountUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ count?: number }>;
      const nextCount = Number(customEvent.detail?.count ?? 0);
      if (Number.isFinite(nextCount) && nextCount >= 0) {
        setCartCount(nextCount);
      }
    };

    window.addEventListener('cart-count-updated', handleCartCountUpdated as EventListener);

    return () => {
      window.removeEventListener('cart-count-updated', handleCartCountUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleCartItemAdded = () => {
      setCartPulseKey((prev) => prev + 1);
    };

    window.addEventListener('cart-item-added', handleCartItemAdded);

    return () => {
      window.removeEventListener('cart-item-added', handleCartItemAdded);
    };
  }, []);

  useEffect(() => {
    if (variant !== 'admin-workspace' && variant !== 'vendor-workspace') {
      return;
    }

    const syncActiveSection = () => {
      const section = window.location.hash.replace('#', '').trim();
      if (variant === 'admin-workspace') {
        setActiveAdminSection(section);
        onAdminSectionChangeRef.current?.(section || 'workspace');
      } else {
        setActiveVendorSection(section);
        onVendorSectionChangeRef.current?.(section || 'workspace');
      }
    };

    syncActiveSection();
    window.addEventListener('hashchange', syncActiveSection);

    return () => {
      window.removeEventListener('hashchange', syncActiveSection);
    };
  }, [variant]);

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (profileIslandRef.current && !profileIslandRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => {
    if (variant !== 'default' || !isCustomerUser) {
      return;
    }

    const uid = firebaseAuth.currentUser?.uid;

    if (!uid) {
      return;
    }

    let cancelled = false;

    void getCustomerPlatformAgreement(uid)
      .then((agreement) => {
        if (cancelled) {
          return;
        }

        setCustomerAgreement(agreement);

        if (!agreement?.isCompleted && customerAgreementPromptedForUidRef.current !== uid) {
          setModal((prev) => prev ?? 'customer-agreement');
          customerAgreementPromptedForUidRef.current = uid;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCustomerAgreement(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isCustomerUser, user, variant]);

  const toggle = (value: ActiveModal) => setModal((prev) => (prev === value ? null : value));
  const close = () => setModal(null);
  const handleAdminNavClick = (section: string) => {
    setActiveAdminSection(section);
    onAdminSectionChangeRef.current?.(section);
  };

  const handleVendorNavClick = (section: string) => {
    setActiveVendorSection(section);
    onVendorSectionChangeRef.current?.(section);
  };

  return (
    <>
      <motion.header
        initial={prefersReducedMotion ? undefined : { y: -48, opacity: 0 }}
        animate={prefersReducedMotion ? undefined : { y: 0, opacity: 1 }}
        transition={prefersReducedMotion ? undefined : { duration: 0.55, ease: 'easeOut' }}
        className="fixed inset-x-0 top-4 z-50"
      >
        <div className="section-shell">
          <nav className="glass-card-soft relative flex items-center gap-2 rounded-4xl px-3 py-2 shadow-[0_20px_70px_rgba(68,39,34,0.18)] sm:gap-3 sm:px-4 sm:py-2.5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-10 top-0 h-px bg-linear-to-r from-transparent via-white/70 to-transparent"
            />

            {variant === 'admin-workspace' ? (
              <>
                <WorkspaceSwitcher
                  active="admin"
                  showAdmin={showAdminWorkspace}
                  showVendor={showVendorWorkspace}
                  className="mr-auto"
                  reducedMotion={Boolean(prefersReducedMotion)}
                />
                <Link
                  href="/admin_workspace#products"
                  onClick={() => handleAdminNavClick('products')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeAdminSection === 'products'
                      ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                      : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                  }`}
                >
                  Products
                </Link>
                <Link
                  href="/admin_workspace#vendors"
                  onClick={() => handleAdminNavClick('vendors')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeAdminSection === 'vendors'
                      ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                      : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                  }`}
                >
                  Vendors
                </Link>
                <Link
                  href="/admin_workspace#orders"
                  onClick={() => handleAdminNavClick('orders')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeAdminSection === 'orders'
                      ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                      : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                  }`}
                >
                  Orders
                </Link>
                <Link
                  href="/admin_workspace#sales"
                  onClick={() => handleAdminNavClick('sales')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeAdminSection === 'sales'
                      ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                      : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                  }`}
                >
                  Sales
                </Link>
                <Link
                  href="/admin_workspace#customers"
                  onClick={() => handleAdminNavClick('customers')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeAdminSection === 'customers'
                      ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                      : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                  }`}
                >
                  Customers
                </Link>
                <motion.div
                  layout
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="relative flex items-center overflow-hidden rounded-full border border-(--border) bg-(--surface)"
                  style={{ willChange: 'width' }}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {isProfileMenuOpen && user ? (
                      <motion.div
                        key="admin-expanded"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1 px-2 py-1"
                      >
                        <span className="px-1.5 text-xs font-semibold text-(--foreground-strong) whitespace-nowrap">{user}</span>
                        <div className="mx-1 h-3.5 w-px shrink-0 bg-(--border)" />
                        <button
                          type="button"
                          onClick={async () => {
                            setIsProfileMenuOpen(false);
                            await authSignOut();
                          }}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-red-500 transition hover:bg-red-50 whitespace-nowrap"
                        >
                          <LogOut size={11} />
                          Log Out
                        </button>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="admin-collapsed"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => (user ? setIsProfileMenuOpen(true) : toggle('account'))}
                        aria-expanded={isProfileMenuOpen || modal === 'account'}
                        aria-haspopup="dialog"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground transition hover:text-(--foreground-strong)"
                      >
                        <User size={12} />
                        <span className="max-w-20 truncate">{user ?? 'Login'}</span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.div>
              </>
            ) : variant === 'vendor-workspace' ? (
              <>
                <WorkspaceSwitcher
                  active="vendor"
                  showAdmin={showAdminWorkspace}
                  showVendor={showVendorWorkspace}
                  className="mr-auto"
                  reducedMotion={Boolean(prefersReducedMotion)}
                />
                <Link
                  href="/vendor_workspace#headers"
                  onClick={() => handleVendorNavClick('headers')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeVendorSection === 'headers'
                      ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                      : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                  }`}
                >
                  Headers
                </Link>
                <Link
                  href="/vendor_workspace#products"
                  onClick={() => handleVendorNavClick('products')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeVendorSection === 'products'
                      ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                      : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                  }`}
                >
                  Products
                </Link>
                <Link
                  href="/vendor_workspace#orders"
                  onClick={() => handleVendorNavClick('orders')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeVendorSection === 'orders'
                      ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                      : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                  }`}
                >
                  Orders
                </Link>
                <Link
                  href="/vendor_workspace#sales"
                  onClick={() => handleVendorNavClick('sales')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeVendorSection === 'sales'
                      ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                      : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                  }`}
                >
                  Sales
                </Link>
                <Link
                  href="/vendor_workspace#customers"
                  onClick={() => handleVendorNavClick('customers')}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    activeVendorSection === 'customers'
                      ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                      : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                  }`}
                >
                  Customers
                </Link>
                <motion.div
                  layout
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="relative flex items-center overflow-hidden rounded-full border border-(--border) bg-(--surface)"
                  style={{ willChange: 'width' }}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {isProfileMenuOpen && user ? (
                      <motion.div
                        key="vendor-expanded"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1 px-2 py-1"
                      >
                        <span className="px-1.5 text-xs font-semibold text-(--foreground-strong) whitespace-nowrap">{user}</span>
                        <div className="mx-1 h-3.5 w-px shrink-0 bg-(--border)" />
                        <button
                          type="button"
                          disabled={!vendorID}
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            setModal('marketplace-agreement');
                          }}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-(--muted) transition hover:bg-(--surface-soft) hover:text-(--foreground-strong) whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <FileText size={11} />
                          {hasMarketplaceAgreement ? 'Agreement Saved' : 'Marketplace Agreement'}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setIsProfileMenuOpen(false);
                            await authSignOut();
                          }}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-red-500 transition hover:bg-red-50 whitespace-nowrap"
                        >
                          <LogOut size={11} />
                          Log Out
                        </button>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="vendor-collapsed"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => (user ? setIsProfileMenuOpen(true) : toggle('account'))}
                        aria-expanded={isProfileMenuOpen || modal === 'account'}
                        aria-haspopup="dialog"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground transition hover:text-(--foreground-strong)"
                      >
                        <User size={12} />
                        <span className="max-w-20 truncate">{user ?? 'Login'}</span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.div>
              </>
            ) : (
              <>
                <a
                  href="#top"
                  className="mr-auto shrink-0 rounded-full border border-(--border) bg-(--surface) px-3 py-1.5 text-[0.68rem] font-semibold tracking-[0.22em] text-(--foreground-strong) shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                >
                  ASK BUILDEASE
                </a>
                <motion.div
                  animate={prefersReducedMotion ? undefined : { x: isProfileMenuOpen ? -6 : 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                >
                  <button
                    onClick={() => toggle('location')}
                    aria-expanded={modal === 'location'}
                    aria-haspopup="dialog"
                    className="flex items-center gap-1.5 rounded-full border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-(--accent) hover:bg-(--surface-soft)"
                  >
                    <MapPin size={12} />
                    <span className="max-w-22 truncate">{location ?? 'Set location'}</span>
                  </button>
                </motion.div>

                {(showAdminWorkspace || showVendorWorkspace) && (
                  <WorkspaceSwitcher
                    active="workspace"
                    showAdmin={showAdminWorkspace}
                    showVendor={showVendorWorkspace}
                    reducedMotion={Boolean(prefersReducedMotion)}
                  />
                )}

                <motion.div
                  ref={profileIslandRef}
                  layout
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="relative flex items-center overflow-hidden rounded-full border border-(--border) bg-(--surface)"
                  style={{ willChange: 'width' }}
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {isProfileMenuOpen && user ? (
                      <motion.div
                        key="expanded"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-0.5 px-2 py-1"
                      >
                        <span className="px-1.5 text-xs font-semibold text-(--foreground-strong) whitespace-nowrap">{user}</span>
                        <div className="mx-1 h-3.5 w-px shrink-0 bg-(--border)" />
                        <button
                          type="button"
                          onClick={() => setIsProfileMenuOpen(false)}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-(--muted) transition hover:bg-(--surface-soft) hover:text-(--foreground-strong) whitespace-nowrap"
                          title="Address (coming soon)"
                        >
                          <Home size={11} />
                          Address
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsProfileMenuOpen(false);
                            setModal('customer-orders');
                          }}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-(--muted) transition hover:bg-(--surface-soft) hover:text-(--foreground-strong) whitespace-nowrap"
                          title="Open orders"
                        >
                          <Package size={11} />
                          Orders
                        </button>
                        {isCustomerUser && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setIsProfileMenuOpen(false);
                                setModal('customer-rules');
                              }}
                              className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-(--muted) transition hover:bg-(--surface-soft) hover:text-(--foreground-strong) whitespace-nowrap"
                              title="Platform rules"
                            >
                              <FileText size={11} />
                              Rules
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsProfileMenuOpen(false);
                                setModal('customer-agreement');
                              }}
                              className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-(--muted) transition hover:bg-(--surface-soft) hover:text-(--foreground-strong) whitespace-nowrap"
                              title="Customer agreement"
                            >
                              <FileText size={11} />
                              {hasCustomerAgreement ? 'Agreement Saved' : 'Agreement'}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            setIsProfileMenuOpen(false);
                            await authSignOut();
                          }}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-red-500 transition hover:bg-red-50 whitespace-nowrap"
                        >
                          <LogOut size={11} />
                          Log Out
                        </button>
                      </motion.div>
                    ) : (
                      <motion.button
                        key="collapsed"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => (user ? setIsProfileMenuOpen(true) : toggle('account'))}
                        aria-expanded={isProfileMenuOpen || modal === 'account'}
                        aria-haspopup="dialog"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground transition hover:text-(--foreground-strong)"
                      >
                        <User size={12} />
                        <span className="max-w-20 truncate">{user ?? 'Login'}</span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </motion.div>

                <motion.div
                  animate={prefersReducedMotion ? undefined : { x: isProfileMenuOpen ? 6 : 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="relative"
                >
                  <button
                    onClick={() => window.dispatchEvent(new Event('open-cart-panel'))}
                    aria-label={`Cart, ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
                    className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-(--border) bg-(--surface) text-foreground transition hover:border-(--accent) hover:bg-(--surface-soft)"
                  >
                  <motion.span
                    key={cartPulseKey}
                    initial={prefersReducedMotion ? false : { scale: 1, rotate: 0 }}
                    animate={prefersReducedMotion ? undefined : { scale: [1, 1.16, 1], rotate: [0, -8, 0] }}
                    transition={{ duration: 0.42, ease: 'easeOut' }}
                    className="inline-flex h-4 w-4 items-center justify-center leading-none"
                  >
                    <ShoppingCart size={16} />
                  </motion.span>

                  {!prefersReducedMotion && cartPulseKey > 0 && (
                    <motion.span
                      key={`ring-${cartPulseKey}`}
                      aria-hidden
                      initial={{ opacity: 0.5, scale: 0.95 }}
                      animate={{ opacity: 0, scale: 1.65 }}
                      transition={{ duration: 0.55, ease: 'easeOut' }}
                      className="pointer-events-none absolute inset-0 rounded-full border border-(--accent)/60"
                    />
                  )}

                  {cartCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-(--accent) text-[9px] font-bold leading-none text-(--accent-contrast)">
                      {cartCount > 9 ? '9+' : cartCount}
                    </span>
                  )}
                  </button>
                </motion.div>

                <a
                  href="#about"
                  className="hidden rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold tracking-[0.12em] text-foreground transition hover:border-(--border) hover:bg-(--surface) sm:block"
                >
                  ABOUT US
                </a>
              </>
            )}
          </nav>
        </div>
      </motion.header>

      <AnimatePresence>
        {modal === 'location' && (
          <LocationModal
            key="location"
            onClose={close}
            onSave={(loc) => {
              setLocation(loc);
              close();
            }}
          />
        )}
        {modal === 'account' && (
          <AccountModal
            key="account"
            user={user}
            onSignUpCompleted={() => {
              // AuthContext's onAuthStateChanged listener handles the user update.
            }}
            onSignOut={authSignOut}
            onClose={close}
          />
        )}
        {modal === 'customer-orders' && (
          <CustomerOrdersModal
            key="customer-orders"
            onClose={close}
            customerID={firebaseAuth.currentUser?.uid ?? null}
            customerPhone={phoneNumber}
            customerName={user}
          />
        )}
        {(modal === 'customer-rules' || modal === 'customer-agreement') && Boolean(customerUid) && isCustomerUser && (
          <CustomerPlatformAgreementModal
            key="customer-platform-agreement"
            onClose={close}
            userID={customerUid}
            initialAgreement={customerAgreement}
            initialView={modal === 'customer-rules' ? 'rules' : 'agreement'}
            onSaved={(agreement) => {
              setCustomerAgreement(agreement);
            }}
          />
        )}
        {modal === 'marketplace-agreement' && Boolean(vendorID) && (
          <MarketplaceAgreementModal
            key="marketplace-agreement"
            onClose={close}
            vendorID={vendorID}
            initialAgreement={marketplaceAgreement}
          />
        )}
      </AnimatePresence>
    </>
  );
}

