
"use client";

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context'; // Import useFirebase
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarDays, DollarSign, Search } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { Skill } from '@/lib/constants'; // Import Skill type

interface Gig {
  id: string;
  title: string;
  description: string;
  budget: number;
  deadline: Timestamp;
  requiredSkills: Skill[]; // Use Skill type
  clientId: string;
  clientUsername?: string;
  createdAt: Timestamp;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
}

export default function BrowseGigsPage() {
  const { user: currentUser, userProfile, loading: authLoading, role } = useFirebase();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [isLoading, setIsLoading] = useState(true); // For fetching gigs
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndFilterGigs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const gigsCollectionRef = collection(db, 'gigs');
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

        // Filter based on student skills if applicable, only after auth state is resolved
        if (!authLoading) {
          if (currentUser && role === 'student') {
            if (userProfile?.skills && userProfile.skills.length > 0) {
              const studentSkills = userProfile.skills as Skill[];
              const filtered = fetchedGigs.filter(gig =>
                gig.requiredSkills.some(reqSkill => studentSkills.includes(reqSkill))
              );
              setGigs(filtered);
            } else {
              // Student is logged in but has no skills, show empty or a message
              setGigs([]);
            }
          } else {
            // Not a student, or not logged in
            setGigs(fetchedGigs);
          }
        } else {
            // Auth still loading, show all open gigs temporarily or keep gigs empty until auth resolves
            setGigs(fetchedGigs); // Or setGigs([]) and handle loading state appropriately
        }

      } catch (err: any) {
        console.error("Error fetching gigs:", err);
        setError("Failed to load gigs. Please try again later. This might be due to a missing Firestore index. Check the console for a link to create it.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndFilterGigs();
  }, [authLoading, currentUser, role, userProfile]);

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
      return `Due on ${timestamp.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`;
    } catch (e) {
      console.error("Error formatting deadline:", e);
      return 'Invalid date';
    }
   };

  // Combined loading state
  const pageIsLoading = authLoading || isLoading;

  if (pageIsLoading) {
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

      {gigs.length === 0 && !pageIsLoading ? (
        <Card className="glass-card text-center py-10">
            <CardHeader>
                <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <CardTitle>No Gigs Found</CardTitle>
            </CardHeader>
            <CardContent>
                {currentUser && role === 'student' && (!userProfile?.skills || userProfile.skills.length === 0) ? (
                    <>
                        <p className="text-muted-foreground mb-4">
                            Add skills to your profile to discover relevant freelance opportunities.
                        </p>
                        <Button asChild>
                            <Link href="/student/profile">Update Your Profile Skills</Link>
                        </Button>
                    </>
                ) : currentUser && role === 'student' ? (
                     <p className="text-muted-foreground">
                        No gigs currently match your skill set. Check back later or expand your skills!
                    </p>
                ) : (
                    <p className="text-muted-foreground">
                        There are no open gigs at the moment. Please check back later!
                    </p>
                )}
            </CardContent>
        </Card>
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
                 <div className="mb-4">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Required Skills:</h4>
                    <div className="flex flex-wrap gap-1">
                        {gig.requiredSkills?.slice(0, 5).map((skill, index) => ( // Show max 5 skills initially
                            <Badge key={index} variant="secondary" className="text-xs">{skill}</Badge>
                        ))}
                        {gig.requiredSkills?.length > 5 && <Badge variant="outline" className="text-xs">+{gig.requiredSkills.length - 5} more</Badge>}
                    </div>
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
