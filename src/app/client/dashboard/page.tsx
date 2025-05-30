
"use client";

import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Users, CreditCard, Briefcase, Loader2, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';

interface Gig {
  id: string;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  applicants?: { studentId: string; status?: 'pending' | 'accepted' | 'rejected' }[];
  // other gig properties
}

export default function ClientDashboardPage() {
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const router = useRouter();
  const [activeGigsCount, setActiveGigsCount] = useState<number | null>(null);
  const [pendingApplicantsCount, setPendingApplicantsCount] = useState<number | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Protect route: Redirect if not loading, not logged in, or not a client
  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') {
        router.push('/auth/login?redirect=/client/dashboard');
      }
    }
  }, [user, role, authLoading, router]);

  useEffect(() => {
    if (user && role === 'client') {
      const fetchDashboardStats = async () => {
        setIsLoadingStats(true);
        try {
          const gigsRef = collection(db, "gigs");
          const q = query(gigsRef, where("clientId", "==", user.uid));
          const querySnapshot = await getDocs(q);

          let activeGigs = 0;
          let pendingApplicants = 0;

          querySnapshot.forEach((doc) => {
            const gig = doc.data() as Gig;
            if (gig.status === 'open' || gig.status === 'in-progress') {
              activeGigs++;
            }
            if (gig.status === 'open' && gig.applicants) {
              gig.applicants.forEach(applicant => {
                if (applicant.status === 'pending' || !applicant.status) {
                  pendingApplicants++;
                }
              });
            }
          });

          setActiveGigsCount(activeGigs);
          setPendingApplicantsCount(pendingApplicants);
        } catch (error) {
          console.error("Error fetching dashboard stats:", error);
          // Optionally set error state to display in UI
        } finally {
          setIsLoadingStats(false);
        }
      };
      fetchDashboardStats();
    }
  }, [user, role]);


  // Show loading state from context or stats loading
  if (authLoading || (isLoadingStats && user && role === 'client')) {
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

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Client Dashboard</h1>
         <Button asChild size="lg" className="sm:text-base">
            <Link href="/client/gigs/new">
                <PlusCircle className="mr-2 h-5 w-5" /> Post a New Gig
            </Link>
         </Button>
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
         <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-sm font-medium">Active Gigs</CardTitle>
            <Briefcase className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
            <div className="text-2xl sm:text-3xl font-bold">
                {activeGigsCount === null ? <Loader2 className="h-7 w-7 animate-spin" /> : activeGigsCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Gigs that are open or in-progress.
            </p>
             <Button variant="link" size="sm" className="p-0 h-auto mt-3 text-sm" asChild>
                <Link href="/client/gigs">View Gigs</Link>
             </Button>
          </CardContent>
        </Card>

         <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-sm font-medium">Pending Applicants</CardTitle>
             <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
            <div className="text-2xl sm:text-3xl font-bold">
                {pendingApplicantsCount === null ? <Loader2 className="h-7 w-7 animate-spin" /> : pendingApplicantsCount}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Students awaiting review for your open gigs.
            </p>
             <Button variant="link" size="sm" className="p-0 h-auto mt-3 text-sm" asChild>
                 <Link href="/client/applicants">View Applicants</Link>
             </Button>
          </CardContent>
        </Card>

         <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-sm font-medium">Payments Made</CardTitle>
             <CreditCard className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
            {/* TODO: Fetch actual payment data */}
            <div className="text-2xl sm:text-3xl font-bold">$0.00</div>
            <p className="text-xs text-muted-foreground mt-1">
              Track your spending on completed gigs.
            </p>
             <Button variant="link" size="sm" className="p-0 h-auto mt-3 text-sm" asChild>
                 <Link href="/client/payments">View Payment History</Link>
             </Button>
          </CardContent>
        </Card>
      </div>

       <Card className="glass-card">
         <CardHeader className="p-4 sm:p-6">
           <CardTitle>Recent Activity</CardTitle>
           <CardDescription>Overview of recent applications and messages.</CardDescription>
         </CardHeader>
         <CardContent className="p-4 sm:p-6 pt-0">
           {/* TODO: Implement recent activity feed (e.g., list of last 5 applied/accepted applicants) */}
           <p className="text-sm text-muted-foreground">No recent activity to display. Post a gig to get started!</p>
         </CardContent>
       </Card>
    </div>
  );
}
