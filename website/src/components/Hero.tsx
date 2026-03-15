'use client';

import { motion, useReducedMotion } from 'framer-motion';

export default function Hero() {
	const prefersReducedMotion = useReducedMotion();

	return (
		<section id="top" className="section-pad relative overflow-hidden pt-32 sm:pt-40">
			<div aria-hidden className="pointer-events-none absolute inset-0">
				<div className="absolute left-[10%] top-8 h-64 w-64 rounded-full bg-[rgb(143,79,67,0.16)] blur-3xl" />
				<div className="absolute bottom-0 right-[8%] h-80 w-80 rounded-full bg-[rgb(111,87,81,0.14)] blur-3xl" />
			</div>
			<div className="section-shell relative">
				<motion.div
					initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
					animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
					transition={prefersReducedMotion ? undefined : { duration: 0.75, ease: 'easeOut' }}
					className="glass-card glass-card-strong rounded-4xl px-6 py-8 sm:px-10 sm:py-12 lg:px-14 lg:py-14"
				>
					<div aria-hidden className="absolute inset-x-6 top-0 h-px bg-(--border)" />
					<div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-end">
						<div>
							<motion.p
								initial={prefersReducedMotion ? undefined : { opacity: 0, y: 12 }}
								animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
								transition={prefersReducedMotion ? undefined : { duration: 0.5, delay: 0.08 }}
								className="mb-5 text-xs font-semibold tracking-[0.22em] text-(--soft-text)"
							>
								MONOCHROME DIGITAL COMMERCE
							</motion.p>
							<motion.h1
								initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
								animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
								transition={prefersReducedMotion ? undefined : { duration: 0.75, delay: 0.14, ease: 'easeOut' }}
								className="max-w-3xl text-balance text-4xl font-semibold leading-[0.95] tracking-[-0.03em] text-(--foreground-strong) sm:text-5xl lg:text-[4.5rem]"
							>
								A sharper landing experience, stripped to light, shadow, and motion.
							</motion.h1>
							<motion.p
								initial={prefersReducedMotion ? undefined : { opacity: 0, y: 20 }}
								animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
								transition={prefersReducedMotion ? undefined : { duration: 0.65, delay: 0.24, ease: 'easeOut' }}
								className="mt-6 max-w-2xl text-base leading-relaxed text-(--muted) sm:text-lg"
							>
								ASK BUILDEASE now opens with a restrained glassmorphic frame, dense film-grain texture, and a strictly monochrome interface that keeps focus on hierarchy, motion, and clarity.
							</motion.p>
							<motion.div
								initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
								animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
								transition={prefersReducedMotion ? undefined : { duration: 0.6, delay: 0.34, ease: 'easeOut' }}
								className="mt-10 flex flex-wrap items-center gap-4"
							>
								<motion.a
									href="#contact"
									whileHover={prefersReducedMotion ? undefined : { y: -1, scale: 1.015 }}
									whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
									className="rounded-full border border-(--border) bg-(--accent) px-6 py-3 text-sm font-semibold tracking-[0.14em] text-(--accent-contrast) shadow-[0_0_0_1px_rgba(68,39,34,0.14)]"
								>
									START THE BUILD
								</motion.a>
								<a
									href="#features"
									className="rounded-full border border-(--border) bg-(--surface) px-6 py-3 text-sm font-medium tracking-[0.18em] text-(--foreground) transition hover:border-(--accent) hover:bg-(--surface-soft) hover:text-(--foreground)"
								>
									VIEW SYSTEM
								</a>
							</motion.div>
						</div>

						<motion.div
							initial={prefersReducedMotion ? undefined : { opacity: 0, x: 18 }}
							animate={prefersReducedMotion ? undefined : { opacity: 1, x: 0 }}
							transition={prefersReducedMotion ? undefined : { duration: 0.65, delay: 0.22, ease: 'easeOut' }}
							className="rounded-[1.75rem] border border-(--border) bg-(--surface-soft) p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
						>
							<p className="text-[0.7rem] font-semibold tracking-[0.24em] text-(--soft-text)">LIVE COMPOSITION</p>
							<div className="mt-6 space-y-4">
								{[
									['Visual tone', 'Strict grayscale palette with zero accent-color drift'],
									['Material', 'Blurred glass panel with a low-opacity white fill'],
									['Texture', 'High-frequency noise overlay tuned to 3% opacity'],
								].map(([label, value]) => (
									<div key={label} className="rounded-2xl border border-(--border) bg-(--surface) p-4">
										<p className="text-xs uppercase tracking-[0.18em] text-(--soft-text)">{label}</p>
										<p className="mt-2 text-sm leading-relaxed text-(--foreground)">{value}</p>
									</div>
								))}
							</div>
						</motion.div>
					</div>
				</motion.div>
			</div>
		</section>
	);
}
