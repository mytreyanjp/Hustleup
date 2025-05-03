"use client";

import { useState, useEffect } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Edit, Users, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns'; // Using format for deadline display

interface ClientGig {
  id: string;
  title: string;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  createdAt: Timestamp;
  deadline: Timestamp;
  budget: number;
  applicantCount: number; // Denormalized or calculated count
}

export default function ClientGigsPage() {
  const { user, loading, role } = useFirebase();
  const router = useRouter();
  const [gigs, setGigs] = useState<ClientGig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || role !== 'client')) {
      router.push('/auth/login');
    } else if (user && role === 'client') {
      fetchGigs();
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, role, router]);

  const fetchGigs = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const gigsRef = collection(db, "gigs");
      const q = query(
        gigsRef,
        where("clientId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);

      const fetchedGigs = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || "Untitled Gig",
          status: data.status || 'open',
          createdAt: data.createdAt,
          deadline: data.deadline,
          budget: data.budget || 0,
          applicantCount: data.applicants?.length || 0, // Calculate count from applicants array
        } as ClientGig;
      });

      setGigs(fetchedGigs);
    } catch (err: any) {
      console.error("Error fetching client gigs:", err);
      setError("Failed to load your gigs. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

   const formatDeadline = (timestamp: Timestamp | undefined): string => {
     if (!timestamp) return 'N/A';
     try {
       return format(timestamp.toDate(), "MMM d, yyyy"); // Format like "Jan 15, 2025"
     } catch (e) {
       return 'Invalid Date';
     }
   };

   const getStatusBadgeVariant = (status: ClientGig['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'open': return 'default';
           case 'in-progress': return 'secondary'; // Could use a specific color later
           case 'completed': return 'outline'; // Maybe success variant
           case 'closed': return 'destructive';
           default: return 'secondary';
       }
   };

   // TODO: Implement delete functionality with confirmation
   const handleDeleteGig = async (gigId: string) => {
       console.log(`Delete gig requested: ${gigId}`);
        // Show confirmation dialog
        // If confirmed: deleteDoc(doc(db, 'gigs', gigId));
        // Then refetch gigs or remove from state
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-3xl font-bold tracking-tight">My Gigs</h1>
        <Button asChild>
          <Link href="/client/gigs/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Post a New Gig
          </Link>
        </Button>
      </div>

      {gigs.length === 0 ? (
        <Card className="glass-card text-center py-10">
          <CardHeader>
              <CardTitle>No Gigs Found</CardTitle>
              <CardDescription>You haven't posted any gigs yet.</CardDescription>
          </CardHeader>
           <CardContent>
             <Button asChild>
                <Link href="/client/gigs/new">Post Your First Gig</Link>
             </Button>
           </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {gigs.map((gig) => (
            <Card key={gig.id} className="glass-card flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start gap-2">
                   <Link href={`/gigs/${gig.id}`} className="hover:underline flex-grow">
                       <CardTitle className="text-lg line-clamp-2">{gig.title}</CardTitle>
                   </Link>
                   <Badge variant={getStatusBadgeVariant(gig.status)} className="capitalize shrink-0">
                       {gig.status}
                   </Badge>
                </div>
                <CardDescription>
                  Deadline: {formatDeadline(gig.deadline)} | Budget: ${gig.budget.toFixed(2)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                 <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="mr-1 h-4 w-4" /> {gig.applicantCount} Applicant(s)
                 </div>
                 {/* Can add a snippet of description or skills here if needed */}
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 border-t pt-4">
                 <Button variant="outline" size="sm" asChild>
                     <Link href={`/client/applicants?gigId=${gig.id}`}>
                         <Users className="mr-1 h-4 w-4" /> View Applicants ({gig.applicantCount})
                     </Link>
                 </Button>
                 <Button variant="secondary" size="sm" asChild>
                    <Link href={`/client/gigs/${gig.id}/edit`}> {/* TODO: Create edit page */}
                        <Edit className="mr-1 h-4 w-4" /> Edit Gig
                    </Link>
                 </Button>
                 <Button variant="destructive" size="sm" onClick={() => handleDeleteGig(gig.id)} disabled> {/* TODO: Enable delete */}
                     <Trash2 className="mr-1 h-4 w-4" /> Delete
                 </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
