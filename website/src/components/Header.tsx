'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ConfirmationResult } from 'firebase/auth';
import { MapPin, Navigation, ShoppingCart, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  firebaseSignOut,
  getFirebaseAuthErrorMessage,
  onFirebaseAuthStateChanged,
  requestPhoneOtp,
  verifyPhoneOtp,
  canUserLogin,
} from '@/lib/firebase-auth';
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
  requiresSignUp,
  onSignUpCompleted,
  onSignOut,
  onClose,
}: {
  user: string | null;
  requiresSignUp: boolean;
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
  const [showSignUp, setShowSignUp] = useState(requiresSignUp);
  const hasRequestedOtp = confirmationResult !== null;
  const selectedCountry = COUNTRY_CODES.find((country) => country.dialCode === countryCode) ?? COUNTRY_CODES[0];
  const shouldShowSignUp = showSignUp || (Boolean(user) && requiresSignUp);

  useEffect(() => {
    setShowSignUp(requiresSignUp);
  }, [requiresSignUp]);

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
      const { firebaseAuth } = await import('@/lib/firebase-auth');
      const user = firebaseAuth.currentUser;
      if (user) {
        const allowed = await canUserLogin(user.uid);
        if (!allowed) {
          setShowSignUp(true);
          setStatus('Complete sign up to continue.');
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
      <Backdrop onClose={onClose} />
      <ModalPanel>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-(--foreground-strong)">
            {user ? `Hi, ${user}` : 'Login'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-(--soft-text) transition hover:text-(--foreground-strong)"
          >
            <X size={15} />
          </button>
        </div>

        {shouldShowSignUp ? (
          <div className="space-y-3">
            <SignUpForm
              onSuccess={() => {
                setShowSignUp(false);
                onSignUpCompleted();
                setStatus('Sign up complete. You can now use your account.');
                setTimeout(onClose, 700);
              }}
            />
          </div>
        ) : user ? (
          <div className="space-y-4">
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
          </div>
        ) : (
          <div className="space-y-3">
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
                <a href="#" className="text-(--foreground-strong) underline underline-offset-2 hover:text-(--accent)">
                  Sign up
                </a>
              </p>
            )}
            <div id="phone-auth-recaptcha" />
            <p className="text-center text-xs text-(--muted)">Use your mobile number to sign in securely.</p>
          </div>
        )}
      </ModalPanel>
    </>
  );
}

type ActiveModal = 'location' | 'account' | null;

export default function Header() {
  const prefersReducedMotion = useReducedMotion();
  const [modal, setModal] = useState<ActiveModal>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [requiresSignUp, setRequiresSignUp] = useState(false);
  const [cartCount] = useState(3);

  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged((firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setRequiresSignUp(false);
        return;
      }

      setUser(firebaseUser.phoneNumber ?? null);
      void canUserLogin(firebaseUser.uid)
        .then((allowed) => {
          setRequiresSignUp(!allowed);
        })
        .catch(() => {
          // Keep existing behavior when profile lookup fails unexpectedly.
          setRequiresSignUp(false);
        });
    });

    return unsubscribe;
  }, []);

  const toggle = (value: ActiveModal) => setModal((prev) => (prev === value ? null : value));
  const close = () => setModal(null);

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
            requiresSignUp={requiresSignUp}
            onSignUpCompleted={() => setRequiresSignUp(false)}
            onSignOut={firebaseSignOut}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </>
  );
}

