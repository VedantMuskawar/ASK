'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Mail, MapPin, Phone } from 'lucide-react';

const FOUNDING_TEAM = [
  {
    name: 'Krushna Gadewar',
    phone: '+91-9284189527',
    email: 'p24700142@student.nicmar.ac.in',
  },
  {
    name: 'Sanskar Baheti',
    phone: '+91-9561797580',
    email: 'p24700151@student.nicmar.ac.in',
  },
  {
    name: 'Abhay Malpani',
    phone: '+91-9011693804',
    email: 'p24700171@student.nicmar.ac.in',
  },
];

export default function AboutSection() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section id="about" className="section-pad relative overflow-hidden bg-transparent py-16 sm:py-24 lg:py-32">
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={prefersReducedMotion ? undefined : { duration: 0.65, ease: 'easeOut' }}
        className="relative left-1/2 w-[90%] max-w-none -translate-x-1/2 rounded-4xl bg-transparent px-5 py-6 sm:px-8 sm:py-8 lg:px-10"
      >
        <div className="flex flex-col gap-12">
          {/* Main About Section */}
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-(--foreground-strong) sm:text-3xl lg:text-4xl">
              Making Construction Seamless
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-(--muted) sm:text-base">
              <p>
                India&apos;s construction industry is rapidly growing but remains heavily fragmented, relying on manual
                operations, offline negotiations, and informal vendor networks. ASK BuildEase bridges this gap through
                a single, integrated digital marketplace connecting material suppliers, contractors, and builders.
              </p>
              <p>
                Unlike large aggregators focused on enterprise projects, we specifically empower the small and
                mid-scale contractors who make up nearly 65% of India&apos;s procurement market. Founded by Krushna
                Gadewar, Sanskar Baheti, and Abhay Malpani, our mission is to deliver real-time pricing, verified
                vendor listings, and seamless logistics—driving transparency and efficiency across the entire supply
                chain.
              </p>
            </div>
          </div>

          {/* Let's Build Together Section */}
          <div className="flex flex-col gap-8 border-t border-gray-700 pt-8">
            <h3 className="text-xl font-semibold leading-tight tracking-[-0.02em] text-(--foreground-strong) sm:text-2xl">
              Let&apos;s Build Together
            </h3>
            <p className="text-sm leading-relaxed text-(--muted) sm:text-base">
              Whether you are a contractor looking to streamline your material sourcing or a supplier ready to expand
              your digital reach, the ASK BuildEase team is ready to assist you.
            </p>

            {/* Headquarters */}
            <div className="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-900/40 p-4">
              <h4 className="font-semibold text-(--foreground-strong)">Reach Out Directly</h4>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-(--muted)" />
                <div className="flex flex-col">
                  <p className="font-medium text-(--foreground-strong)">Headquarters</p>
                  <p className="text-(--muted)">NICMAR University, Pune, Maharashtra</p>
                </div>
              </div>
            </div>

            {/* Founding Team Contacts */}
            <div className="flex flex-col gap-3">
              <h4 className="font-semibold text-(--foreground-strong)">Founding Team Contacts</h4>
              <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
                {FOUNDING_TEAM.map((member) => (
                  <div
                    key={member.name}
                    className="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-900/40 p-4"
                  >
                    <p className="font-medium text-(--foreground-strong)">{member.name}</p>
                    <div className="flex flex-col gap-2">
                      <a
                        href={`tel:${member.phone.replace(/\s/g, '')}`}
                        className="flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground-strong) transition-colors"
                      >
                        <Phone className="h-4 w-4" />
                        {member.phone}
                      </a>
                      <a
                        href={`mailto:${member.email}`}
                        className="flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground-strong) transition-colors"
                      >
                        <Mail className="h-4 w-4" />
                        {member.email}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
