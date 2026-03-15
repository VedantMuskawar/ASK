'use client';

import { motion, useReducedMotion } from 'framer-motion';

const featureList = [
  {
    title: 'Performance-First Frontend',
    description:
      'Server-side rendering and incremental regeneration keep pages snappy while preserving rich product storytelling.',
  },
  {
    title: 'Cohesive Tailwind System',
    description:
      'Purpose-built utility patterns deliver a consistent design language without bloated style sheets or fragile overrides.',
  },
  {
    title: 'Cinematic Motion Layer',
    description:
      'Framer Motion adds graceful reveals and interactions that feel premium without overwhelming the shopping journey.',
  },
];

export default function Features() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section id="features" className="section-pad">
      <div className="section-shell">
          <p className="text-xs font-semibold tracking-[0.2em] text-(--soft-text)">FEATURES</p>
        <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Engineered for velocity and crafted for trust.
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {featureList.map((feature, index) => (
            <motion.article
              key={feature.title}
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: 18 }}
              whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.28 }}
              transition={
                prefersReducedMotion ? undefined : { duration: 0.5, delay: 0.1 + index * 0.1, ease: 'easeOut' }
              }
                className="glass-card glass-card-soft rounded-2xl p-6"
            >
              <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-(--muted)">{feature.description}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
