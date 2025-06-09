
"use client";

import { useState, useEffect } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, UserCircle, MessageSquare, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface ApplicantInfo {
    studentId: string;
    studentUsername: string;
    appliedAt: Timestamp;
    message?: string;
    status?: 'pending' | 'accepted' | 'rejected'; // Status on the applicant object within the gig
}

interface AppliedGig {
    gigId: string;
    gigTitle: string;
    applicants: ApplicantInfo[];
}

export default function ClientApplicantsPage() {
  const { user, loading, role } = useFirebase();
  const router = useRouter();
  const [appliedGigs, setAppliedGigs] = useState<AppliedGig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || role !== 'client')) {
      router.push('/auth/login');
    } else if (user && role === 'client') {
      fetchApplicants();
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, role, router]);

  const fetchApplicants = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    console.log("Fetching applicants for client:", user.uid);

    try {
      const gigsRef = collection(db, "gigs");
      const q = query(
          gigsRef,
          where("clientId", "==", user.uid), // Gigs posted by this client
          orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);

      const gigsWithApplicants: AppliedGig[] = [];

      querySnapshot.forEach((doc) => {
        const gigData = doc.data();
        // Check if there are applicants and the array is not empty
        if (gigData.applicants && Array.isArray(gigData.applicants) && gigData.applicants.length > 0) {
           gigsWithApplicants.push({
             gigId: doc.id,
             gigTitle: gigData.title || "Untitled Gig",
             // Ensure applicants array structure matches ApplicantInfo
             applicants: gigData.applicants.map((app: any) => ({
                 studentId: app.studentId,
                 studentUsername: app.studentUsername || 'Unknown Student',
                 appliedAt: app.appliedAt, // Assume it's already a Timestamp
                 message: app.message,
                 status: app.status || 'pending',
             }) as ApplicantInfo)
           });
        }
      });

       // Sort gigs by the most recent application across all applicants for that gig
       gigsWithApplicants.sort((a, b) => {
         const lastAppA = a.applicants.reduce((latest, app) => app.appliedAt.toMillis() > latest.toMillis() ? app.appliedAt : latest, a.applicants[0].appliedAt);
         const lastAppB = b.applicants.reduce((latest, app) => app.appliedAt.toMillis() > latest.toMillis() ? app.appliedAt : latest, b.applicants[0].appliedAt);
         return lastAppB.toMillis() - lastAppA.toMillis();
       });


      setAppliedGigs(gigsWithApplicants);
      console.log("Fetched gigs with applicants:", gigsWithApplicants);

    } catch (err: any) {
      console.error("Error fetching applicants:", err);
      setError("Failed to load applicants. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

   const formatDate = (timestamp: Timestamp | undefined): string => {
     if (!timestamp) return 'N/A';
     try {
       return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
     } catch (e) {
       console.error("Error formatting date:", e);
       return 'Invalid date';
     }
   };

    const getStatusBadgeVariant = (status: ApplicantInfo['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'accepted': return 'default';
           case 'rejected': return 'destructive';
           case 'pending':
           default: return 'secondary';
       }
   };

  if (isLoading || loading) {
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
    <div className="space-y-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight">Review Applicants</h1>

      {appliedGigs.length === 0 ? (
         <Card className="glass-card text-center py-10">
           <CardHeader>
             <UserCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
             <CardTitle>No Applicants Yet</CardTitle>
           </CardHeader>
           <CardContent>
             <p className="text-muted-foreground">Students will appear here once they apply to your open gigs.</p>
              <Button variant="outline" asChild className="mt-4">
                 <Link href="/client/gigs">View My Gigs</Link>
             </Button>
           </CardContent>
         </Card>
      ) : (
        <div className="space-y-6">
          {appliedGigs.map((gig) => (
            <Card key={gig.gigId} className="glass-card">
              <CardHeader className="border-b pb-4">
                 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                     <Link href={`/gigs/${gig.gigId}`} className="hover:underline">
                         <CardTitle className="text-xl">{gig.gigTitle}</CardTitle>
                     </Link>
                    <Button variant="secondary" size="sm" asChild>
                        <Link href={`/client/gigs/${gig.gigId}/manage`}>Manage Gig</Link>
                    </Button>
                 </div>
                <CardDescription>{gig.applicants.length} applicant(s)</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {gig.applicants.map((applicant) => (
                  <div key={applicant.studentId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-md gap-3">
                    <div className="flex items-start gap-3 flex-grow">
                      <UserCircle className="h-8 w-8 text-muted-foreground mt-1 shrink-0" />
                      <div className="flex-grow">
                        <p className="font-semibold">{applicant.studentUsername}</p>
                        <p className="text-xs text-muted-foreground mb-1">Applied {formatDate(applicant.appliedAt)}</p>
                        {applicant.message && (
                          <div className="mt-1 p-2 bg-secondary/50 dark:bg-secondary/20 rounded-md text-sm">
                            <p className="text-xs text-muted-foreground mb-0.5">Message from applicant:</p>
                            <p className="italic">"{applicant.message}"</p>
                          </div>
                        )}
                         <Badge variant={getStatusBadgeVariant(applicant.status)} className="capitalize mt-2 inline-block">
                           {applicant.status}
                         </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center shrink-0 mt-2 sm:mt-0">
                       {applicant.studentId ? (
                          <Button size="sm" variant="outline" asChild>
                              <Link href={`/profile/${applicant.studentId}`} target="_blank">View Profile</Link>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled>View Profile (ID Missing)</Button>
                        )}
                       {/* Chat button removed */}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
