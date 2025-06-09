
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase } from '@/context/firebase-context';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role, loading } = useFirebase();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/auth/login?redirect=/admin/dashboard');
      } else if (role !== 'admin') {
        // If not admin, redirect to their respective dashboard or home
        if (role === 'student') router.replace('/student/profile');
        else if (role === 'client') router.replace('/client/dashboard');
        else router.replace('/'); // Fallback for users with no specific role page
      }
    }
  }, [user, role, loading, router]);

  if (loading || (user && role !== 'admin')) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Verifying access...</p>
      </div>
    );
  }
  
  // If user is loaded and is an admin, render children
  if (user && role === 'admin') {
    return <>{children}</>;
  }

  // Fallback for edge cases or if still loading without user (should be caught by useEffect)
  return null;
}
