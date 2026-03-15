'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ConfirmationResult } from 'firebase/auth';
import { ChevronLeft, MapPin, Navigation, ShoppingCart, User, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  firebaseAuth,
  canUserLoginByPhone,
  getFirebaseAuthErrorMessage,
  firebaseSignOut,
  requestPhoneOtp,
  verifyPhoneOtp,
  canUserLogin,
} from '@/lib/firebase-auth';
import { useAuth } from '@/lib/auth-context';
import SignUpForm from './SignUpForm';

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
      const allowed = await canUserLoginByPhone(e164PhoneNumber);
      if (!allowed) {
        setStatus('Sign Up Before Login');
        return;
      }

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
        const allowed = await canUserLogin(user.uid);
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

type ActiveModal = 'location' | 'account' | null;

type HeaderVariant = 'default' | 'admin-workspace';

type WorkspaceTab = 'workspace' | 'admin';

function WorkspaceSwitcher({
  active,
  className = '',
  reducedMotion = false,
}: {
  active: WorkspaceTab;
  className?: string;
  reducedMotion?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const marketplaceRef = useRef<HTMLAnchorElement | null>(null);
  const adminRef = useRef<HTMLAnchorElement | null>(null);
  const [pill, setPill] = useState({ x: 0, width: 0, ready: false });

  useEffect(() => {
    const updatePill = () => {
      const activeEl = active === 'workspace' ? marketplaceRef.current : adminRef.current;

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
  }, [active]);

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

      <Link
        href="/admin_workspace"
        ref={adminRef}
        className={`relative z-10 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 ${
          active === 'admin' ? 'text-(--accent-contrast)' : 'text-foreground hover:text-(--foreground-strong)'
        }`}
      >
        Admin Workspace
      </Link>
    </div>
  );
}

export default function Header({
  variant = 'default',
  onAdminSectionChange,
}: {
  variant?: HeaderVariant;
  onAdminSectionChange?: (section: string) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [modal, setModal] = useState<ActiveModal>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [cartCount] = useState(3);
  const [activeAdminSection, setActiveAdminSection] = useState('');
  const { user, isAdmin, signOut: authSignOut } = useAuth();
  const onAdminSectionChangeRef = useRef(onAdminSectionChange);

  useEffect(() => {
    onAdminSectionChangeRef.current = onAdminSectionChange;
  }, [onAdminSectionChange]);

  useEffect(() => {
    if (variant !== 'admin-workspace') {
      return;
    }

    const syncActiveSection = () => {
      const section = window.location.hash.replace('#', '').trim();
      setActiveAdminSection(section);
      onAdminSectionChangeRef.current?.(section || 'workspace');
    };

    syncActiveSection();
    window.addEventListener('hashchange', syncActiveSection);

    return () => {
      window.removeEventListener('hashchange', syncActiveSection);
    };
  }, [variant]);

  const toggle = (value: ActiveModal) => setModal((prev) => (prev === value ? null : value));
  const close = () => setModal(null);
  const handleAdminNavClick = (section: string) => {
    setActiveAdminSection(section);
    onAdminSectionChangeRef.current?.(section);
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
                <WorkspaceSwitcher active="admin" className="mr-auto" reducedMotion={Boolean(prefersReducedMotion)} />
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
                <button
                  onClick={() => toggle('account')}
                  aria-expanded={modal === 'account'}
                  aria-haspopup="dialog"
                  className="flex items-center gap-1.5 rounded-full border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-(--accent) hover:bg-(--surface-soft)"
                >
                  <User size={12} />
                  <span className="max-w-20 truncate">{user ?? 'Login'}</span>
                </button>
              </>
            ) : (
              <>
                <a
                  href="#top"
                  className="mr-auto shrink-0 rounded-full border border-(--border) bg-(--surface) px-3 py-1.5 text-[0.68rem] font-semibold tracking-[0.22em] text-(--foreground-strong) shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                >
                  ASK BUILDEASE
                </a>

                <button
                  onClick={() => toggle('location')}
                  aria-expanded={modal === 'location'}
                  aria-haspopup="dialog"
                  className="flex items-center gap-1.5 rounded-full border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-(--accent) hover:bg-(--surface-soft)"
                >
                  <MapPin size={12} />
                  <span className="max-w-22 truncate">{location ?? 'Set location'}</span>
                </button>

                {isAdmin && <WorkspaceSwitcher active="workspace" reducedMotion={Boolean(prefersReducedMotion)} />}

                <button
                  onClick={() => toggle('account')}
                  aria-expanded={modal === 'account'}
                  aria-haspopup="dialog"
                  className="flex items-center gap-1.5 rounded-full border border-(--border) bg-(--surface) px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-(--accent) hover:bg-(--surface-soft)"
                >
                  <User size={12} />
                  <span className="max-w-20 truncate">{user ?? 'Login'}</span>
                </button>

                <button
                  aria-label={`Cart, ${cartCount} item${cartCount !== 1 ? 's' : ''}`}
                  className="relative rounded-full border border-(--border) bg-(--surface) p-2 text-foreground transition hover:border-(--accent) hover:bg-(--surface-soft)"
                >
                  <ShoppingCart size={16} />
                  {cartCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-(--accent) text-[9px] font-bold leading-none text-(--accent-contrast)">
                      {cartCount > 9 ? '9+' : cartCount}
                    </span>
                  )}
                </button>

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
      </AnimatePresence>
    </>
  );
}

