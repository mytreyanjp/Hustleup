
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, onSnapshot, orderBy, Timestamp, DocumentData } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, BellRing, ArrowRight, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface ApplicantDetails {
    studentId: string;
    studentUsername: string;
    appliedAt: Timestamp;
    message?: string;
    status?: 'pending' | 'accepted' | 'rejected';
}

interface GigWithPendingApplicants {
  id: string;
  title: string;
  createdAt: Timestamp; // Gig creation date
  pendingApplicants: ApplicantDetails[];
  totalApplicantsOnGig: number; // Total applicants for this specific gig
}

export default function ClientNotificationsPage() {
  const { user, loading: authLoading, role } = useFirebase();
  const router = useRouter();

  const [notifyingGigs, setNotifyingGigs] = useState<GigWithPendingApplicants[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') {
        router.push('/auth/login?redirect=/client/notifications');
        return;
      }
      if (user && db) {
        setIsLoading(true);
        setError(null);

        const gigsRef = collection(db, 'gigs');
        const q = query(
          gigsRef,
          where("clientId", "==", user.uid),
          where("status", "==", "open") // Only consider open gigs
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const fetchedGigs: GigWithPendingApplicants[] = [];
          querySnapshot.forEach((doc) => {
            const gigData = doc.data() as DocumentData;
            const applicants = gigData.applicants as ApplicantDetails[] | undefined;
            const pendingApplicantsList = applicants?.filter(app => !app.status || app.status === 'pending') || [];
            
            if (pendingApplicantsList.length > 0) {
              fetchedGigs.push({
                id: doc.id,
                title: gigData.title || "Untitled Gig",
                createdAt: gigData.createdAt,
                pendingApplicants: pendingApplicantsList.sort((a,b) => b.appliedAt.toMillis() - a.appliedAt.toMillis()),
                totalApplicantsOnGig: applicants?.length || 0,
              });
            }
          });

          fetchedGigs.sort((a, b) => {
            const lastAppA = a.pendingApplicants[0]?.appliedAt.toMillis() || 0;
            const lastAppB = b.pendingApplicants[0]?.appliedAt.toMillis() || 0;
            return lastAppB - lastAppA;
          });
          
          setNotifyingGigs(fetchedGigs);
          setIsLoading(false);
        }, (err: any) => {
          console.error("Error fetching notifications with onSnapshot:", err);
          setError("Failed to load notifications. Please try again later. This might be due to a missing Firestore index.");
          setIsLoading(false);
        });

        return () => unsubscribe(); // Cleanup listener on unmount
      } else {
        setIsLoading(false); // Handle case where user or db is not available after auth check
      }
    }
  }, [user, role, authLoading, router]);

  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
  };

  if (isLoading || authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-destructive">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
      <p className="text-muted-foreground">
        Here are your gigs with new applicants waiting for review. This page updates in real-time.
      </p>

      {notifyingGigs.length === 0 ? (
        <Card className="glass-card text-center py-10">
          <CardHeader>
            <BellRing className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle>All Caught Up!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">You have no new applicants on your open gigs.</p>
            <Button variant="outline" asChild className="mt-4">
              <Link href="/client/gigs">View My Gigs</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {notifyingGigs.map((gig) => (
            <Card key={gig.id} className="glass-card">
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <Link href={`/gigs/${gig.id}`} className="hover:underline">
                        <CardTitle className="text-xl">{gig.title}</CardTitle>
                    </Link>
                    <Button variant="default" size="sm" asChild>
                        <Link href={`/client/gigs/${gig.id}/manage`}>
                            Review {gig.pendingApplicants.length} New Applicant{gig.pendingApplicants.length > 1 ? 's' : ''} <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
                <CardDescription>
                    Posted {formatDate(gig.createdAt)}. {gig.totalApplicantsOnGig} total applicant(s).
                </CardDescription>
              </CardHeader>
              {gig.pendingApplicants.length > 0 && (
                <CardContent className="border-t pt-4 space-y-3">
                   <h4 className="text-sm font-semibold text-muted-foreground">New Applicants:</h4>
                   {gig.pendingApplicants.slice(0, 3).map(applicant => ( // Show first 3 new applicants
                       <div key={applicant.studentId} className="flex items-center justify-between p-2 border rounded-md bg-secondary/30">
                           <div className="flex items-center gap-2">
                               <UserCircle className="h-5 w-5 text-muted-foreground" />
                               <div>
                                   <p className="text-sm font-medium">{applicant.studentUsername}</p>
                                   <p className="text-xs text-muted-foreground">Applied {formatDate(applicant.appliedAt)}</p>
                               </div>
                           </div>
                           <Button variant="link" size="xs" asChild className="text-xs p-0 h-auto">
                               <Link href={`/profile/${applicant.studentId}`} target="_blank">View Profile</Link>
                           </Button>
                       </div>
                   ))}
                   {gig.pendingApplicants.length > 3 && (
                       <p className="text-xs text-muted-foreground text-center">
                           + {gig.pendingApplicants.length - 3} more new applicant(s).
                       </p>
                   )}
                </CardContent>
              )}
            </Card>
          ))}
           <div className="text-center mt-8">
                <Button variant="outline" asChild>
                    <Link href="/client/applicants">View All Applicants</Link>
                </Button>
           </div>
        </div>
      )}
    </div>
  );
}
