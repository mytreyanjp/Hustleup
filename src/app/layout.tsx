
"use client"; 

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from "@/components/ui/toaster"
import { FirebaseProvider, useFirebase } from '@/context/firebase-context'; 
import Navbar from '@/components/layout/navbar';
import FooterNav from '@/components/layout/footer-nav';
import { Loader2 } from 'lucide-react';
import React from 'react';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});


function AppBody({ children }: { children: React.ReactNode }) {
  const { role, loading: firebaseContextLoading, firebaseActuallyInitialized, initializationError } = useFirebase(); 
  const [isClientHydrated, setIsClientHydrated] = React.useState(false);

  React.useEffect(() => {
    setIsClientHydrated(true);
  }, []);

  let roleThemeClass = '';
  if (role === 'client') {
    roleThemeClass = 'theme-client';
  } else if (role === 'student') {
    roleThemeClass = 'theme-student';
  }

  // Wait for client hydration and Firebase context to be definitively loaded or errored
  if (!isClientHydrated || firebaseContextLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-[999]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!firebaseActuallyInitialized && initializationError) {
     const isEnvVarError = initializationError.includes("NEXT_PUBLIC_FIREBASE_");
     const isCoreServiceError = initializationError.includes("Core Firebase services") && !isEnvVarError;
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background/90 z-[999] p-4">
        <div className="text-center text-destructive-foreground bg-destructive p-6 rounded-lg shadow-lg max-w-lg">
          <h2 className="text-xl font-semibold mb-2">Firebase Configuration Error!</h2>
          <p className="text-sm whitespace-pre-wrap mb-3">{initializationError}</p>
          {isEnvVarError && (
            <div className="text-left text-xs mt-4 bg-destructive-foreground/10 p-3 rounded-md text-destructive-foreground/80">
              <p className="font-bold mb-1 text-destructive-foreground">CRITICAL: To fix missing environment variables:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li><strong><code>.env.local</code> File Location:</strong> Ensure this file is in the <strong>root directory</strong> of your project (same folder as <code>package.json</code>).</li>
                <li><strong>Variable Naming:</strong> All Firebase variables in <code>.env.local</code> <strong>MUST</strong> start with <code>NEXT_PUBLIC_</code>.</li>
                <li><strong>Correct Values:</strong> Verify API keys and identifiers match your Firebase project settings.</li>
                <li><strong>SERVER RESTART:</strong> After changes to <code>.env.local</code>, you <strong>MUST COMPLETELY STOP AND RESTART</strong> your Next.js development server (<code>npm run dev</code>).</li>
              </ol>
            </div>
          )}
           {isCoreServiceError && (
             <div className="text-left text-xs mt-4 bg-destructive-foreground/10 p-3 rounded-md text-destructive-foreground/80">
               <p className="font-bold mb-1 text-destructive-foreground">Action Required - Please double-check:</p>
               <ol className="list-decimal list-inside space-y-1">
                 <li><strong>Firebase Project Settings:</strong> Verify API key, Auth Domain, Project ID, etc., in your <code>.env.local</code> file match your Firebase project console.</li>
                 <li><strong>Firebase Services Enabled:</strong> Ensure Authentication, Firestore Database, and Storage are enabled in your Firebase project.</li>
                 <li><strong>Network Connectivity:</strong> Check your internet connection.</li>
                 <li><strong><code>storageBucket</code> URL:</strong> Ensure the `storageBucket` in <code>.env.local</code> is correct (e.g., `your-project-id.appspot.com` vs `your-project-id.firebasestorage.app`).</li>
               </ol>
             </div>
           )}
        </div>
      </div>
    );
  }


  // If we've reached here, Firebase is initialized and context is no longer loading.
  // It's now safe to render the main layout.
  return (
    <div className={cn("relative flex min-h-screen flex-col", roleThemeClass)}>
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8 md:pb-8 pb-20">
        {children}
      </main>
      <FooterNav />
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
