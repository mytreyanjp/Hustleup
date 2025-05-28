
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, where, Timestamp, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, BookmarkX, CalendarDays, DollarSign, Search, ArrowLeft, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { Skill } from '@/lib/constants';
import { useToast } from '@/hooks/use-toast';

interface BookmarkedGig {
  id: string;
  title: string;
  description: string;
  budget: number;
  currency: string;
  deadline: Timestamp;
  requiredSkills: Skill[];
  clientUsername?: string; // Legacy
  clientDisplayName?: string;
  clientAvatarUrl?: string;
  createdAt: Timestamp;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
}

export default function StudentBookmarksPage() {
  const { user, userProfile, loading: authLoading, role, refreshUserProfile } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [bookmarkedGigs, setBookmarkedGigs] = useState<BookmarkedGig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookmarkedGigs = useCallback(async () => {
    if (!user || !userProfile || !userProfile.bookmarkedGigIds || userProfile.bookmarkedGigIds.length === 0) {
      setBookmarkedGigs([]);
      setIsLoading(false);
      return;
    }
    if (!db) {
        setError("Database not available.");
        setIsLoading(false);
        return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const gigPromises = userProfile.bookmarkedGigIds.map(gigId => getDoc(doc(db, 'gigs', gigId)));
      const gigSnapshots = await Promise.all(gigPromises);
      
      const fetchedGigs = gigSnapshots
        .filter(snap => snap.exists())
        .map(snap => ({ id: snap.id, ...snap.data() } as BookmarkedGig));
      
      setBookmarkedGigs(fetchedGigs);
    } catch (err: any) {
      console.error("Error fetching bookmarked gigs:", err);
      setError("Failed to load your bookmarked gigs. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, [user, userProfile]);

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'student') {
        router.push('/auth/login?redirect=/student/bookmarks');
      } else {
        fetchBookmarkedGigs();
      }
    }
  }, [user, role, authLoading, router, fetchBookmarkedGigs]);

  const handleRemoveBookmark = async (gigIdToRemove: string) => {
    if (!user || !db) {
        toast({ title: "Error", description: "Cannot remove bookmark.", variant: "destructive"});
        return;
    }
    const userDocRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userDocRef, {
        bookmarkedGigIds: arrayRemove(gigIdToRemove)
      });
      setBookmarkedGigs(prevGigs => prevGigs.filter(gig => gig.id !== gigIdToRemove));
      toast({ title: "Bookmark Removed" });
      if(refreshUserProfile) await refreshUserProfile();
    } catch (err: any) {
      console.error("Error removing bookmark:", err);
      toast({ title: "Error", description: `Could not remove bookmark: ${err.message}`, variant: "destructive" });
    }
  };

  const formatDateDistance = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
  };

  const formatDeadline = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    return `Due on ${timestamp.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
  };

  const getClientInitials = (displayName?: string, username?: string) => {
    const nameToUse = displayName || username;
    if (nameToUse) return nameToUse.substring(0, 2).toUpperCase();
    return 'C';
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
         <Button variant="outline" onClick={() => router.push('/student/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
         </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">My Bookmarked Gigs</h1>
        <Button variant="outline" asChild>
          <Link href="/gigs/browse">
            <Search className="mr-2 h-4 w-4" /> Browse More Gigs
          </Link>
        </Button>
      </div>

      {bookmarkedGigs.length === 0 ? (
        <Card className="glass-card text-center py-10">
          <CardHeader>
            <BookmarkX className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle>No Bookmarked Gigs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">You haven't bookmarked any gigs yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Find gigs you're interested in and save them here!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {bookmarkedGigs.map((gig) => (
            <Card key={gig.id} className="glass-card flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg line-clamp-2">{gig.title}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={gig.clientAvatarUrl} alt={gig.clientDisplayName || gig.clientUsername || 'Client'} />
                    <AvatarFallback>{getClientInitials(gig.clientDisplayName, gig.clientUsername)}</AvatarFallback>
                  </Avatar>
                  <CardDescription className="text-sm text-muted-foreground">
                    {gig.clientDisplayName || gig.clientUsername || 'Client'} &bull; {formatDateDistance(gig.createdAt)}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-sm line-clamp-3 mb-4">{gig.description}</p>
                 <div className="mb-4">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Required Skills:</h4>
                    <div className="flex flex-wrap gap-1">
                        {gig.requiredSkills?.slice(0, 5).map((skill, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">{skill}</Badge>
                        ))}
                        {gig.requiredSkills?.length > 5 && <Badge variant="outline" className="text-xs">+{gig.requiredSkills.length - 5} more</Badge>}
                    </div>
                 </div>
                 <div className="flex items-center text-sm text-muted-foreground mb-1">
                     <DollarSign className="mr-1 h-4 w-4" /> Budget: {gig.currency} {gig.budget.toFixed(2)}
                 </div>
                 <div className="flex items-center text-sm text-muted-foreground">
                     <CalendarDays className="mr-1 h-4 w-4" /> {formatDeadline(gig.deadline)}
                 </div>
                 {gig.status !== 'open' && (
                    <Badge variant="destructive" className="mt-2 text-xs">Gig is {gig.status}</Badge>
                 )}
              </CardContent>
              <CardFooter className="flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Button asChild className="w-full sm:w-auto flex-grow" disabled={gig.status !== 'open'}>
                  <Link href={`/gigs/${gig.id}`}>View & Apply</Link>
                </Button>
                <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleRemoveBookmark(gig.id)} 
                    className="w-full sm:w-auto"
                    title="Remove Bookmark"
                >
                  <BookmarkX className="mr-1 h-4 w-4" /> Remove
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
    
