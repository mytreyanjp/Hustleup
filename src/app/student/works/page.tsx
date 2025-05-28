
"use client";

import { useState, useEffect } from 'react';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, MessageSquare, Layers, CalendarDays, DollarSign, Briefcase } from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';

interface WorkGig {
  id: string;
  title: string;
  clientId: string;
  clientUsername?: string; // Will be fetched separately
  clientCompanyName?: string; // Will be fetched separately
  deadline: Timestamp;
  budget: number;
  currency: string;
  numberOfReports?: number;
  status: 'in-progress'; // This page only shows in-progress gigs
  // other gig details if needed
}

export default function StudentWorksPage() {
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const router = useRouter();
  const [activeGigs, setActiveGigs] = useState<WorkGig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || role !== 'student')) {
      router.push('/auth/login?redirect=/student/works');
    } else if (user && role === 'student') {
      fetchActiveGigs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, role, router]);

  const fetchActiveGigs = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);

    try {
      // IMPORTANT: This query requires a composite index in Firestore:
      // Collection: gigs, Fields: selectedStudentId (ASC), status (ASC), createdAt (DESC)
      // Example: selectedStudentId ASC, status ASC, createdAt DESC
      const gigsRef = collection(db, "gigs");
      const q = query(
        gigsRef,
        where("selectedStudentId", "==", user.uid),
        where("status", "==", "in-progress"),
        orderBy("createdAt", "desc") // Or orderBy deadline, etc.
      );
      const querySnapshot = await getDocs(q);

      const fetchedGigsPromises = querySnapshot.docs.map(async (gigDoc) => {
        const gigData = gigDoc.data();
        let clientUsername = gigData.clientUsername || 'Client';
        let clientCompanyName: string | undefined = undefined;

        if (gigData.clientId && db) {
          try {
            const clientDocRef = doc(db, 'users', gigData.clientId);
            const clientDocSnap = await getDoc(clientDocRef);
            if (clientDocSnap.exists()) {
              const clientProfile = clientDocSnap.data() as UserProfile;
              clientUsername = clientProfile.username || clientUsername;
              clientCompanyName = clientProfile.companyName;
            }
          } catch (clientProfileError) {
            console.error("Error fetching client profile for gig:", clientProfileError);
          }
        }
        
        return {
          id: gigDoc.id,
          title: gigData.title || "Untitled Gig",
          clientId: gigData.clientId,
          clientUsername,
          clientCompanyName,
          deadline: gigData.deadline,
          budget: gigData.budget || 0,
          currency: gigData.currency || "INR",
          numberOfReports: gigData.numberOfReports || 0,
          status: gigData.status,
        } as WorkGig;
      });

      const resolvedGigs = await Promise.all(fetchedGigsPromises);
      setActiveGigs(resolvedGigs);

    } catch (err: any) {
      console.error("Error fetching active gigs:", err);
      setError("Failed to load your active works. Please try again. This might be due to a missing Firestore index.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDeadlineDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return format(timestamp.toDate(), "MMM d, yyyy");
    } catch (e) {
      return 'Invalid Date';
    }
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
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Your Works</h1>
        <Button variant="outline" asChild>
          <Link href="/gigs/browse">Find More Gigs</Link>
        </Button>
      </div>

      {activeGigs.length === 0 ? (
        <Card className="glass-card text-center py-10">
          <CardHeader>
            <Briefcase className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle>No Active Works</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">You don't have any gigs currently in progress.</p>
            <p className="text-sm text-muted-foreground">Once a client accepts your application, the gig will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeGigs.map((gig) => (
            <Card key={gig.id} className="glass-card">
              <CardHeader>
                <div className="flex justify-between items-start gap-2">
                  <Link href={`/gigs/${gig.id}`} className="hover:underline">
                    <CardTitle className="text-xl">{gig.title}</CardTitle>
                  </Link>
                  <Badge variant="secondary" className="capitalize">{gig.status}</Badge>
                </div>
                <CardDescription>
                  Client: <Link href={`/profile/${gig.clientId}`} className="text-primary hover:underline">{gig.clientCompanyName || gig.clientUsername}</Link>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center text-sm">
                  <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground mr-1">Budget:</span> <span className="font-medium">{gig.currency} {gig.budget.toFixed(2)}</span>
                </div>
                <div className="flex items-center text-sm">
                  <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground mr-1">Deadline:</span> <span className="font-medium">{formatDeadlineDate(gig.deadline)}</span>
                </div>
                {gig.numberOfReports !== undefined && gig.numberOfReports > 0 && (
                  <div className="flex items-center text-sm">
                    <Layers className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground mr-1">Progress Reports:</span> <span className="font-medium">{gig.numberOfReports} required</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row justify-between items-stretch gap-2 border-t pt-4">
                <Button size="sm" asChild>
                  <Link href={`/chat?userId=${gig.clientId}&gigId=${gig.id}`}>
                    <MessageSquare className="mr-1 h-4 w-4" /> Chat with Client
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/gigs/${gig.id}`}>
                    View Details & Manage Progress
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
