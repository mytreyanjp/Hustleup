
"use client";

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { ArrowRight, Briefcase, GraduationCap, Loader2 } from 'lucide-react';

export default function Home() {
  const { user, role, loading: authLoading } = useFirebase();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect if auth is still loading
    if (authLoading) {
      return;
    }

    if (user) {
      if (role === 'student') {
        router.replace('/student/dashboard');
      } else if (role === 'client') {
        router.replace('/client/dashboard');
      }
      // If role is null but user exists, they might land here briefly.
      // This can happen if the profile fetch is slightly delayed after auth.
      // The dashboard pages themselves also have redirect logic if the role is incorrect.
    }
  }, [user, role, authLoading, router]);

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center px-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading your experience...</p>
      </div>
    );
  }

  // If user is logged in but role is still being determined, or if redirection is about to happen,
  // showing a minimal loader or even the homepage briefly is fine as dashboard pages have their own guards.
  // However, if we are certain a redirect should have happened but didn't (e.g. user exists but no role yet),
  // we might still show homepage.

  // Show homepage content if not logged in, or if role isn't student/client yet (e.g. role is null during initial load)
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center px-4">
      <h1 className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
        Welcome to HustleUp
      </h1>
      <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl">
        The platform where ambitious students connect with clients needing freelance talent. Post gigs, find talent, get paid.
      </p>
      <div className="flex flex-col sm:flex-row gap-4 mb-12">
        <Button asChild size="lg">
          <Link href="/auth/signup?role=client">
            <Briefcase className="mr-2 h-5 w-5" /> Post a Gig
          </Link>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <Link href="/gigs/browse">
            <GraduationCap className="mr-2 h-5 w-5" /> Find Work
          </Link>
        </Button>
      </div>
       <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
        <span>Already have an account?</span>
        <Button variant="link" asChild className="p-0 h-auto">
          <Link href="/auth/login">
            Log In <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
