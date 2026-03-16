import {
  collection,
  deleteDoc,
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

export type UserRole = "customer" | "admin" | "vendor";

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

export interface CustomerPlatformAgreement {
  isCompleted: boolean;
  panNumber: string;
  gstNumber: string;
  projectDetails: string;
  jurisdiction: string;
  confirmations: {
    customerVerification: boolean;
    platformRole: boolean;
    ordersAndPayments: boolean;
    inspectionAndComplaints: boolean;
    limitationOfLiability: boolean;
    governingLaw: boolean;
    finalConsent: boolean;
  };
  acceptedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CustomerPlatformAgreementInput {
  panNumber: string;
  gstNumber: string;
  projectDetails: string;
  jurisdiction: string;
  confirmations: {
    customerVerification: boolean;
    platformRole: boolean;
    ordersAndPayments: boolean;
    inspectionAndComplaints: boolean;
    limitationOfLiability: boolean;
    governingLaw: boolean;
    finalConsent: boolean;
  };
}

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "");
}

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function phonesMatch(left: string, right: string): boolean {
  const leftDigits = normalizePhoneDigits(left);
  const rightDigits = normalizePhoneDigits(right);

  if (!leftDigits || !rightDigits) {
    return false;
  }

  return (
    leftDigits === rightDigits ||
    leftDigits.endsWith(rightDigits) ||
    rightDigits.endsWith(leftDigits)
  );
}

interface UserProfileWithId {
  id: string;
  profile: UserProfile;
}

async function findUserProfileByPhone(phone: string): Promise<UserProfileWithId | null> {
  const normalizedPhone = normalizePhone(phone);
  const usersRef = collection(db, "USERS");
  const byPhoneQuery = query(usersRef, where("phone", "==", normalizedPhone), limit(1));
  const byPhoneSnap = await getDocs(byPhoneQuery);

  if (!byPhoneSnap.empty) {
    const userDoc = byPhoneSnap.docs[0];
    return {
      id: userDoc.id,
      profile: userDoc.data() as UserProfile,
    };
  }

  const allUsersSnap = await getDocs(usersRef);
  const matchedUser = allUsersSnap.docs.find((item) => {
    const data = item.data() as Partial<UserProfile>;
    return phonesMatch(String(data.phone ?? ""), normalizedPhone);
  });

  if (!matchedUser) {
    return null;
  }

  return {
    id: matchedUser.id,
    profile: matchedUser.data() as UserProfile,
  };
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

function normalizeCustomerPlatformAgreement(
  value: Partial<CustomerPlatformAgreement> | undefined,
): CustomerPlatformAgreement | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const confirmations = value.confirmations && typeof value.confirmations === 'object'
    ? value.confirmations
    : {};

  return {
    isCompleted: Boolean(value.isCompleted),
    panNumber: String(value.panNumber ?? ''),
    gstNumber: String(value.gstNumber ?? ''),
    projectDetails: String(value.projectDetails ?? ''),
    jurisdiction: String(value.jurisdiction ?? ''),
    confirmations: {
      customerVerification: Boolean(confirmations.customerVerification),
      platformRole: Boolean(confirmations.platformRole),
      ordersAndPayments: Boolean(confirmations.ordersAndPayments),
      inspectionAndComplaints: Boolean(confirmations.inspectionAndComplaints),
      limitationOfLiability: Boolean(confirmations.limitationOfLiability),
      governingLaw: Boolean(confirmations.governingLaw),
      finalConsent: Boolean(confirmations.finalConsent),
    },
    acceptedAt: (value.acceptedAt as Timestamp | null) ?? null,
    updatedAt: (value.updatedAt as Timestamp | null) ?? null,
  };
}

export async function getCustomerPlatformAgreement(uid: string): Promise<CustomerPlatformAgreement | null> {
  const userRef = doc(db, 'USERS', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    return null;
  }

  const data = snap.data() as {
    documents?: {
      customerPlatformAgreement?: Partial<CustomerPlatformAgreement>;
    };
  };

  return normalizeCustomerPlatformAgreement(data?.documents?.customerPlatformAgreement);
}

export async function saveCustomerPlatformAgreement(
  uid: string,
  input: CustomerPlatformAgreementInput,
): Promise<void> {
  const userRef = doc(db, 'USERS', uid);

  await setDoc(
    userRef,
    {
      documents: {
        customerPlatformAgreement: {
          ...input,
          isCompleted: true,
          acceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getUserProfileByPhone(phone: string): Promise<UserProfile | null> {
  const match = await findUserProfileByPhone(phone);
  return match?.profile ?? null;
}

export async function upsertVendorUserProfile({
  vendorID,
  vendorName,
  vendorPhoneNumber,
}: {
  vendorID: string;
  vendorName: string;
  vendorPhoneNumber: string;
}): Promise<void> {
  const normalizedPhone = normalizePhone(vendorPhoneNumber);
  const nameParts = vendorName.trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] ?? "Vendor";
  const lastName = nameParts.slice(1).join(" ");

  const existing = await findUserProfileByPhone(normalizedPhone);
  const userRef = doc(db, "USERS", existing?.id ?? `vendor_${vendorID}`);

  await setDoc(
    userRef,
    {
      firstName,
      lastName,
      phone: normalizedPhone,
      email: existing?.profile.email ?? "",
      role: "vendor" as UserRole,
      isActive: true,
      createdAt: existing?.profile.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function migrateUserProfileToUidIfNeeded({
  uid,
  phone,
}: {
  uid: string;
  phone?: string | null;
}): Promise<'already-linked' | 'migrated' | 'no-source' | 'skipped'> {
  if (!uid || !phone) {
    return 'skipped';
  }

  const targetProfile = await getUserProfile(uid);
  if (targetProfile) {
    return 'already-linked';
  }

  const source = await findUserProfileByPhone(phone);
  if (!source) {
    return 'no-source';
  }

  if (source.id === uid) {
    return 'already-linked';
  }

  const normalizedPhone = normalizePhone(phone);
  const targetRef = doc(db, 'USERS', uid);

  await setDoc(
    targetRef,
    {
      ...source.profile,
      phone: normalizedPhone,
      createdAt: source.profile.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (/^vendor_/i.test(source.id)) {
    await deleteDoc(doc(db, 'USERS', source.id));
  }

  return 'migrated';
}
