import Header from "@/components/Header";

export default function AdminWorkspace() {
  return (
    <main className="min-h-screen">
      <Header variant="admin-workspace" />

      <div className="section-shell pt-28 pb-16">
        <section className="glass-card-strong rounded-3xl p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-(--foreground-strong)">ADMIN WORKSPACE</h1>
          <p className="mt-3 text-sm text-(--muted)">
            Admin tools and workflows will be implemented here.
          </p>
        </section>
      </div>
    </main>
  );
}
