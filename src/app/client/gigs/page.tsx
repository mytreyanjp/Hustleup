
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Edit, Users, Trash2, CheckCircle, XCircle, Eye, Settings2, Hourglass } from 'lucide-react'; // Added Hourglass
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';

interface ClientGig {
  id: string;
  title: string;
  status: 'open' | 'in-progress' | 'completed' | 'closed' | 'awaiting_payout'; // Added 'awaiting_payout'
  createdAt: Timestamp;
  deadline: Timestamp;
  budget: number;
  currency: string;
  applicantCount: number;
  selectedStudentId?: string;
  clientDisplayName?: string; 
  clientAvatarUrl?: string;   
}

export default function ClientGigsPage() {
  const { user, userProfile, loading, role } = useFirebase();
  const router = useRouter();
  const [allGigs, setAllGigs] = useState<ClientGig[]>([]);
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
          currency: data.currency || "INR",
          applicantCount: data.applicants?.length || 0,
          selectedStudentId: data.selectedStudentId || null,
          clientDisplayName: data.clientDisplayName || userProfile?.companyName || userProfile?.username || 'Me',
          clientAvatarUrl: data.clientAvatarUrl || userProfile?.profilePictureUrl || '',
        } as ClientGig;
      });

      setAllGigs(fetchedGigs);
    } catch (err: any) {
      console.error("Error fetching client gigs:", err);
      setError("Failed to load your gigs. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const categorizedGigs = useMemo(() => {
    return {
      open: allGigs.filter(gig => gig.status === 'open'),
      inProgress: allGigs.filter(gig => gig.status === 'in-progress'),
      awaitingPayout: allGigs.filter(gig => gig.status === 'awaiting_payout'), // New category
      completed: allGigs.filter(gig => gig.status === 'completed'),
      closed: allGigs.filter(gig => gig.status === 'closed'),
    };
  }, [allGigs]);

   const formatDeadline = (timestamp: Timestamp | undefined): string => {
     if (!timestamp) return 'N/A';
     try {
       return format(timestamp.toDate(), "MMM d, yyyy");
     } catch (e) {
       return 'Invalid Date';
     }
   };
   
  const formatDateDistance = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) {
      return 'Invalid date';
    }
  };

   const getStatusBadgeVariant = (status: ClientGig['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'open': return 'default';
           case 'in-progress': return 'secondary';
           case 'awaiting_payout': return 'secondary'; // Use secondary for awaiting payout
           case 'completed': return 'outline';
           case 'closed': return 'destructive';
           default: return 'secondary';
       }
   };

   const handleDeleteGig = async (gigId: string) => {
       console.log(`Delete gig requested: ${gigId}`);
       alert("Delete functionality not yet fully implemented. For now, consider editing the gig to 'closed'.");
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

  const GigCard = ({ gig }: { gig: ClientGig }) => (
    <Card key={gig.id} className="glass-card flex flex-col">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex justify-between items-start gap-2">
           <Link href={`/gigs/${gig.id}`} className="hover:underline flex-grow">
               <CardTitle className="text-lg line-clamp-2">{gig.title}</CardTitle>
           </Link>
           <Badge variant={getStatusBadgeVariant(gig.status)} className="capitalize shrink-0 text-xs">
               {gig.status === 'awaiting_payout' ? 'Payment Processing' : gig.status}
           </Badge>
        </div>
        <CardDescription className="text-xs">
          Created {formatDateDistance(gig.createdAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow p-4 sm:p-6 pt-0">
         <div className="text-xs sm:text-sm text-muted-foreground">
            Deadline: {formatDeadline(gig.deadline)}
         </div>
         <div className="text-xs sm:text-sm text-muted-foreground">
            Budget: {gig.currency} {gig.budget.toFixed(2)}
         </div>
         <div className="flex items-center text-xs sm:text-sm text-muted-foreground mt-2">
            <Users className="mr-1 h-4 w-4" /> {gig.applicantCount} Applicant(s)
         </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row sm:flex-wrap justify-end gap-2 border-t p-4 pt-4 sm:p-6 sm:pt-4">
        {gig.status === 'open' && (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/client/gigs/${gig.id}/manage`}>
                <Users className="mr-1 h-4 w-4" /> View Applicants
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/client/gigs/${gig.id}/edit`}>
                <Edit className="mr-1 h-4 w-4" /> Edit Gig
              </Link>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => handleDeleteGig(gig.id)} disabled>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </>
        )}
        {(gig.status === 'in-progress' || gig.status === 'awaiting_payout') && (
          <Button variant="default" size="sm" asChild>
            <Link href={`/client/gigs/${gig.id}/manage`}>
              {gig.status === 'awaiting_payout' ? <Hourglass className="mr-1 h-4 w-4" /> : <Settings2 className="mr-1 h-4 w-4" />} 
              {gig.status === 'awaiting_payout' ? 'Track Payout' : 'Manage & Pay'}
            </Link>
          </Button>
        )}
        {(gig.status === 'completed' || gig.status === 'closed') && (
           <Button variant="outline" size="sm" asChild>
            <Link href={`/gigs/${gig.id}`}>
              <Eye className="mr-1 h-4 w-4" /> View Details
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );

  const renderGigSection = (title: string, gigs: ClientGig[], icon: React.ReactNode) => {
    if (gigs.length === 0 && title !== "Open Gigs") return null; // Ensure "Open Gigs" section always shows, even if empty initially

    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">{title} ({gigs.length})</h2>
        </div>
        {gigs.length === 0 ? (
          <p className="text-muted-foreground ml-8 text-sm">No gigs in this category.</p>
        ) : (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            {gigs.map((gig) => <GigCard gig={gig} key={gig.id} />)}
          </div>
        )}
      </section>
    );
  };


  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Gigs</h1>
        <Button asChild size="sm" className="sm:text-sm">
          <Link href="/client/gigs/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Post a New Gig
          </Link>
        </Button>
      </div>

      {allGigs.length === 0 && !isLoading ? (
        <Card className="glass-card text-center py-10">
          <CardHeader className="p-4 sm:p-6">
              <CardTitle>No Gigs Found</CardTitle>
              <CardDescription>You haven't posted any gigs yet.</CardDescription>
          </CardHeader>
           <CardContent className="p-4 sm:p-6 pt-0">
             <Button asChild>
                <Link href="/client/gigs/new">Post Your First Gig</Link>
             </Button>
           </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {renderGigSection("In-Progress Gigs", categorizedGigs.inProgress, <Settings2 className="h-5 w-5 sm:h-6 sm:w-6 text-secondary-foreground" />)}
          {renderGigSection("Awaiting Payout", categorizedGigs.awaitingPayout, <Hourglass className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />)}
          {renderGigSection("Open Gigs", categorizedGigs.open, <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />)}
          {renderGigSection("Completed Gigs", categorizedGigs.completed, <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-green-500" />)}
          {renderGigSection("Closed Gigs", categorizedGigs.closed, <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-destructive" />)}
        </div>
      )}
    </div>
  );
}

    