'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDownWideNarrow, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

const CATEGORY_OPTIONS = [
  'All Categories',
  'Construction Materials',
  'Electrical & Plumbing',
  'Finishing Materials',
];

const SORT_OPTIONS = [
  'Recommended',
  'Price: Low to High',
  'Price: High to Low',
  'Newest Arrivals',
];

const QUICK_TAGS = ['Cement', 'Tiles', 'Pipes', 'Switches'];

export default function HomeSection() {
  const prefersReducedMotion = useReducedMotion();
  const [searchValue, setSearchValue] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(CATEGORY_OPTIONS[0]);
  const [selectedSort, setSelectedSort] = useState(SORT_OPTIONS[0]);

  return (
    <section id="top" className="section-pad relative overflow-hidden pt-32 sm:pt-40">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-16 h-56 w-56 rounded-full bg-[rgb(143,79,67,0.16)] blur-3xl" />
        <div className="absolute right-[6%] top-10 h-72 w-72 rounded-full bg-[rgb(111,87,81,0.14)] blur-3xl" />
      </div>

      <div className="relative left-1/2 w-[90%] max-w-none -translate-x-1/2 px-5 sm:px-8 lg:px-10">
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? undefined : { duration: 0.65, ease: 'easeOut' }}
          className="glass-card glass-card-strong rounded-4xl px-5 py-6 sm:px-8 sm:py-8 lg:px-10"
        >
          <div className="flex flex-col gap-6">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold tracking-[0.24em] text-(--soft-text)">SOURCE FASTER</p>
              <h1 className="mt-4 max-w-3xl text-balance text-4xl font-semibold leading-[0.95] tracking-[-0.03em] text-(--foreground-strong) sm:text-5xl lg:text-[4.25rem]">
                Search materials, narrow by category, and sort supply options in one pass.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-relaxed text-(--muted) sm:text-base">
                Built for fast procurement workflows with a single control row that keeps search, filtering,
                and ranking immediately accessible.
              </p>
            </div>

            <div className="glass-card-soft rounded-[1.75rem] border border-(--border) p-3 sm:p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(13rem,0.7fr)_minmax(13rem,0.7fr)]">
                <label className="group flex items-center gap-3 rounded-[1.35rem] border border-(--border) bg-white/70 px-4 py-3 transition focus-within:border-(--accent) focus-within:bg-white">
                  <Search size={18} className="text-(--soft-text) transition group-focus-within:text-(--accent)" />
                  <input
                    type="search"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Search cement, tiles, sanitaryware..."
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-(--soft-text) outline-none"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-[1.35rem] border border-(--border) bg-white/70 px-4 py-3 transition focus-within:border-(--accent) focus-within:bg-white">
                  <SlidersHorizontal size={18} className="text-(--soft-text)" />
                  <select
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                    className="w-full bg-transparent text-sm text-foreground outline-none"
                    aria-label="Filter by category"
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-[1.35rem] border border-(--border) bg-white/70 px-4 py-3 transition focus-within:border-(--accent) focus-within:bg-white">
                  <ArrowDownWideNarrow size={18} className="text-(--soft-text)" />
                  <select
                    value={selectedSort}
                    onChange={(event) => setSelectedSort(event.target.value)}
                    className="w-full bg-transparent text-sm text-foreground outline-none"
                    aria-label="Sort products"
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[0.7rem] font-semibold tracking-[0.18em] text-(--soft-text)">QUICK PICKS</span>
                {QUICK_TAGS.map((tag) => {
                  const isActive = searchValue.trim().toLowerCase() === tag.toLowerCase();

                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSearchValue(tag)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'border-(--accent) bg-(--accent) text-(--accent-contrast)'
                          : 'border-(--border) bg-(--surface) text-foreground hover:border-(--accent) hover:bg-(--surface-soft)'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}