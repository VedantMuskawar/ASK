"use client";

import { useCallback, useEffect, useState } from 'react';

import Header from '@/components/Header';
import ProductsSection from './ProductsSection';
import VendorsSection from './VendorsSection';

export default function AdminWorkspace() {
  const [selectedSection, setSelectedSection] = useState('workspace');
  const handleAdminSectionChange = useCallback((section) => {
    setSelectedSection(section);
  }, []);

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

  return (
    <main className="min-h-screen">
      <Header variant="admin-workspace" onAdminSectionChange={handleAdminSectionChange} />

      <div className="section-shell pt-28 pb-16">
        {selectedSection === 'products' ? (
          <ProductsSection />
        ) : selectedSection === 'vendors' ? (
          <VendorsSection />
        ) : (
          <section className="glass-card-strong rounded-3xl p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-(--foreground-strong)">ADMIN WORKSPACE</h1>
            <p className="mt-3 text-sm text-(--muted)">
              Select a module from the header to open its admin section.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
