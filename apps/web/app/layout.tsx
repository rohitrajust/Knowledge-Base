import type { Metadata } from "next";
import { Geist_Mono, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { AmbientBackground } from "@/components/AmbientBackground";

// UST brand typography: Source Sans 3 (body/UI) + Source Serif 4 (headings) are
// the approved Google Font substitutes for the brand's licensed Aptos family
// (see USTskills/skills/ust-brand-html/brand-tokens.md).
const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

// No UST source specifies a monospace face; Geist Mono is kept for incidental
// code/ID display, which isn't brand-governed UI text.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mnemo",
  description: "AI-native knowledge base for engineering teams",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sourceSans.variable} ${sourceSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AmbientBackground />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
