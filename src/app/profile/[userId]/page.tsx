
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, orderBy, Timestamp, getDocs } from 'firebase/firestore'; 
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Link as LinkIcon, ArrowLeft, GraduationCap, MessageSquare, Grid3X3, Image as ImageIconLucide, Star as StarIcon, Building, Globe } from 'lucide-react'; 
import type { UserProfile } from '@/context/firebase-context'; 
import { useFirebase } from '@/context/firebase-context'; 
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import Image from 'next/image'; 
import { StarRating } from '@/components/ui/star-rating'; 

interface StudentPost {
  id: string;
  imageUrl: string;
  caption?: string;
  createdAt: Timestamp;
}

export default function PublicProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const router = useRouter();
  const { user: viewerUser, role: viewerRole } = useFirebase(); 

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<StudentPost[]>([]); 
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setError("User ID is missing.");
      setIsLoading(false);
      return;
    }

    const fetchProfileData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const userDocRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
           const fetchedProfile = { 
               uid: docSnap.id, 
               ...docSnap.data(),
               averageRating: docSnap.data().averageRating || 0,
               totalRatings: docSnap.data().totalRatings || 0,
            } as UserProfile;
           setProfile(fetchedProfile);

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
           }
        } else {
          setError("Profile not found.");
          setProfile(null);
        }
      } catch (err: any) {
        console.error("Error fetching profile:", err);
        setError("Failed to load profile details. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfileData();
  }, [userId]);

   const getInitials = (email: string | null | undefined, username?: string | null, companyName?: string | null) => {
     if (profile?.role === 'client' && companyName && companyName.trim() !== '') return companyName.substring(0, 2).toUpperCase();
     if (username && username.trim() !== '') return username.substring(0, 2).toUpperCase();
     if (email) return email.substring(0, 2).toUpperCase();
     return '??';
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
  const displayName = profile.role === 'client' ? (profile.companyName || profile.username || 'Client Profile') : (profile.username || 'Student Profile');

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
               <div className="sm:flex-1 space-y-1 text-center sm:text-left"> {/* Reduced space-y for tighter packing */}
                   <div className='flex flex-col sm:flex-row items-center sm:justify-between gap-2'>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            {displayName}
                            {profile.role === 'student' && <GraduationCap className="h-6 w-6 text-primary" />}
                            {profile.role === 'client' && <Building className="h-6 w-6 text-primary" />}
                        </h1>
                        {isOwnProfile ? (
                            <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
                                <Link href={profile.role === 'student' ? `/student/profile` : `/client/profile/edit`}> {/* TODO: Create /client/profile/edit if needed */}
                                    Edit My Profile
                                </Link>
                            </Button>
                        ) : viewerUser && profile.role && ( // Ensure profile.role exists
                            <Button size="sm" asChild className="w-full sm:w-auto">
                                <Link href={`/chat?userId=${profile.uid}`}>
                                    <MessageSquare className="mr-1 h-4 w-4" /> Contact {profile.role === 'student' ? 'Student' : 'Client'}
                                </Link>
                            </Button>
                        )}
                   </div>

                    {/* Client specific details */}
                    {profile.role === 'client' && (
                      <div className="mt-1 space-y-1">
                        {/* If displayName is already the companyName, this contact line is for when username is different (e.g. a specific contact person) */}
                        {profile.companyName && profile.username && profile.companyName !== profile.username && displayName === profile.companyName && (
                           <p className="text-sm text-muted-foreground">Contact Person: {profile.username}</p>
                        )}
                        {/* If displayName is the username because companyName was not set, and they want to show company name if it were different (less common) */}
                        {profile.companyName && displayName !== profile.companyName && (
                            <p className="text-sm text-muted-foreground">Company: {profile.companyName}</p>
                        )}
                        {profile.website && (
                          <a
                            href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1 justify-center sm:justify-start"
                          >
                            <Globe className="h-4 w-4 shrink-0" />
                            {profile.website}
                          </a>
                        )}
                      </div>
                    )}

                   {/* Student specific details */}
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
                    {/* Common Detail: Email */}
                    <p className="text-xs text-muted-foreground mt-1">Email: {profile.email}</p>
               </div>
           </div>
        </CardHeader>
        
        <Separator />

        {profile.role === 'student' && (
          <>
            <CardContent className="p-4 md:p-6 space-y-6">
               {profile.skills && profile.skills.length > 0 && (
                  <div>
                     <h3 className="font-semibold mb-2 text-lg">Skills</h3>
                     <div className="flex flex-wrap gap-2">
                       {profile.skills.map((skill, index) => (
                         <Badge key={index} variant="secondary" className="text-sm px-3 py-1">{skill}</Badge>
                       ))}
                     </div>
                  </div>
               )}

                {profile.portfolioLinks && profile.portfolioLinks.length > 0 && (
                  <div>
                     <h3 className="font-semibold mb-2 text-lg">Portfolio & Links</h3>
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
           <CardContent className="p-4 md:p-6">
                <h3 className="font-semibold mb-2 text-lg">About {displayName}</h3>
                <p className="text-sm text-muted-foreground">
                    This client posts gigs on HustleUp.
                </p>
                {/* Future: List client's open gigs here */}
           </CardContent>
        )}
      </Card>
    </div>
  );
}

    