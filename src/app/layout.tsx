import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FitLog",
    template: "%s · FitLog",
  },
  description: "Private body-composition, workout, PT calendar and diet tracker for our household.",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "FitLog",
    // Deliberately NOT black-translucent. That is the style that would let the
    // paper run under the status bar, but iOS then draws the clock in WHITE —
    // invisible on #f5f4f0, and this design system has no dark surface to put
    // behind it. `default` keeps the clock legible.
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f4f0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // No dark mode exists (DESIGN.md). This stops Android force-dark repainting
  // the paper tone and inverting form controls.
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-paper text-stone-800">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
