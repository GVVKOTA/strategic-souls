import type { Metadata, Viewport } from "next";
import "../frontend/styles/globals.css";
import "../frontend/styles/x1.css";
import "../frontend/components/workspace/motion.css";
import "../frontend/styles/x2.css";
import "../frontend/features/account/account.css";
import "../frontend/styles/x51.css";
import "../frontend/styles/ss-v3.css";
export const viewport: Viewport = {
  themeColor: "#070809",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "Strategic Souls · Market intelligence that remembers",
  description:
    "Strategic Souls X 3.0 — A private educational intelligence workspace by Global Vertex Vectors.",
  applicationName: "Strategic Souls",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Strategic Souls",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/inter-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/space-grotesk-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
