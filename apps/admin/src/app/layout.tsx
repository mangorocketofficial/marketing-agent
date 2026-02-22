import type { Metadata } from 'next';
import { Space_Grotesk, Noto_Sans_KR } from 'next/font/google';
import './globals.css';

const heading = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-heading',
});

const body = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Marketing Admin',
  description: 'AI agent operations and channel analytics dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${heading.variable} ${body.variable}`}>
        <div className="app-shell">
          <header className="topbar">
            <p className="eyebrow">Marketing Control Room</p>
            <h1>NGO Admin Dashboard</h1>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
