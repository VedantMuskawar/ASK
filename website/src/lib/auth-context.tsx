'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import {
  firebaseSignOut,
  getUserFirstName,
  getUserRole,
  onFirebaseAuthStateChanged,
} from '@/lib/firebase-auth';

const STORAGE_KEY = 'askbuildease_auth_user';

interface AuthContextValue {
  user: string | null;
  phoneNumber: string | null;
  isAdmin: boolean;
  isVendor: boolean;
  isAuthReady: boolean;
  updateUser: (name: string | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Keep the initial render deterministic between server and client.
  // We restore cached user info only after mount to avoid hydration mismatch.
  const [user, setUserState] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const updateUser = useCallback((name: string | null) => {
    setUserState(name);
    if (typeof window !== 'undefined') {
      if (name) {
        localStorage.setItem(STORAGE_KEY, name);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    // Keep auth state in sync with Firebase. This confirms/updates the cached
    // name and handles sign-out from other tabs as well.
    const unsubscribe = onFirebaseAuthStateChanged((firebaseUser) => {
      if (!firebaseUser) {
        updateUser(null);
        setPhoneNumber(null);
        setIsAdmin(false);
        setIsVendor(false);
        setIsAuthReady(true);
        return;
      }

      setPhoneNumber(firebaseUser.phoneNumber ?? null);

      void Promise.all([
        getUserFirstName(firebaseUser.uid, firebaseUser.phoneNumber),
        getUserRole(firebaseUser.uid, firebaseUser.phoneNumber),
      ])
        .then(([firstName, role]) => {
          const normalizedRole = String(role ?? '').toLowerCase();
          updateUser(firstName ?? firebaseUser.phoneNumber ?? null);
          setIsAdmin(normalizedRole === 'admin');
          setIsVendor(normalizedRole === 'vendor' || normalizedRole === 'vendors');
          setIsAuthReady(true);
        })
        .catch(() => {
          updateUser(firebaseUser.phoneNumber ?? null);
          setIsAdmin(false);
          setIsVendor(false);
          setIsAuthReady(true);
        });
    });

    return unsubscribe;
  }, [updateUser]);

  const signOut = useCallback(async () => {
    await firebaseSignOut();
    updateUser(null);
    setPhoneNumber(null);
    setIsAdmin(false);
    setIsVendor(false);
    setIsAuthReady(true);
  }, [updateUser]);

  return (
    <AuthContext.Provider value={{ user, phoneNumber, isAdmin, isVendor, isAuthReady, updateUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
