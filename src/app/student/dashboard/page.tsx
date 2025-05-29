
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase } from '@/context/firebase-context';
import { Loader2 } from 'lucide-react';

export default function StudentDashboardPage() {
  const { user, loading: authLoading, role } = useFirebase();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'student') {
        router.replace('/auth/login?redirect=/student/profile'); // Redirect to login if not student
      } else {
        router.replace('/student/profile'); // Redirect student dashboard to profile page
      }
    }
  }, [user, role, authLoading, router]);

  // Show a loading indicator while checking auth/role and redirecting
  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="ml-2 text-muted-foreground">Loading your dashboard...</p>
    </div>
  );
}
    