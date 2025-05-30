
"use client"; 

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from "@/components/ui/toaster"
import { FirebaseProvider, useFirebase } from '@/context/firebase-context'; 
import Navbar from '@/components/layout/navbar';
import FooterNav from '@/components/layout/footer-nav'; // Import FooterNav

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});


function AppBody({ children }: { children: React.ReactNode }) {
  const { role } = useFirebase(); 

  let roleThemeClass = '';
  if (role === 'client') {
    roleThemeClass = 'theme-client';
  } else if (role === 'student') {
    roleThemeClass = 'theme-student';
  }

  return (
    <div className={cn("relative flex min-h-screen flex-col", roleThemeClass)}>
      <Navbar />
      {/* Add bottom padding on mobile to account for the fixed footer */}
      <main className="flex-1 container mx-auto px-4 py-8 md:pb-8 pb-20"> {/* pb-20 for footer space on mobile */}
        {children}
      </main>
      <FooterNav /> {/* Render FooterNav */}
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          inter.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <FirebaseProvider>
            <AppBody>{children}</AppBody> 
            <Toaster />
          </FirebaseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
