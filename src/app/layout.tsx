import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/layout/Providers';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

// Each HTML response carries a fresh script nonce; never reuse prerendered
// HTML with a policy generated for a different request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FileTrust Explorer',
  description: 'Real-time blockchain explorer for the FileTrust decentralized storage network',
  icons: {
    icon: '/filetrust-logo.jpg',
    apple: '/filetrust-logo.jpg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="bg-bg-base text-[#e2e8f0] min-h-screen">
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <Header />
              <main className="flex-1 p-6 page-fade">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
