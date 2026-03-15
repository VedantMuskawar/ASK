import {
  getAuth,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import type { FirebaseError } from "firebase/app";

import { firebaseApp } from "@/lib/firebase";

import { createUserProfile, getUserProfile, UserProfile } from "@/lib/firestore-users";

export const firebaseAuth = getAuth(firebaseApp);

if (typeof window !== "undefined") {
  firebaseAuth.useDeviceLanguage();
}

declare global {
  interface Window {
    phoneRecaptcha?: {
      containerId: string;
      rendered: boolean;
      verifier: RecaptchaVerifier;
    };
  }
}

function clearPhoneRecaptcha() {
  if (typeof window === "undefined") {
    return;
  }

  if (!window.phoneRecaptcha) {
    return;
  }

  try {
    window.phoneRecaptcha.verifier.clear();
  } catch {
    // Ignore cleanup failures to avoid blocking user retries.
  }

  delete window.phoneRecaptcha;
}

async function getRecaptchaVerifier(containerId: string): Promise<RecaptchaVerifier> {
  if (typeof window === "undefined") {
    throw new Error("Phone auth is only available in the browser.");
  }

  const recaptchaContainer = document.getElementById(containerId);

  if (!recaptchaContainer) {
    throw new Error(`Missing reCAPTCHA container: #${containerId}`);
  }

  if (
    window.phoneRecaptcha &&
    (window.phoneRecaptcha.containerId !== containerId ||
      !document.getElementById(window.phoneRecaptcha.containerId))
  ) {
    clearPhoneRecaptcha();
  }

  if (!window.phoneRecaptcha) {
    window.phoneRecaptcha = {
      containerId,
      rendered: false,
      verifier: new RecaptchaVerifier(firebaseAuth, containerId, {
        size: "invisible",
      }),
    };
  }

  if (!window.phoneRecaptcha.rendered) {
    await window.phoneRecaptcha.verifier.render();
    window.phoneRecaptcha.rendered = true;
  }

  return window.phoneRecaptcha.verifier;
}

export function getFirebaseAuthErrorMessage(error: unknown): string {
  const firebaseError = error as FirebaseError | undefined;
  const code = firebaseError?.code;

  switch (code) {
    case "auth/invalid-phone-number":
      return "Phone number format is invalid. Please include a valid country code.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/captcha-check-failed":
      return "reCAPTCHA verification failed. Please retry.";
    case "auth/quota-exceeded":
      return "OTP quota exceeded for this project. Try again later.";
    case "auth/network-request-failed":
      return "Network error while sending OTP. Check your connection and retry.";
    case "auth/app-not-authorized":
      return "This domain is not authorized for Firebase phone sign-in.";
    default:
      return "Could not send OTP. Check Firebase Auth setup and try again.";
  }
}

export async function requestPhoneOtp(phoneNumber: string, containerId: string): Promise<ConfirmationResult> {
  const recaptchaVerifier = await getRecaptchaVerifier(containerId);

  try {
    return await signInWithPhoneNumber(firebaseAuth, phoneNumber, recaptchaVerifier);
  } catch (error) {
    // Force a fresh verifier for the next retry in case widget state became invalid.
    clearPhoneRecaptcha();
    throw error;
  }
}

export async function verifyPhoneOtp(confirmationResult: ConfirmationResult, otpCode: string) {
  return confirmationResult.confirm(otpCode);
}

export function onFirebaseAuthStateChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function firebaseSignOut() {
  await signOut(firebaseAuth);
}

// Create user profile in USERS collection after sign up
export async function signUpUser({
  uid,
  firstName,
  lastName,
  phone,
  email,
  role = "customer",
}: {
  uid: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  role?: "customer" | "admin";
}) {
  await createUserProfile({ uid, firstName, lastName, phone, email, role });
}

// Check if user exists in USERS collection and is active
export async function canUserLogin(uid: string): Promise<boolean> {
  const user = await getUserProfile(uid);
  return !!user && user.isActive;
}
