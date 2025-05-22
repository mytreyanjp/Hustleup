
"use client";

import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Users, CreditCard, Briefcase, Loader2 } from 'lucide-react'; // Added Briefcase and Loader2
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ClientDashboardPage() {
  const { user, userProfile, loading, role } = useFirebase();
  const router = useRouter();

  // Protect route: Redirect if not loading, not logged in, or not a client
  useEffect(() => {
    if (!loading) { // Only check after initial context loading is done
      if (!user || role !== 'client') {
        router.push('/auth/login'); // Or show an unauthorized page
      }
    }
  }, [user, role, loading, router]);

  // Show loading state from context
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If context is loaded, but user is not a client (or not logged in), show placeholder.
  // The useEffect above will handle the redirect.
  if (!user || role !== 'client') {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <p className="text-muted-foreground">Verifying access...</p>
      </div>
    );
  }

  // If all checks pass, render dashboard
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <h1 className="text-3xl font-bold tracking-tight">Client Dashboard</h1>
         <Button asChild>
            <Link href="/client/gigs/new">
                <PlusCircle className="mr-2 h-4 w-4" /> Post a New Gig
            </Link>
         </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
         <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Gigs</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div> {/* TODO: Fetch actual count */}
            <p className="text-xs text-muted-foreground">
              Manage your ongoing projects.
            </p>
             <Button variant="link" size="sm" className="p-0 h-auto mt-2" asChild>
                <Link href="/client/gigs">View Gigs</Link>
             </Button>
          </CardContent>
        </Card>

         <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applicants</CardTitle>
             <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div> {/* TODO: Fetch actual count */}
            <p className="text-xs text-muted-foreground">
              Review students who applied to your gigs.
            </p>
             <Button variant="link" size="sm" className="p-0 h-auto mt-2" asChild>
                 <Link href="/client/applicants">View Applicants</Link>
             </Button>
          </CardContent>
        </Card>

         <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payments Made</CardTitle>
             <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0.00</div> {/* TODO: Fetch actual payment data */}
            <p className="text-xs text-muted-foreground">
              Track your spending on completed gigs.
            </p>
             <Button variant="link" size="sm" className="p-0 h-auto mt-2" asChild>
                 <Link href="/client/payments">View Payment History</Link>
             </Button>
          </CardContent>
        </Card>
      </div>

       <Card className="glass-card">
         <CardHeader>
           <CardTitle>Recent Activity</CardTitle>
           <CardDescription>Overview of recent applications and messages.</CardDescription>
         </CardHeader>
         <CardContent>
           <p className="text-sm text-muted-foreground">No recent activity to display. Post a gig to get started!</p>
           {/* TODO: Implement recent activity feed */}
         </CardContent>
       </Card>
    </div>
  );
}
