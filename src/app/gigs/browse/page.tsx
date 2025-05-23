
"use client";

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarDays, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface Gig {
  id: string;
  title: string;
  description: string;
  budget: number;
  deadline: Timestamp; // Firestore Timestamp
  requiredSkills: string[];
  clientId: string;
  clientUsername?: string;
  createdAt: Timestamp; // Firestore Timestamp
  status: 'open' | 'in-progress' | 'completed' | 'closed';
}

export default function BrowseGigsPage() {
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGigs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const gigsCollectionRef = collection(db, 'gigs');
        // Query for open gigs, ordered by creation date (newest first)
        // IMPORTANT: This query requires a composite index in Firestore.
        // If you see an error about a missing index, Firebase will provide a link
        // to create it in the console. The index typically involves:
        // Collection: 'gigs'
        // Fields: 'status' (Ascending), 'createdAt' (Descending)
        // Example link from a past error for this query structure:
        // https://console.firebase.google.com/v1/r/project/YOUR_PROJECT_ID/firestore/indexes?create_composite=...
        // (Replace YOUR_PROJECT_ID with your actual project ID if the link in the error is different)
        const q = query(
          gigsCollectionRef,
          where('status', '==', 'open'),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const fetchedGigs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Gig[];
        setGigs(fetchedGigs);
      } catch (err: any) {
        console.error("Error fetching gigs:", err);
        setError("Failed to load gigs. Please try again later. This might be due to a missing Firestore index. Check the console for a link to create it.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchGigs();
  }, []);

  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) {
      console.error("Error formatting date:", e);
      return 'Invalid date';
    }
  };

   const formatDeadline = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      // Example: "Due on January 15, 2025"
      return `Due on ${timestamp.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
    } catch (e) {
      console.error("Error formatting deadline:", e);
      return 'Invalid date';
    }
   };

  if (isLoading) {
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
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Browse Available Gigs</h1>

      {gigs.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">
          No open gigs found at the moment. Check back later!
        </p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {gigs.map((gig) => (
            <Card key={gig.id} className="glass-card flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg line-clamp-2">{gig.title}</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Posted by {gig.clientUsername || 'Client'} {formatDate(gig.createdAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-sm line-clamp-3 mb-4">{gig.description}</p>
                 <div className="flex flex-wrap gap-2 mb-4">
                  {gig.requiredSkills?.map((skill, index) => (
                    <Badge key={index} variant="secondary">{skill}</Badge>
                  ))}
                </div>
                 <div className="flex items-center text-sm text-muted-foreground mb-1">
                     <DollarSign className="mr-1 h-4 w-4" /> Budget: ${gig.budget.toFixed(2)}
                 </div>
                 <div className="flex items-center text-sm text-muted-foreground">
                     <CalendarDays className="mr-1 h-4 w-4" /> {formatDeadline(gig.deadline)}
                 </div>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href={`/gigs/${gig.id}`}>View Details & Apply</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
