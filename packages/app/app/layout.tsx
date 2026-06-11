import type { Metadata } from "next";
import "./globals.css";
import { PersonaNav } from "./nav";

export const metadata: Metadata = {
  title: "Confidential Token Demo · Stellar",
  description: "Confidential token on Stellar with on-chain UltraHonk proofs (testnet).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-mono">
        <PersonaNav />
        {children}
      </body>
    </html>
  );
}
