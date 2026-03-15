export default function Footer() {
	return (
		<footer id="footer" className="section-pad pb-10">
			<div className="section-shell border-t border-(--border) pt-8">
				<div className="flex flex-col items-start justify-between gap-4 text-sm text-(--muted) sm:flex-row sm:items-center">
					<p>© {new Date().getFullYear()} ASK BUILDEASE. Crafted for modern marketplace brands.</p>
					<a
						id="contact"
						href="mailto:hello@askbuildease.com"
						className="font-medium tracking-[0.08em] text-(--foreground-strong) transition hover:text-(--accent)"
					>
						hello@askbuildease.com
					</a>
				</div>
			</div>
		</footer>
	);
}
