
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
          isFromFollowedClient: false,
        })) as Gig[];

        if (!authLoading && currentUser && role === 'student' && userProfile) {
          const followedClientIds = userProfile.following || [];
          const studentSkillsLower = (userProfile.skills as Skill[])?.map(s => s.toLowerCase()) || [];

          // Filter out gigs already applied to by the student
          allOpenGigs = allOpenGigs.filter(gig =>
            !(gig.applicants && gig.applicants.some(app => app.studentId === currentUser.uid))
          );
          
          const gigsFromFollowedClients: Gig[] = [];
          const otherGigsTemp: Gig[] = [];

          allOpenGigs.forEach(gig => {
            if (followedClientIds.includes(gig.clientId)) {
              gigsFromFollowedClients.push({ ...gig, isFromFollowedClient: true });
            } else {
              otherGigsTemp.push(gig);
            }
          });
          
          let skillMatchedNonFollowedGigs: Gig[] = [];
          if (studentSkillsLower.length > 0) {
            skillMatchedNonFollowedGigs = otherGigsTemp.filter(gig =>
              gig.requiredSkills.some(reqSkill => {
                const reqSkillLower = reqSkill.toLowerCase();
                // Check for substring match
                if (studentSkillsLower.some(studentSkillLower => studentSkillLower.includes(reqSkillLower) || reqSkillLower.includes(studentSkillLower))) {
                  return true;
                }
                // Check for common significant word match (ignoring single letter words)
                const reqSkillWords = new Set(reqSkillLower.split(/\s+/).filter(w => w.length > 1));
                return studentSkillsLower.some(studentSkillLower => {
                  const studentSkillWords = new Set(studentSkillLower.split(/\s+/).filter(w => w.length > 1));
                  for (const sword of studentSkillWords) {
                    if (reqSkillWords.has(sword)) {
                      return true;
                    }
                  }
                  return false;
                });
              })
            );
          } else {
            // If student has no skills, they see all non-followed, non-applied-to gigs
            skillMatchedNonFollowedGigs = otherGigsTemp;
          }
          
          // Combine followed client gigs (skills not checked) and skill-matched non-followed client gigs
          let finalGigs = [
            ...gigsFromFollowedClients, 
            ...skillMatchedNonFollowedGigs
          ];
          
          // Ensure uniqueness
          finalGigs = Array.from(new Set(finalGigs.map(g => g.id))).map(id => finalGigs.find(g => g.id === id)!);

          // Sort: followed client gigs first, then by creation date
          finalGigs.sort((a, b) => {
            if (a.isFromFollowedClient && !b.isFromFollowedClient) return -1;
            if (!a.isFromFollowedClient && b.isFromFollowedClient) return 1;
            return b.createdAt.toMillis() - a.createdAt.toMillis();
          });
          setGigs(finalGigs);

        } else {
          // If not a student or profile not loaded, show all open gigs (they are already sorted by createdAt)
          setGigs(allOpenGigs);
        }

      } catch (err: any) {
        console.error("Error fetching gigs:", err);
        setError("Failed to load gigs. Please try again later. This might be due to a missing Firestore index. Check the console for a link to create it.");
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading) {
        fetchAndFilterGigs();
    } else {
        setIsLoading(true); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser, role, userProfile]);

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
    <div
      className="relative min-h-[calc(100vh-4rem)] w-screen ml-[calc(50%-50vw)] bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: "url('https://picsum.photos/seed/modernoffice/1920/1080')" }}
      data-ai-hint="modern office"
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm"></div>
      
      <div className="container mx-auto px-4 py-8 relative z-10 space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-center text-foreground pt-8">Explore Gigs</h1>
        
        {gigs.length === 0 && !pageIsLoading ? (
          <Card className="glass-card text-center py-10 max-w-lg mx-auto mt-4">
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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pb-8"> {/* Removed px-4 from here as container provides it */}
            {gigs.map((gig) => (
              <Card key={gig.id} className="glass-card flex flex-col"> 
                <CardHeader>
                  <div className="flex justify-between items-start">
                      <Link href={`/gigs/${gig.id}`} className="hover:underline flex-grow mr-2">
                        <CardTitle className="text-lg line-clamp-2">{gig.title}</CardTitle>
                      </Link>
                      {gig.isFromFollowedClient && (
                          <Badge variant="outline" className="text-xs border-primary text-primary ml-auto shrink-0 flex items-center gap-1">
                              <Star className="h-3 w-3" /> Following
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
    </div>
  );
}

    