"use client";

import { useState, useEffect } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, FileText } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface Application {
    gigId: string;
    gigTitle: string; // Need to fetch this separately or store denormalized
    appliedAt: Timestamp;
    status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'; // Example statuses
    // Potentially add client name, gig budget etc.
}

interface GigData {
    id: string;
    title: string;
    applicants?: { studentId: string; appliedAt: Timestamp; status?: string; message?: string }[]; // Status might be on the applicant object in the gig doc
}


export default function StudentApplicationsPage() {
  const { user, loading, role } = useFirebase();
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || role !== 'student')) {
      router.push('/auth/login');
    } else if (user && role === 'student') {
      fetchApplications();
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, role, router]);

   const fetchApplications = async () => {
     if (!user) return;
     setIsLoading(true);
     setError(null);
     console.log("Fetching applications for user:", user.uid);

     try {
       // 1. Find gigs where the current user is an applicant
       const gigsRef = collection(db, "gigs");
        // Firestore doesn't support querying nested array fields directly like this efficiently for all users.
        // A common pattern is to store applications in a separate collection or denormalize.
        // For simplicity here, we fetch ALL gigs and filter client-side (NOT scalable for many gigs).
        // **A better approach for production:**
        // - Create an 'applications' collection: { applicationId, gigId, studentId, clientId, status, appliedAt, ... }
        // - Query 'applications' where studentId == user.uid
        // - Fetch corresponding gig details if needed.

        // Fetching all gigs (demonstration purposes - replace with scalable solution)
       const q = query(gigsRef, orderBy("createdAt", "desc")); // Example query
       const querySnapshot = await getDocs(q);

       const userApplications: Application[] = [];
       const gigFetchPromises: Promise<void>[] = [];


       querySnapshot.forEach((doc) => {
            const gigData = { id: doc.id, ...doc.data() } as GigData;
            const userApplicant = gigData.applicants?.find(app => app.studentId === user.uid);

            if (userApplicant) {
                console.log(`User applied to gig: ${gigData.id}`);
                 userApplications.push({
                     gigId: gigData.id,
                     gigTitle: gigData.title || "Untitled Gig", // Use fetched title
                     appliedAt: userApplicant.appliedAt,
                     status: (userApplicant.status as Application['status']) || 'pending', // Get status if available
                 });
            }
        });


       // Sort applications by applied date, newest first
       userApplications.sort((a, b) => b.appliedAt.toMillis() - a.appliedAt.toMillis());


       setApplications(userApplications);
       console.log("Fetched applications:", userApplications);

     } catch (err: any) {
       console.error("Error fetching applications:", err);
       setError("Failed to load your applications. Please try again later.");
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

   const getStatusBadgeVariant = (status: Application['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'accepted': return 'default'; // Or maybe a success variant if you add one
           case 'rejected': return 'destructive';
           case 'withdrawn': return 'outline';
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
    <div className="space-y-8 max-w-4xl mx-auto">
       <div className="flex justify-between items-center">
         <h1 className="text-3xl font-bold tracking-tight">My Applications</h1>
         <Button variant="outline" asChild>
             <Link href="/gigs/browse">Browse More Gigs</Link>
         </Button>
       </div>

      {applications.length === 0 ? (
        <Card className="glass-card text-center py-10">
           <CardHeader>
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <CardTitle>No Applications Found</CardTitle>
           </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">You haven't applied to any gigs yet.</p>
              <Button asChild>
                <Link href="/gigs/browse">Find Your First Gig</Link>
              </Button>
            </CardContent>
        </Card>

      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <Card key={app.gigId} className="glass-card flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-4">
               <div className="flex-grow">
                 <Link href={`/gigs/${app.gigId}`} className="hover:underline">
                     <h3 className="text-lg font-semibold">{app.gigTitle}</h3>
                 </Link>
                 <p className="text-sm text-muted-foreground">
                   Applied {formatDate(app.appliedAt)}
                 </p>
               </div>
               <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mt-2 sm:mt-0 w-full sm:w-auto">
                 <Badge variant={getStatusBadgeVariant(app.status)} className="capitalize w-full sm:w-auto justify-center">
                   Status: {app.status}
                 </Badge>
                 <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
                   <Link href={`/gigs/${app.gigId}`}>
                     View Gig <ArrowRight className="ml-1 h-4 w-4" />
                   </Link>
                 </Button>
                  {/* Optional: Add Withdraw button */}
                  {/* {app.status === 'pending' && <Button variant="destructive" size="sm">Withdraw</Button>} */}
                  {/* Optional: Add Chat button if accepted */}
                  {/* {app.status === 'accepted' && <Button variant="default" size="sm">Chat with Client</Button>} */}
               </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
