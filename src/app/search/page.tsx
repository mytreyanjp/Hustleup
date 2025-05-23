
"use client";

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search as SearchIconLucide, Briefcase, Users, CalendarDays, DollarSign } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Skill } from '@/lib/constants';
import type { UserProfile } from '@/context/firebase-context';

interface GigSearchResult {
  id: string;
  title: string;
  description: string;
  budget: number;
  currency: string;
  deadline: Timestamp;
  requiredSkills: Skill[];
  clientUsername?: string;
  createdAt: Timestamp;
}

interface UserSearchResult extends UserProfile {}

function SearchResultsPageContent() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q');
  const { user: currentUser, loading: authLoading } = useFirebase();

  const [gigs, setGigs] = useState<GigSearchResult[]>([]);
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchQuery || searchQuery.trim() === "") {
      setGigs([]);
      setUsers([]);
      setIsLoading(false);
      return;
    }

    const fetchResults = async () => {
      setIsLoading(true);
      setError(null);
      const lowerSearchTerm = searchQuery.toLowerCase();

      try {
        // Fetch Gigs
        const gigsCollectionRef = collection(db, 'gigs');
        const gigsQuery = query(gigsCollectionRef, where('status', '==', 'open'), orderBy('createdAt', 'desc'));
        const gigsSnapshot = await getDocs(gigsQuery);
        const allOpenGigs = gigsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as GigSearchResult[];

        const filteredGigs = allOpenGigs.filter(gig => {
          const titleMatch = gig.title.toLowerCase().includes(lowerSearchTerm);
          const descriptionMatch = gig.description.toLowerCase().includes(lowerSearchTerm);
          const skillsMatch = gig.requiredSkills.some(skill => skill.toLowerCase().includes(lowerSearchTerm));
          return titleMatch || descriptionMatch || skillsMatch;
        });
        setGigs(filteredGigs);

        // Fetch Users
        const usersCollectionRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollectionRef);
        const allUsers = usersSnapshot.docs.map(doc => ({
          uid: doc.id, // Ensure uid is mapped correctly
          ...doc.data(),
        })) as UserSearchResult[];


        const filteredUsers = allUsers.filter(userDoc => {
          const usernameMatch = userDoc.username?.toLowerCase().includes(lowerSearchTerm);
          let skillsMatch = false;
          if (userDoc.role === 'student' && userDoc.skills) {
            skillsMatch = userDoc.skills.some((skill: string) => skill.toLowerCase().includes(lowerSearchTerm));
          }
          // Exclude current user from search results
          if (currentUser && userDoc.uid === currentUser.uid) return false;
          
          return usernameMatch || skillsMatch;
        });
        setUsers(filteredUsers);

      } catch (err: any) {
        console.error("Error fetching search results:", err);
        setError("Failed to load search results. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [searchQuery, currentUser]);

  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
  };

  const formatDeadline = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
   };

  const getInitials = (email: string | null | undefined, username?: string | null) => {
     if (username) return username.substring(0, 2).toUpperCase();
     if (email) return email.substring(0, 2).toUpperCase();
     return '??';
   };

  if (authLoading) { // Still wait for auth to load to avoid showing current user in results briefly
    return <div className="flex justify-center items-center min-h-[calc(100vh-15rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }


  if (isLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-15rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }

  if (error) {
    return <div className="text-center py-10 text-destructive"><p>{error}</p></div>;
  }

  if (!searchQuery || searchQuery.trim() === "") {
    return (
      <div className="text-center py-10">
        <SearchIconLucide className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Enter a search term to find gigs or users.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Search Results for "{searchQuery}"</h1>

      {/* Gigs Section */}
      <section>
        <h2 className="text-2xl font-semibold tracking-tight mb-4 flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-primary" /> Matching Gigs ({gigs.length})
        </h2>
        {gigs.length === 0 ? (
          <p className="text-muted-foreground">No gigs found matching your search criteria.</p>
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
                <CardContent className="flex-grow space-y-2">
                  <p className="text-sm line-clamp-3">{gig.description}</p>
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1">Required Skills:</h4>
                    <div className="flex flex-wrap gap-1">
                      {gig.requiredSkills?.slice(0, 5).map((skill, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">{skill}</Badge>
                      ))}
                      {gig.requiredSkills?.length > 5 && <Badge variant="outline" className="text-xs">+{gig.requiredSkills.length - 5} more</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <DollarSign className="mr-1 h-4 w-4" /> Budget: {gig.currency} {gig.budget.toFixed(2)}
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <CalendarDays className="mr-1 h-4 w-4" /> Deadline: {formatDeadline(gig.deadline)}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full">
                    <Link href={`/gigs/${gig.id}`}>View Details</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="my-8 border-t"></div>

      {/* Users Section */}
      <section>
        <h2 className="text-2xl font-semibold tracking-tight mb-4 flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" /> Matching Users ({users.length})
        </h2>
        {users.length === 0 ? (
          <p className="text-muted-foreground">No users found matching your search criteria.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {users.map((userResult) => (
              <Card key={userResult.uid} className="glass-card">
                <CardHeader className="items-center text-center">
                  <Avatar className="h-20 w-20 mb-2">
                    <AvatarImage src={userResult.profilePictureUrl} alt={userResult.username || 'User'} />
                    <AvatarFallback>{getInitials(userResult.email, userResult.username)}</AvatarFallback>
                  </Avatar>
                  <CardTitle className="text-lg">{userResult.username || 'User'}</CardTitle>
                  <CardDescription className="capitalize">{userResult.role}</CardDescription>
                </CardHeader>
                {userResult.role === 'student' && userResult.skills && userResult.skills.length > 0 && (
                  <CardContent className="text-center">
                     <h4 className="text-xs font-semibold text-muted-foreground mb-1">Top Skills:</h4>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {userResult.skills.slice(0, 3).map((skill: string, index: number) => (
                        <Badge key={index} variant="secondary" className="text-xs">{skill}</Badge>
                      ))}
                       {userResult.skills.length > 3 && <Badge variant="outline" className="text-xs">+{userResult.skills.length - 3} more</Badge>}
                    </div>
                  </CardContent>
                )}
                <CardFooter>
                  {userResult.role === 'student' ? (
                     <Button asChild className="w-full" variant="outline">
                        <Link href={`/profile/${userResult.uid}`}>View Profile</Link>
                     </Button>
                  ) : (
                    // Clients might not have public profiles in the same way, or could link to company page later
                    <p className="text-sm text-muted-foreground w-full text-center">Client profile (details may be limited)</p>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


export default function SearchPage() {
  return (
    // Suspense is generally used for server components with client components that use useSearchParams
    // For a fully client-rendered page like this, it's less critical but good practice.
    <Suspense fallback={<div className="flex justify-center items-center min-h-[calc(100vh-15rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
      <SearchResultsPageContent />
    </Suspense>
  );
}

