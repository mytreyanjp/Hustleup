
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, orderBy, Timestamp, getDocs, updateDoc, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Link as LinkIcon, ArrowLeft, GraduationCap, MessageSquare, Grid3X3, Image as ImageIconLucide, Star as StarIcon, Building, Globe, Info, Briefcase, DollarSign, CalendarDays, UserPlus, UserCheck, Users } from 'lucide-react';
import type { UserProfile } from '@/context/firebase-context';
import { useFirebase } from '@/context/firebase-context';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import Image from 'next/image';
import { StarRating } from '@/components/ui/star-rating';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';


interface StudentPost {
  id: string;
  imageUrl: string;
  caption?: string;
  createdAt: Timestamp;
}

interface ClientGig {
  id: string;
  title: string;
  budget: number;
  currency: string;
  deadline: Timestamp;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  createdAt: Timestamp;
}

export default function PublicProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const router = useRouter();
  const { user: viewerUser, userProfile: viewerUserProfile, role: viewerRole, refreshUserProfile } = useFirebase();
  const { toast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<StudentPost[]>([]);
  const [clientOpenGigs, setClientOpenGigs] = useState<ClientGig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [isLoadingClientGigs, setIsLoadingClientGigs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowProcessing, setIsFollowProcessing] = useState(false);

  useEffect(() => {
    if (!userId) {
      setError("User ID is missing.");
      setIsLoading(false);
      return;
    }

    const fetchProfileData = async () => {
      setIsLoading(true);
      setError(null);
      setClientOpenGigs([]);

      try {
        const userDocRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
           const fetchedProfile = {
               uid: docSnap.id,
               ...docSnap.data(),
               averageRating: docSnap.data().averageRating || 0,
               totalRatings: docSnap.data().totalRatings || 0,
               following: docSnap.data().following || [],
               followersCount: docSnap.data().followersCount || 0,
            } as UserProfile;
           setProfile(fetchedProfile);

           if (viewerUserProfile && viewerUserProfile.following) {
             setIsFollowing(viewerUserProfile.following.includes(fetchedProfile.uid));
           }


           if (fetchedProfile.role === 'student') {
              setIsLoadingPosts(true);
              // IMPORTANT: This query requires a composite index in Firestore.
              // Collection: student_posts, Fields: studentId (Ascending), createdAt (Descending)
              // Create it via the link in the Firebase console error message if it's missing.
              const postsQuery = query(
                collection(db, 'student_posts'),
                where('studentId', '==', userId),
                orderBy('createdAt', 'desc')
              );
              const postsSnapshot = await getDocs(postsQuery);
              const fetchedPosts = postsSnapshot.docs.map(postDoc => ({
                id: postDoc.id,
                ...postDoc.data()
              })) as StudentPost[];
              setPosts(fetchedPosts);
              setIsLoadingPosts(false);
           } else if (fetchedProfile.role === 'client') {
              setIsLoadingClientGigs(true);
              // IMPORTANT: This query likely requires a composite index on 'gigs':
              // clientId (Ascending), status (Ascending), createdAt (Descending)
              const clientGigsQuery = query(
                collection(db, 'gigs'),
                where('clientId', '==', userId),
                where('status', '==', 'open'),
                orderBy('createdAt', 'desc')
              );
              const gigsSnapshot = await getDocs(clientGigsQuery);
              const fetchedClientGigs = gigsSnapshot.docs.map(gigDoc => ({
                id: gigDoc.id,
                ...gigDoc.data()
              })) as ClientGig[];
              setClientOpenGigs(fetchedClientGigs);
              setIsLoadingClientGigs(false);
           }
        } else {
          setError("Profile not found.");
          setProfile(null);
        }
      } catch (err: any) {
        console.error("Error fetching profile or related data:", err);
        setError("Failed to load profile details. Please try again later. This could be due to a missing Firestore index.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfileData();
  }, [userId, viewerUserProfile]); // Re-run if viewerUserProfile changes (e.g., after they follow/unfollow someone)

   const getInitials = (email: string | null | undefined, username?: string | null, companyName?: string | null) => {
     if (profile?.role === 'client' && companyName && companyName.trim() !== '') return companyName.substring(0, 2).toUpperCase();
     if (username && username.trim() !== '') return username.substring(0, 2).toUpperCase();
     if (email) return email.substring(0, 2).toUpperCase();
     return '??';
   };

  const formatGigDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) { return 'Invalid date'; }
  };

  const handleFollowToggle = async () => {
    if (!viewerUser || !viewerUserProfile || !profile || !db) {
      toast({ title: "Error", description: "You must be logged in to follow users.", variant: "destructive" });
      return;
    }
    if (viewerUser.uid === profile.uid) {
      toast({ title: "Action Not Allowed", description: "You cannot follow yourself.", variant: "destructive" });
      return;
    }

    setIsFollowProcessing(true);
    const viewerUserDocRef = doc(db, 'users', viewerUser.uid);
    const targetUserDocRef = doc(db, 'users', profile.uid);

    try {
      if (isFollowing) { // Unfollow action
        await updateDoc(viewerUserDocRef, { following: arrayRemove(profile.uid) });
        // IMPORTANT: For production, use a Cloud Function for atomicity.
        // This client-side update to another user's doc is simplified for this example.
        await updateDoc(targetUserDocRef, { followersCount: increment(-1) });
        toast({ title: "Unfollowed", description: `You are no longer following ${profile.companyName || profile.username || 'this user'}.` });
        setIsFollowing(false);
        setProfile(prev => prev ? { ...prev, followersCount: (prev.followersCount || 1) - 1 } : null);
      } else { // Follow action
        await updateDoc(viewerUserDocRef, { following: arrayUnion(profile.uid) });
        // IMPORTANT: For production, use a Cloud Function for atomicity.
        await updateDoc(targetUserDocRef, { followersCount: increment(1) });
        toast({ title: "Followed!", description: `You are now following ${profile.companyName || profile.username || 'this user'}.` });
        setIsFollowing(true);
        setProfile(prev => prev ? { ...prev, followersCount: (prev.followersCount || 0) + 1 } : null);
      }
      if (refreshUserProfile) await refreshUserProfile(); // Refresh viewer's profile in context
    } catch (err: any) {
      console.error("Error following/unfollowing user:", err);
      toast({ title: "Error", description: `Could not complete action: ${err.message}`, variant: "destructive" });
    } finally {
      setIsFollowProcessing(false);
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
      <div className="text-center py-10">
         <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
         </Button>
      </div>
    );
  }

  if (!profile) {
    return <div className="text-center py-10 text-muted-foreground">Profile not found.</div>;
  }

  const isOwnProfile = viewerUser?.uid === profile.uid;
  const displayName = profile.role === 'client'
    ? (profile.companyName || profile.username || 'Client Profile')
    : (profile.username || 'Student Profile');
  
  const followingCount = profile.following?.length || 0;


  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

      <Card className="glass-card overflow-hidden">
        <CardHeader className="p-4 md:p-6">
           <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
               <Avatar className="h-20 w-20 sm:h-32 sm:w-32 text-4xl border-2 border-background shadow-md">
                  <AvatarImage src={profile.profilePictureUrl} alt={displayName} />
                   <AvatarFallback>{getInitials(profile.email, profile.username, profile.companyName)}</AvatarFallback>
               </Avatar>
               <div className="sm:flex-1 space-y-2 text-center sm:text-left">
                   <div className='flex flex-col sm:flex-row items-center sm:justify-between gap-2'>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            {displayName}
                            {profile.role === 'student' && <GraduationCap className="h-6 w-6 text-primary" />}
                            {profile.role === 'client' && <Building className="h-6 w-6 text-primary" />}
                        </h1>
                        {isOwnProfile ? (
                            <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
                                <Link href={profile.role === 'student' ? `/student/profile` : `/client/profile/edit`}> {/* TODO: Create /client/profile/edit */}
                                    Edit My Profile
                                </Link>
                            </Button>
                        ) : viewerUser && profile.role && (
                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                <Button size="sm" onClick={handleFollowToggle} disabled={isFollowProcessing} className="w-full sm:w-auto">
                                  {isFollowProcessing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : (isFollowing ? <UserCheck className="mr-1 h-4 w-4" /> : <UserPlus className="mr-1 h-4 w-4" />)}
                                  {isFollowing ? 'Unfollow' : 'Follow'}
                                </Button>
                                <Button size="sm" asChild className="w-full sm:w-auto">
                                    <Link href={`/chat?userId=${profile.uid}`}>
                                        <MessageSquare className="mr-1 h-4 w-4" /> Contact
                                    </Link>
                                </Button>
                            </div>
                        )}
                   </div>
                   
                    <div className="flex items-center justify-center sm:justify-start gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span className="font-semibold text-foreground">{profile.followersCount || 0}</span> Followers
                        </span>
                        <span className="flex items-center gap-1">
                           <Users className="h-4 w-4" />
                           <span className="font-semibold text-foreground">{followingCount}</span> Following
                        </span>
                    </div>

                   {/* Display Contact Person if company name is different from username */}
                    {profile.role === 'client' && profile.companyName && profile.username && profile.companyName !== profile.username && (
                        <p className="text-sm text-muted-foreground mt-1">Contact: {profile.username}</p>
                    )}

                   {profile.role === 'student' && profile.bio && (
                        <p className="text-sm text-foreground/90 mt-1">{profile.bio}</p>
                   )}
                   {profile.role === 'student' && profile.averageRating !== undefined && profile.averageRating > 0 && profile.totalRatings !== undefined && profile.totalRatings > 0 && (
                        <div className="flex items-center gap-2 mt-1 justify-center sm:justify-start">
                            <StarRating value={profile.averageRating} size={18} isEditable={false} />
                            <span className="text-sm text-muted-foreground">
                                ({profile.averageRating.toFixed(1)} from {profile.totalRatings} rating{profile.totalRatings !== 1 ? 's' : ''})
                            </span>
                        </div>
                    )}
               </div>
           </div>
        </CardHeader>

        <Separator />

        {profile.role === 'client' && (
            <CardContent className="p-4 md:p-6 space-y-4">
                <h3 className="font-semibold text-lg text-foreground mb-2 flex items-center gap-2">
                    <Building className="h-5 w-5 text-muted-foreground" /> Company Details
                </h3>
                
                {profile.website ? (
                  <div className="flex items-start gap-2 mb-2">
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground mt-1" />
                    <div>
                        <p className="text-xs text-muted-foreground">Website</p>
                        <a
                        href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline break-all"
                        >
                        {profile.website}
                        </a>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">Website not provided.</p>
                  </div>
                )}

                {profile.companyDescription ? (
                    <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-1" />
                        <div>
                            <p className="text-xs text-muted-foreground">About Company</p>
                            <p className="text-sm whitespace-pre-wrap">{profile.companyDescription}</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <Info className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">Company description not provided.</p>
                    </div>
                )}
            </CardContent>
        )}


        {profile.role === 'student' && (
          <>
            <CardContent className="p-4 md:p-6 space-y-6">
               {profile.skills && profile.skills.length > 0 && (
                  <div>
                     <h3 className="font-semibold mb-2 text-lg flex items-center gap-2">
                        <Users className="h-5 w-5 text-muted-foreground" /> Skills
                     </h3>
                     <div className="flex flex-wrap gap-2">
                       {profile.skills.map((skill, index) => (
                         <Badge key={index} variant="secondary" className="text-sm px-3 py-1">{skill}</Badge>
                       ))}
                     </div>
                  </div>
               )}

                {profile.portfolioLinks && profile.portfolioLinks.length > 0 && (
                  <div>
                     <h3 className="font-semibold mb-2 text-lg flex items-center gap-2">
                        <LinkIcon className="h-5 w-5 text-muted-foreground" /> Portfolio & Links
                     </h3>
                     <ul className="space-y-2">
                       {profile.portfolioLinks.map((link, index) => (
                         <li key={index}>
                           <a
                             href={link.startsWith('http') ? link : `https://${link}`}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="text-sm text-primary hover:underline flex items-center gap-1 break-all"
                           >
                             <LinkIcon className="h-4 w-4 shrink-0" />
                             {link}
                           </a>
                         </li>
                       ))}
                     </ul>
                  </div>
               )}

               {!profile.bio && (!profile.skills || profile.skills.length === 0) && (!profile.portfolioLinks || profile.portfolioLinks.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">This student hasn't added detailed profile information yet.</p>
               )}
            </CardContent>

            <Separator />
            <div className="p-4 md:p-6">
                <h3 className="font-semibold mb-4 text-lg flex items-center gap-2">
                    <Grid3X3 className="h-5 w-5 text-muted-foreground" /> Posts
                </h3>
                {isLoadingPosts ? (
                    <div className="flex justify-center items-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : posts.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-2 md:gap-4">
                        {posts.map(post => (
                            <div key={post.id} className="aspect-square relative group overflow-hidden rounded-md">
                                <Image
                                    src={post.imageUrl}
                                    alt={post.caption || `Post by ${profile.username || 'user'}`}
                                    layout="fill"
                                    objectFit="cover"
                                    className="group-hover:scale-105 transition-transform duration-300"
                                    data-ai-hint="student content"
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-8">
                        <ImageIconLucide className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm">This student hasn't made any posts yet.</p>
                        {isOwnProfile && (
                            <Button asChild variant="link" className="mt-2">
                                <Link href="/student/posts/new">Create your first post</Link>
                            </Button>
                        )}
                    </div>
                )}
            </div>
          </>
        )}

        {profile.role === 'client' && (
            <>
                <Separator />
                <div className="p-4 md:p-6">
                    <h3 className="font-semibold mb-4 text-lg flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-muted-foreground" /> Open Gigs
                    </h3>
                    {isLoadingClientGigs ? (
                        <div className="flex justify-center items-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : clientOpenGigs.length > 0 ? (
                        <div className="space-y-4">
                            {clientOpenGigs.map(gig => (
                                <Card key={gig.id} className="glass-card">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-md">{gig.title}</CardTitle>
                                        <CardDescription className="text-xs">Posted {formatGigDate(gig.createdAt)}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-1 pb-3">
                                        <p className="text-sm flex items-center gap-1">
                                            <DollarSign className="h-4 w-4 text-muted-foreground" /> 
                                            Budget: {gig.currency} {gig.budget.toFixed(2)}
                                        </p>
                                        <p className="text-sm flex items-center gap-1">
                                            <CalendarDays className="h-4 w-4 text-muted-foreground" /> 
                                            Deadline: {gig.deadline.toDate().toLocaleDateString()}
                                        </p>
                                    </CardContent>
                                    <CardFooter>
                                        <Button asChild size="sm" className="w-full">
                                            <Link href={`/gigs/${gig.id}`}>View & Apply</Link>
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            <Briefcase className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                            <p className="text-sm">This client has no open gigs currently.</p>
                        </div>
                    )}
                </div>
            </>
        )}
      </Card>
    </div>
  );
}
