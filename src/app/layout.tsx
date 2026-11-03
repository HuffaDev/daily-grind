import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Inline in the HTML so it runs before first paint. next/script would re-create
// it from JavaScript instead, without the nonce Discord's proxy adds to inline
// scripts in the HTML, and a nonce-based CSP blocks that copy.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    // Dark unless the player switched to light, matching Discord's client.
    document.documentElement.classList.toggle("dark", localStorage.getItem("theme") !== "light");
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Daily Grind",
  description: "Daily puzzles and games for your Discord server, with a shared leaderboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* The proxy's nonce isn't in React's props, so hydration would report it as a mismatch. */}
        <script suppressHydrationWarning>{THEME_INIT_SCRIPT}</script>
        {children}
      </body>
    </html>
  );
}
