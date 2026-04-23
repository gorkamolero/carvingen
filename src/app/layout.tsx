import type { Metadata } from "next";
import { Archivo_Black, JetBrains_Mono } from "next/font/google";

import { Providers } from "@/app/providers";
import { getServerEnv } from "@/lib/env";
import "./globals.css";

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  subsets: ["latin"],
  weight: "400",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
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
      className={`${archivoBlack.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body data-public-url={env.PUBLIC_URL} className="min-h-full bg-[#fafaf5] font-sans text-black">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
