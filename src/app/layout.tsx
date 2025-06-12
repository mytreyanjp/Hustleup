
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
import { Loader2, Ban, MessageSquare, LogOut as LogOutIcon } from 'lucide-react'; 
import React, { useRef, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { signOut } from 'firebase/auth'; 
import { auth } from '@/config/firebase'; 
import { useToast } from '@/hooks/use-toast'; 


const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});


function AppBody({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading: firebaseContextLoading, firebaseActuallyInitialized, initializationError, role } = useFirebase(); 
  const [isClientHydrated, setIsClientHydrated] = React.useState(false);
  const { toast } = useToast(); 

  const router = useRouter(); 
  const pathname = usePathname(); 
  const isMobile = useIsMobile(); 

  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const touchCurrentXRef = useRef<number>(0);
  const touchCurrentYRef = useRef<number>(0);
  const isIntentionalHorizontalSwipeRef = useRef<boolean>(false);
  const SWIPE_THRESHOLD = 75; 
  const INITIAL_DRAG_THRESHOLD = 10; 

  React.useEffect(() => {
    setIsClientHydrated(true);
  }, []);

  let roleThemeClass = '';
  if (role === 'student') {
    roleThemeClass = 'theme-student';
  } else if (role === 'client') {
    roleThemeClass = 'theme-client';
  }

  const orderedFooterPaths = useMemo(() => {
    const paths: string[] = [];
    if (!user || !isMobile) return []; 

    paths.push("/gigs/browse"); 
    if (role === 'student') {
      paths.push("/student/works");
      paths.push("/student/wallet");
    } else if (role === 'client') {
      // paths.push("/hustlers/browse"); // Removed based on previous request
      paths.push("/client/gigs/new");
      paths.push("/client/payments"); // Was wallet, maps to payments
    }
    paths.push("/chat");
    
    let dashboardUrl = "/";
    if (role === 'student') dashboardUrl = '/student/profile';
    else if (role === 'client') dashboardUrl = '/client/dashboard';
    paths.push(dashboardUrl);
    
    return paths;
  }, [role, user, isMobile]);


  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    touchStartXRef.current = e.targetTouches[0].clientX;
    touchStartYRef.current = e.targetTouches[0].clientY;
    touchCurrentXRef.current = e.targetTouches[0].clientX;
    touchCurrentYRef.current = e.targetTouches[0].clientY;
    isIntentionalHorizontalSwipeRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (!touchStartXRef.current || !touchStartYRef.current) return;

    touchCurrentXRef.current = e.targetTouches[0].clientX;
    touchCurrentYRef.current = e.targetTouches[0].clientY;

    if (!isIntentionalHorizontalSwipeRef.current) {
      const deltaX = touchCurrentXRef.current - touchStartXRef.current;
      const deltaY = touchCurrentYRef.current - touchStartYRef.current;

      if (Math.abs(deltaX) > INITIAL_DRAG_THRESHOLD || Math.abs(deltaY) > INITIAL_DRAG_THRESHOLD) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          isIntentionalHorizontalSwipeRef.current = true;
        } else {
          touchStartXRef.current = 0;
          touchStartYRef.current = 0;
        }
      }
    }
    
    if (isIntentionalHorizontalSwipeRef.current && e.cancelable) {
      e.preventDefault(); 
    }
  };

  const handleTouchEnd = () => {
    if (!isIntentionalHorizontalSwipeRef.current || !touchStartXRef.current) {
      touchStartXRef.current = 0; touchStartYRef.current = 0;
      isIntentionalHorizontalSwipeRef.current = false;
      return;
    }

    const deltaX = touchCurrentXRef.current - touchStartXRef.current;

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      if (orderedFooterPaths.length === 0) return;

      let currentIndex = orderedFooterPaths.findIndex(p => pathname === p);
      if (currentIndex === -1) {
          currentIndex = orderedFooterPaths.findIndex(p => pathname.startsWith(p + '/') && p !== '/');
      }
      if (currentIndex !== -1) {
          let newIndex = currentIndex;
          if (deltaX > 0) { 
            newIndex = Math.max(0, currentIndex - 1);
          } else { 
            newIndex = Math.min(orderedFooterPaths.length - 1, currentIndex + 1);
          }
    
          if (newIndex !== currentIndex && orderedFooterPaths[newIndex]) {
            router.push(orderedFooterPaths[newIndex]);
          }
      }
    }
    
    touchStartXRef.current = 0;
    touchStartYRef.current = 0;
    isIntentionalHorizontalSwipeRef.current = false;
  };

  const handleSignOut = async () => {
    try {
      if (auth) {
        await signOut(auth);
        toast({ title: "Logged Out", description: "You have been successfully logged out." });
        router.push('/'); 
      } else {
        console.error("Firebase auth not available for sign out.");
        toast({ title: "Error", description: "Could not log out at this moment.", variant: "destructive" });
      }
    } catch (error) {
      console.error('Error signing out:', error);
      toast({ title: "Sign Out Error", description: "An error occurred while logging out.", variant: "destructive" });
    }
  };

  if (!isClientHydrated || (firebaseContextLoading && !initializationError)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-[999]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!firebaseActuallyInitialized && initializationError) {
     const isEnvVarError = initializationError.includes("NEXT_PUBLIC_FIREBASE_") || initializationError.includes("environment variables");
     const isCoreServiceError = (initializationError.includes("Core Firebase services") || initializationError.includes("Auth service is unexpectedly null") || initializationError.includes("Firestore (db) service is unexpectedly null") ) && !isEnvVarError;
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
           <Button onClick={() => window.location.reload()} className="mt-4 bg-destructive-foreground text-destructive hover:bg-destructive-foreground/90">Try Reloading Page</Button>
        </div>
      </div>
    );
  }

  if (userProfile && userProfile.isBanned) {
    if (pathname === '/support') {
      return (
        <div className={cn("relative flex min-h-screen flex-col", roleThemeClass)}>
          <Navbar />
          <main 
            className="flex-1 container mx-auto px-4 py-8 md:pb-8 pb-20"
            onTouchStart={isMobile ? handleTouchStart : undefined}
            onTouchMove={isMobile ? handleTouchMove : undefined}
            onTouchEnd={isMobile ? handleTouchEnd : undefined}
          >
            {children}
          </main>
          <FooterNav />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-6">
        <Ban className="h-20 w-20 text-destructive mb-6" />
        <h1 className="text-3xl font-bold text-destructive mb-3">Account Suspended</h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-md">
          Your account has been suspended due to a violation of our community guidelines or terms of service.
        </p>
        <p className="text-md text-muted-foreground mb-8">
          If you believe this is an error or wish to appeal, please contact our support team.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
            <Button asChild size="lg">
            <Link href="/support">
                <MessageSquare className="mr-2 h-5 w-5" /> Contact Support
            </Link>
            </Button>
            <Button variant="outline" size="lg" onClick={handleSignOut}>
                <LogOutIcon className="mr-2 h-5 w-5" /> Log Out
            </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative flex min-h-screen flex-col", roleThemeClass)}>
      <Navbar />
      <main 
        className="flex-1 container mx-auto px-4 py-8 md:pb-8 pb-20"
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
      >
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

    