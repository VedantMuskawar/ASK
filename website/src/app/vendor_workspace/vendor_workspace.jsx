"use client";

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import Header from '@/components/Header';
import CustomersSection from '@/components/CustomersSection';
import OrdersSection from '@/components/OrdersSection';
import ProductsSection from '@/app/admin_workspace/ProductsSection';
import { useAuth } from '@/lib/auth-context';
import { hasCompletedMarketplaceAgreement, subscribeVendors } from '@/lib/firestore-vendors';

function normalizePhoneDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function phonesMatch(left, right) {
  const leftDigits = normalizePhoneDigits(left);
  const rightDigits = normalizePhoneDigits(right);

  if (!leftDigits || !rightDigits) {
    return false;
  }

  return (
    leftDigits === rightDigits
    || leftDigits.endsWith(rightDigits)
    || rightDigits.endsWith(leftDigits)
  );
}

function PlaceholderSection({ title }) {
  return (
    <section className="glass-card-strong rounded-3xl p-6 sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight text-(--foreground-strong)">{title}</h2>
      <p className="mt-3 text-sm text-(--muted)">
        This section is ready for vendor workflows.
      </p>
    </section>
  );
}

export default function VendorWorkspace() {
  const router = useRouter();
  const { isVendor, isAuthReady, phoneNumber } = useAuth();
  const [selectedSection, setSelectedSection] = useState('workspace');
  const [linkedVendorID, setLinkedVendorID] = useState('');
  const [isVendorLookupLoading, setIsVendorLookupLoading] = useState(true);
  const [vendorLookupError, setVendorLookupError] = useState('');
  const [hasMarketplaceAgreement, setHasMarketplaceAgreement] = useState(false);
  const [marketplaceAgreement, setMarketplaceAgreement] = useState(null);

  const handleVendorSectionChange = useCallback((section) => {
    setSelectedSection(section);
  }, []);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!isVendor) {
      router.replace('/');
    }
  }, [isAuthReady, isVendor, router]);

  useEffect(() => {
    const syncSelectedSection = () => {
      const nextHash = window.location.hash.replace('#', '').trim();
      setSelectedSection(nextHash || 'workspace');
    };

    syncSelectedSection();
    window.addEventListener('hashchange', syncSelectedSection);

    return () => {
      window.removeEventListener('hashchange', syncSelectedSection);
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady || !isVendor) {
      setIsVendorLookupLoading(false);
      setLinkedVendorID('');
      setVendorLookupError('');
      setHasMarketplaceAgreement(false);
      setMarketplaceAgreement(null);
      return;
    }

    if (!phoneNumber) {
      setIsVendorLookupLoading(false);
      setLinkedVendorID('');
      setVendorLookupError('Your account is missing a phone number.');
      setHasMarketplaceAgreement(false);
      setMarketplaceAgreement(null);
      return;
    }

    setIsVendorLookupLoading(true);
    setVendorLookupError('');

    const unsubscribe = subscribeVendors(
      (vendors) => {
        const linkedVendor = vendors.find((vendor) => phonesMatch(vendor.vendorPhoneNumber, phoneNumber));
        setLinkedVendorID(linkedVendor?.vendorID ?? '');
        setHasMarketplaceAgreement(hasCompletedMarketplaceAgreement(linkedVendor));
        setMarketplaceAgreement(linkedVendor?.documents?.marketplaceAgreement ?? null);
        setVendorLookupError(linkedVendor ? '' : 'No vendor profile is linked to this account yet.');
        setIsVendorLookupLoading(false);
      },
      () => {
        setLinkedVendorID('');
        setHasMarketplaceAgreement(false);
        setMarketplaceAgreement(null);
        setVendorLookupError('Could not load vendor profile. Please try again.');
        setIsVendorLookupLoading(false);
      },
    );

    return unsubscribe;
  }, [isAuthReady, isVendor, phoneNumber]);

  if (!isAuthReady) {
    return (
      <main className="min-h-screen">
        <div className="section-shell pt-28 pb-16">
          <section className="glass-card-strong rounded-3xl p-6 sm:p-8">
            <p className="text-sm text-(--muted)">Checking access...</p>
          </section>
        </div>
      </main>
    );
  }

  if (!isVendor) {
    return (
      <main className="min-h-screen">
        <div className="section-shell pt-28 pb-16">
          <section className="glass-card-strong rounded-3xl p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-(--foreground-strong)">Access denied</h1>
            <p className="mt-3 text-sm text-(--muted)">
              Vendor Workspace is available only to users with role vendor.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Header
        variant="vendor-workspace"
        onVendorSectionChange={handleVendorSectionChange}
        vendorID={linkedVendorID}
        hasMarketplaceAgreement={hasMarketplaceAgreement}
        marketplaceAgreement={marketplaceAgreement}
      />

      <div className="section-shell pt-28 pb-16 space-y-6">
        {selectedSection === 'headers' ? (
          <PlaceholderSection title="Vendor Headers" />
        ) : selectedSection === 'products' ? (
          isVendorLookupLoading ? (
            <PlaceholderSection title="Loading Vendor Products" />
          ) : linkedVendorID ? (
            <ProductsSection
              scopedVendorID={linkedVendorID}
              canCreateProduct={hasMarketplaceAgreement}
              createDisabledReason="Complete Marketplace Agreement from Profile menu to add products."
            />
          ) : (
            <section className="glass-card-strong rounded-3xl p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-(--foreground-strong)">Vendor Products</h2>
              <p className="mt-3 text-sm text-rose-600">{vendorLookupError || 'No linked vendor profile found.'}</p>
            </section>
          )
        ) : selectedSection === 'orders' ? (
          isVendorLookupLoading ? (
            <PlaceholderSection title="Loading Vendor Orders" />
          ) : linkedVendorID ? (
            <OrdersSection
              title="Vendor Orders"
              viewer="vendor"
              vendorID={linkedVendorID}
              showMonthFilter
              canEditStatus
              emptyMessage="No vendor orders found for the selected month."
            />
          ) : (
            <section className="glass-card-strong rounded-3xl p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-(--foreground-strong)">Vendor Orders</h2>
              <p className="mt-3 text-sm text-rose-600">{vendorLookupError || 'No linked vendor profile found.'}</p>
            </section>
          )
        ) : selectedSection === 'sales' ? (
          <PlaceholderSection title="Vendor Sales" />
        ) : selectedSection === 'customers' ? (
          isVendorLookupLoading ? (
            <PlaceholderSection title="Loading Vendor Customers" />
          ) : linkedVendorID ? (
            <CustomersSection
              viewer="vendor"
              vendorID={linkedVendorID}
              title="Vendor Customers"
              emptyMessage="No customers found for orders placed to this vendor."
            />
          ) : (
            <section className="glass-card-strong rounded-3xl p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-(--foreground-strong)">Vendor Customers</h2>
              <p className="mt-3 text-sm text-rose-600">{vendorLookupError || 'No linked vendor profile found.'}</p>
            </section>
          )
        ) : (
          <section className="glass-card-strong rounded-3xl p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-(--foreground-strong)">VENDOR WORKSPACE</h1>
            <p className="mt-3 text-sm text-(--muted)">
              Select a module from the header to open its vendor section.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
