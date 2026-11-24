import type { Metadata } from "next";
import "../frontend/styles/globals.css";
import "../frontend/styles/v3.css";
import "../frontend/styles/x1.css";
import "../frontend/components/workspace/globe-visual.css";
import "../frontend/components/workspace/motion.css";
import "../frontend/features/community/social.css";
import "../frontend/features/global/data.css";
import "../frontend/features/strategy/research.css";
import "../frontend/styles/x2.css";
import "../frontend/features/account/account.css";
import "../frontend/styles/x51.css";
import "../frontend/features/strategy/scanner-x54.css";
import "../frontend/features/community/profile.css";
import "../frontend/features/community/messenger/messenger.css";
import "../frontend/styles/ss-v3.css";
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
