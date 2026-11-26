import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { JSX, ReactNode } from 'react';
import './globals.css';

// Deux familles distinctes : le navigateur bascule caractère par caractère vers le sous-ensemble
// latin étendu (ɓ ɗ ŋ ƴ du fulfulde) au lieu de tomber sur une police système.
const onest = localFont({ src: './fonts/onest-latin-wght-normal.woff2', weight: '100 900', variable: '--font-onest', display: 'swap' });
const onestExt = localFont({ src: './fonts/onest-latin-ext-wght-normal.woff2', weight: '100 900', variable: '--font-onest-ext', display: 'swap' });

export const metadata: Metadata = {
  title: 'Mboa Pay · NkapLingua',
  description: 'Banque en ligne simulée avec l’assistant NkapLingua : fulfulde, pidgin, français, anglais.',
};

export const viewport: Viewport = { themeColor: '#0f5a46', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <html lang="fr" className={`${onest.variable} ${onestExt.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
