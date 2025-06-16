
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
    if (authLoading) {
      return;
    }

    if (user) {
      if (role === 'student') {
        router.replace('/student/profile');
      } else if (role === 'client') {
        router.replace('/client/dashboard');
      } else if (role === 'admin') {
        router.replace('/admin/dashboard');
      }
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

  if (user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center px-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Redirecting to your dashboard...</p>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('https://placehold.co/1920x1080.png?text=HustleUp+Welcome')" }}
      data-ai-hint="modern office"
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm"></div>
      
      <div className="relative z-0 flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center px-4 py-8">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
          Welcome to HustleUp by PromoFlix
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl">
          The platform where ambitious students connect with clients needing freelance talent. Post gigs, find talent, get paid.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 mb-12">
          <Button asChild size="lg" className="px-8 py-3 text-base">
            <Link href="/auth/signup?role=client">
              <Briefcase className="mr-2 h-5 w-5" /> Post a Gig
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="px-8 py-3 text-base">
            <Link href="/gigs/browse">
              <GraduationCap className="mr-2 h-5 w-5" /> Find Work
            </Link>
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
          <span>Already have an account?</span>
          <Button variant="link" asChild className="p-0 h-auto text-base">
            <Link href="/auth/login">
              Log In <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

