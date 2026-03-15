import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";

export const db = getFirestore(firebaseApp);

export type UserRole = "customer" | "admin";

export interface UserProfile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  role: UserRole;
  createdAt: any;
  updatedAt: any;
  isActive: boolean;
}

export async function createUserProfile({
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
  role?: UserRole;
}) {
  const userRef = doc(db, "USERS", uid);
  const userData: UserProfile = {
    firstName,
    lastName,
    phone,
    email,
    role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    isActive: true,
  };
  await setDoc(userRef, userData, { merge: true });
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const userRef = doc(db, "USERS", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}
