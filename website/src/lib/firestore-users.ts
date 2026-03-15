import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  getFirestore,
  type FieldValue,
  type Timestamp,
} from "firebase/firestore";
import { firebaseApp } from "@/lib/firebase";

export const db = getFirestore(firebaseApp);

export type UserRole = "customer" | "admin";

export interface UserProfile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  role: UserRole;
  createdAt: Timestamp | FieldValue;
  updatedAt: Timestamp | FieldValue;
  isActive: boolean;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "");
}

export async function ensurePhoneNumberAvailable(phone: string, uid: string): Promise<void> {
  const normalizedPhone = normalizePhone(phone);
  const usersRef = collection(db, "USERS");
  const duplicateQuery = query(usersRef, where("phone", "==", normalizedPhone), limit(1));
  const duplicateSnap = await getDocs(duplicateQuery);

  if (duplicateSnap.empty) {
    return;
  }

  const duplicateDoc = duplicateSnap.docs[0];
  if (duplicateDoc.id !== uid) {
    throw new Error("This mobile number is already registered with another account.");
  }
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
  const normalizedPhone = normalizePhone(phone);
  await ensurePhoneNumberAvailable(normalizedPhone, uid);

  const userRef = doc(db, "USERS", uid);
  const userData: UserProfile = {
    firstName,
    lastName,
    phone: normalizedPhone,
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

export async function getUserProfileByPhone(phone: string): Promise<UserProfile | null> {
  const normalizedPhone = normalizePhone(phone);
  const usersRef = collection(db, "USERS");
  const byPhoneQuery = query(usersRef, where("phone", "==", normalizedPhone), limit(1));
  const byPhoneSnap = await getDocs(byPhoneQuery);

  if (byPhoneSnap.empty) {
    return null;
  }

  return byPhoneSnap.docs[0].data() as UserProfile;
}
