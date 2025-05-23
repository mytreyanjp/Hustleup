"use client"; // Make RootLayout a client component

import type { Metadata } from 'next'; // Metadata can still be exported from client component
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from "@/components/ui/toaster"
import { FirebaseProvider, useFirebase } from '@/context/firebase-context'; // Import useFirebase
import Navbar from '@/components/layout/navbar';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

// Removed static metadata export as it's not allowed in client components.
// If metadata is needed, it should be handled differently, e.g.
// in a parent server component or via dynamic metadata generation if applicable.

function AppBody({ children }: { children: React.ReactNode }) {
  const { role } = useFirebase(); // Get role here

  let roleThemeClass = '';
  if (role === 'client') {
    roleThemeClass = 'theme-client';
  } else if (role === 'student') {
    roleThemeClass = 'theme-student';
  }

  return (
    <div className={cn("relative flex min-h-screen flex-col", roleThemeClass)}>
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
      {/* Add Footer later if needed */}
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
            <AppBody>{children}</AppBody> {/* Use AppBody to access context */}
            <Toaster />
          </FirebaseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
