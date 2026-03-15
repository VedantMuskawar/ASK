"use client";

import { useEffect, useState } from "react";
import type { ConfirmationResult } from "firebase/auth";

import {
  firebaseAuth,
  firebaseSignOut,
  getFirebaseAuthErrorMessage,
  hasUserProfile,
  requestPhoneOtp,
  signUpUser,
  verifyPhoneOtp,
} from "@/lib/firebase-auth";

const COUNTRY_CODES = [
  { dialCode: "+91", minLength: 10, maxLength: 10, example: "9876543210" },
  { dialCode: "+1", minLength: 10, maxLength: 10, example: "2025550143" },
  { dialCode: "+44", minLength: 10, maxLength: 10, example: "7400123456" },
  { dialCode: "+971", minLength: 9, maxLength: 9, example: "501234567" },
  { dialCode: "+65", minLength: 8, maxLength: 8, example: "81234567" },
  { dialCode: "+61", minLength: 9, maxLength: 9, example: "412345678" },
] as const;

type SignUpFormProps = {
  onSuccess?: () => void;
  onCompletionChange?: (isComplete: boolean) => void;
  onAlreadyRegistered?: () => void;
};

export default function SignUpForm({
  onSuccess,
  onCompletionChange,
  onAlreadyRegistered,
}: SignUpFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState<(typeof COUNTRY_CODES)[number]["dialCode"]>("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState(firebaseAuth.currentUser?.phoneNumber ?? "");
  const [isPhoneVerified, setIsPhoneVerified] = useState(Boolean(firebaseAuth.currentUser));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const selectedCountry = COUNTRY_CODES.find((country) => country.dialCode === countryCode) ?? COUNTRY_CODES[0];
  const hasRequestedOtp = confirmationResult !== null;
  const isFormComplete =
    isPhoneVerified &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0;

  useEffect(() => {
    onCompletionChange?.(isFormComplete);
  }, [isFormComplete, onCompletionChange]);

  useEffect(() => {
    return () => {
      onCompletionChange?.(false);
    };
  }, [onCompletionChange]);

  const handleSendOtp = async () => {
    const phoneDigits = phoneNumber.replace(/\D/g, "");

    if (
      phoneDigits.length < selectedCountry.minLength ||
      phoneDigits.length > selectedCountry.maxLength
    ) {
      setError(
        `Enter a valid ${selectedCountry.minLength === selectedCountry.maxLength ? selectedCountry.minLength : `${selectedCountry.minLength}-${selectedCountry.maxLength}`} digit phone number.`,
      );
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const e164PhoneNumber = `${selectedCountry.dialCode}${phoneDigits}`;
      const result = await requestPhoneOtp(e164PhoneNumber, "signup-phone-auth-recaptcha");
      setConfirmationResult(result);
      setSuccess("OTP sent. Enter the 6-digit code.");
    } catch (err: unknown) {
      setError(getFirebaseAuthErrorMessage(err));
      setSuccess("");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmationResult) {
      setError("Request OTP first.");
      return;
    }

    if (!/^\d{6}$/.test(otpCode)) {
      setError("Enter a valid 6-digit OTP.");
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      await verifyPhoneOtp(confirmationResult, otpCode);
      const currentUser = firebaseAuth.currentUser;

      if (!currentUser) {
        throw new Error("Phone verification failed. Please try again.");
      }

      const alreadyRegistered = await hasUserProfile(currentUser.uid);
      if (alreadyRegistered) {
        await firebaseSignOut();
        setConfirmationResult(null);
        setOtpCode("");
        setIsPhoneVerified(false);
        setVerifiedPhone("");
        setSuccess("");
        onAlreadyRegistered?.();
        return;
      }

      setIsPhoneVerified(true);
      setVerifiedPhone(currentUser.phoneNumber ?? `${countryCode}${phoneNumber.replace(/\D/g, "")}`);
      setSuccess("Phone verified. Complete your profile details.");
      setConfirmationResult(null);
      setOtpCode("");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Invalid OTP. Please try again.");
      } else {
        setError("Invalid OTP. Please try again.");
      }
      setSuccess("");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!isPhoneVerified) {
      setError("Verify your mobile number with OTP to continue.");
      return;
    }

    setLoading(true);

    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error("No authenticated user. Complete OTP verification first.");

      await signUpUser({
        uid: user.uid,
        firstName,
        lastName,
        phone: verifiedPhone || user.phoneNumber || "",
        email,
        role: "customer",
      });

      setSuccess("Sign up successful!");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhoneNumber("");
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Sign up failed. Try again.");
      } else {
        setError("Sign up failed. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full min-w-0 space-y-4">
      <div className="space-y-2 rounded-xl border border-(--border) bg-(--surface-soft) p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-(--foreground-strong)">Mobile verification</p>
          {isPhoneVerified && (
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-emerald-700">
              VERIFIED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative shrink-0" style={{ minWidth: 0, width: "auto", display: "inline-block" }}>
            <select
              value={countryCode}
              disabled={isPhoneVerified || hasRequestedOtp}
              onChange={(e) => {
                setCountryCode(e.target.value as (typeof COUNTRY_CODES)[number]["dialCode"]);
                setPhoneNumber("");
                setError("");
              }}
              className="appearance-none rounded-xl border border-(--border) bg-(--surface) px-2.5 py-2.5 text-sm font-semibold text-foreground outline-none transition focus:border-(--accent) disabled:opacity-70"
              style={{ WebkitAppearance: "none", MozAppearance: "none", appearance: "none", width: "auto", minWidth: "2.5rem" }}
            >
              {COUNTRY_CODES.map((country) => (
                <option key={country.dialCode} value={country.dialCode}>
                  {country.dialCode}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-(--soft-text)"
              aria-hidden="true"
            ></span>
          </div>
          <input
            type="tel"
            inputMode="numeric"
            maxLength={selectedCountry.maxLength}
            value={phoneNumber}
            disabled={isPhoneVerified || hasRequestedOtp}
            onChange={(e) => {
              setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, selectedCountry.maxLength));
              setError("");
            }}
            placeholder={selectedCountry.example}
            className="min-w-0 flex-1 rounded-xl border border-(--border) bg-(--surface) px-3 py-2.5 text-sm text-foreground placeholder:text-(--soft-text) outline-none transition focus:border-(--accent) disabled:opacity-70"
          />
        </div>

        {hasRequestedOtp && !isPhoneVerified && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => {
                setOtpCode(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              placeholder="Enter OTP"
              className="min-w-0 flex-1 rounded-xl border border-(--border) bg-(--surface) px-3 py-2.5 text-sm text-foreground placeholder:text-(--soft-text) outline-none transition focus:border-(--accent)"
            />
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={loading}
              className="rounded-xl border border-(--border) px-3 py-2.5 text-xs font-semibold text-(--foreground-strong) transition hover:border-(--accent) disabled:opacity-60"
            >
              Verify OTP
            </button>
          </div>
        )}

        {!isPhoneVerified && (
          <button
            type="button"
            onClick={handleSendOtp}
            disabled={loading || hasRequestedOtp}
            className="w-full rounded-xl border border-(--border) py-2.5 text-xs font-semibold text-(--foreground-strong) transition hover:border-(--accent) disabled:opacity-60"
          >
            {hasRequestedOtp ? "OTP Sent" : "Send OTP"}
          </button>
        )}

        {isPhoneVerified && (
          <p className="text-xs text-emerald-600">Verified mobile: {verifiedPhone}</p>
        )}
        <div id="signup-phone-auth-recaptcha" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="text"
          placeholder="First Name"
          value={firstName}
          onChange={e => setFirstName(e.target.value)}
          required
          className="w-full min-w-0 rounded-xl border border-(--border) px-3 py-2.5 text-sm"
        />
        <input
          type="text"
          placeholder="Last Name"
          value={lastName}
          onChange={e => setLastName(e.target.value)}
          required
          className="w-full min-w-0 rounded-xl border border-(--border) px-3 py-2.5 text-sm"
        />
      </div>
      <input
        type="email"
        placeholder="Email Address"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        className="w-full min-w-0 rounded-xl border border-(--border) px-3 py-2.5 text-sm"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-emerald-600">{success}</p>}
      <button
        type="submit"
        disabled={loading || !isPhoneVerified}
        className="w-full rounded-xl bg-(--accent) py-2.5 text-sm font-semibold text-(--accent-contrast) transition hover:brightness-95 disabled:opacity-60"
      >
        {loading ? "Signing up..." : "Sign Up"}
      </button>
    </form>
  );
}
