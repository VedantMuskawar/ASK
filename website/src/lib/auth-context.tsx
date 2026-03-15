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
  isAdmin: boolean;
  updateUser: (name: string | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Keep the initial render deterministic between server and client.
  // We restore cached user info only after mount to avoid hydration mismatch.
  const [user, setUserState] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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
        setIsAdmin(false);
        return;
      }

      void Promise.all([
        getUserFirstName(firebaseUser.uid, firebaseUser.phoneNumber),
        getUserRole(firebaseUser.uid, firebaseUser.phoneNumber),
      ])
        .then(([firstName, role]) => {
          updateUser(firstName ?? firebaseUser.phoneNumber ?? null);
          setIsAdmin(role === 'admin');
        })
        .catch(() => {
          updateUser(firebaseUser.phoneNumber ?? null);
          setIsAdmin(false);
        });
    });

    return unsubscribe;
  }, [updateUser]);

  const signOut = useCallback(async () => {
    await firebaseSignOut();
    updateUser(null);
    setIsAdmin(false);
  }, [updateUser]);

  return (
    <AuthContext.Provider value={{ user, isAdmin, updateUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
