
"use client";

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarDays, DollarSign, Search, UserCircle, Star } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { Skill } from '@/lib/constants';

interface Gig {
  id: string;
  title: string;
  description: string;
  budget: number;
  currency: string;
  deadline: Timestamp;
  requiredSkills: Skill[];
  clientId: string;
  clientUsername?: string;
  clientDisplayName?: string;
  clientAvatarUrl?: string;
  createdAt: Timestamp;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  applicants?: { studentId: string; studentUsername: string; message?: string; appliedAt: Timestamp }[];
  isFromFollowedClient?: boolean;
}

export default function BrowseGigsPage() {
  const { user: currentUser, userProfile, loading: authLoading, role } = useFirebase();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAndFilterGigs = async () => {
      setIsLoading(true);
      setError(null);
      if (!db) {
        setError("Database not available.");
        setIsLoading(false);
        return;
      }
      try {
        const gigsCollectionRef = collection(db, 'gigs');
        // IMPORTANT: This query requires a composite index on 'gigs': status (Ascending), createdAt (Descending)
        // Create it in Firebase console if missing. Link: https://console.firebase.google.com/v1/r/project/hustleup-ntp15/firestore/indexes?create_composite=Cktwcm9qZWN0cy9odXN0bGV1cC1udHAxNS9kYXRhYmFzZXMvKGRlZmF1bHQpL2NvbGxlY3Rpb25Hcm91cHMvZ2lncy9pbmRleGVzL18QARoKCgZzdGF0dXMQARoNCgljcmVhdGVkQXQQAhoMCghfX25hbWVfXxAC
        const q = query(
          gigsCollectionRef,
          where('status', '==', 'open'),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        let allOpenGigs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          isFromFollowedClient: false, // Initialize
        })) as Gig[];

        if (!authLoading && currentUser && role === 'student' && userProfile) {
          const followedClientIds = userProfile.following || [];
          const studentSkillsLower = (userProfile.skills as Skill[])?.map(s => s.toLowerCase()) || [];

          // Mark gigs from followed clients
          allOpenGigs = allOpenGigs.map(gig => ({
            ...gig,
            isFromFollowedClient: followedClientIds.includes(gig.clientId),
          }));

          // Filter out gigs already applied to by the student
          allOpenGigs = allOpenGigs.filter(gig =>
            !(gig.applicants && gig.applicants.some(app => app.studentId === currentUser.uid))
          );

          let recommendedGigs: Gig[] = [];
          const otherGigs: Gig[] = [];

          allOpenGigs.forEach(gig => {
            if (gig.isFromFollowedClient) {
              recommendedGigs.push(gig); // Gigs from followed clients are always recommended
            } else {
              otherGigs.push(gig);
            }
          });

          let skillMatchedGigs: Gig[] = [];
          if (studentSkillsLower.length > 0) {
            skillMatchedGigs = otherGigs.filter(gig =>
              gig.requiredSkills.some(reqSkill => {
                const reqSkillLower = reqSkill.toLowerCase();
                return studentSkillsLower.some(studentSkillLower =>
                  studentSkillLower.includes(reqSkillLower) || reqSkillLower.includes(studentSkillLower)
                );
              })
            );
          } else {
            // If student has no skills, they see all non-followed, non-applied-to open gigs
            skillMatchedGigs = otherGigs;
          }

          // Combine followed client gigs (unfiltered by skill) with skill-matched other gigs
          let finalGigs = [...recommendedGigs, ...skillMatchedGigs];
          
          // Remove duplicates that might occur if a followed client's gig also matched skills (though logic above should prevent this)
          finalGigs = Array.from(new Set(finalGigs.map(g => g.id))).map(id => finalGigs.find(g => g.id === id)!);


          // Sort: gigs from followed clients first, then by creation date
          finalGigs.sort((a, b) => {
            if (a.isFromFollowedClient && !b.isFromFollowedClient) return -1;
            if (!a.isFromFollowedClient && b.isFromFollowedClient) return 1;
            return b.createdAt.toMillis() - a.createdAt.toMillis();
          });

          setGigs(finalGigs);

        } else {
          // If not a student, or profile not loaded, or auth still loading, show all open gigs
          setGigs(allOpenGigs);
        }

      } catch (err: any) {
        console.error("Error fetching gigs:", err);
        setError("Failed to load gigs. Please try again later. This might be due to a missing Firestore index. Check the console for a link to create it.");
      } finally {
        setIsLoading(false);
      }
    };

    // Run fetch only after auth loading is complete to ensure userProfile is available
    if (!authLoading) {
        fetchAndFilterGigs();
    } else {
        // If auth is still loading, you might want to show a general loading state or fetch all open gigs initially
        // For simplicity, we wait for auth to resolve.
        setIsLoading(true); // Keep loading until auth is resolved
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser, role, userProfile]); // userProfile added as dependency

  const formatDateDistance = (timestamp: Timestamp | undefined): string => {
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
   
  const getClientInitials = (displayName?: string, username?: string) => {
    const nameToUse = displayName || username;
    if (nameToUse) return nameToUse.substring(0, 2).toUpperCase();
    return 'C';
  };

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
      <h1 className="text-3xl font-bold tracking-tight">Explore Gigs</h1>

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
                            Add skills to your profile to discover relevant freelance opportunities. Gigs are matched based on your skills.
                        </p>
                        <Button asChild>
                            <Link href="/student/profile">Update Your Profile Skills</Link>
                        </Button>
                    </>
                ) : currentUser && role === 'student' ? (
                     <p className="text-muted-foreground">
                        No open gigs currently match your preferences or from clients you follow, or you've applied to all available matching gigs. Check back later or expand your skills!
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
                <div className="flex justify-between items-start">
                    <CardTitle className="text-lg line-clamp-2">{gig.title}</CardTitle>
                    {gig.isFromFollowedClient && (
                        <Badge variant="outline" className="text-xs border-primary text-primary ml-2 shrink-0">
                            <Star className="mr-1 h-3 w-3" /> Following
                        </Badge>
                    )}
                </div>
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

