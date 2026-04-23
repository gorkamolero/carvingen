import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";

import { Providers } from "@/app/providers";
import { getServerEnv } from "@/lib/env";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Carvingen",
  description: "A branching carving concept canvas for image and mesh generation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const env = getServerEnv();

  return (
    <html
      lang="en"
      className={`${archivo.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body data-public-url={env.PUBLIC_URL} className="min-h-full bg-[#f4efdf] font-sans text-[15px] font-medium text-black">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
