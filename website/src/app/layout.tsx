import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import FirebaseAnalytics from "@/components/FirebaseAnalytics";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ASK BUILDEASE",
  description:
    "ASK BUILDEASE crafts premium marketplace landing experiences with Next.js, Tailwind CSS, and Framer Motion.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${playfairDisplay.variable} ${manrope.variable} antialiased`}>
        <FirebaseAnalytics />
        {children}
      </body>
    </html>
  );
}
