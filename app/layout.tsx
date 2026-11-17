import type { Metadata } from "next";
import "./globals.css";
import "./v3.css";
import "./x1.css";
import "../components/x1/globe-visual.css";
import "../components/x1/motion.css";
import "../community/social.css";
import "../global/data.css";
import "../strategy/research.css";
import "./x2.css";
export const metadata: Metadata = {
  title: "Strategic Souls · Market intelligence that remembers",
  description:
    "A private educational intelligence workspace by Global Vertex Vectors.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon-x1.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(sessionStorage.getItem('ss-x1-intro-seen')!==null||window.matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.dataset.x1IntroSeen='true'}catch{}",
          }}
        />
        <link
          rel="preload"
          href="/fonts/inter-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/space-grotesk-500.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
