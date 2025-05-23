
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Link as LinkIcon, ArrowLeft, GraduationCap, MessageSquare, Grid3X3 } from 'lucide-react';
import type { UserProfile } from '@/context/firebase-context'; 
import { useFirebase } from '@/context/firebase-context'; 
import { Separator } from '@/components/ui/separator';

export default function PublicProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const router = useRouter();
  const { user: viewerUser, role: viewerRole } = useFirebase(); 

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setError("User ID is missing.");
      setIsLoading(false);
      return;
    }

    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const userDocRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
           const fetchedProfile = { uid: docSnap.id, ...docSnap.data() } as UserProfile;
           if (fetchedProfile.role === 'student') {
              setProfile(fetchedProfile);
           } else {
              setError("Profile not found or not viewable.");
              setProfile(null);
           }
        } else {
          setError("Profile not found.");
        }
      } catch (err: any) {
        console.error("Error fetching profile:", err);
        setError("Failed to load profile details. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

   const getInitials = (email: string | null | undefined, username?: string | null) => {
     if (username) return username.substring(0, 2).toUpperCase();
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

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

      <Card className="glass-card overflow-hidden">
        <CardHeader className="p-4 md:p-6">
           <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
               <Avatar className="h-20 w-20 sm:h-32 sm:w-32 text-4xl border-2 border-background shadow-md">
                  <AvatarImage src={profile.profilePictureUrl} alt={profile.username || 'Student'} />
                   <AvatarFallback>{getInitials(profile.email, profile.username)}</AvatarFallback>
               </Avatar>
               <div className="sm:flex-1 space-y-2 text-center sm:text-left">
                   <div className='flex flex-col sm:flex-row items-center sm:justify-between gap-2'>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            {profile.username || 'Student Profile'}
                            <GraduationCap className="h-6 w-6 text-primary" />
                        </h1>
                        {viewerRole === 'client' && viewerUser?.uid !== profile.uid && (
                            <Button size="sm" asChild className="w-full sm:w-auto">
                                <Link href={`/chat?userId=${profile.uid}`}>
                                    <MessageSquare className="mr-1 h-4 w-4" /> Contact Student
                                </Link>
                            </Button>
                        )}
                         {viewerUser?.uid === profile.uid && (
                            <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
                                <Link href={`/student/profile`}>
                                    Edit Profile
                                </Link>
                            </Button>
                        )}
                   </div>
                   {/* Placeholder for stats like Posts, Followers, Following */}
                   {/* <div className="flex justify-center sm:justify-start gap-4 text-sm text-muted-foreground mt-2">
                       <span><span className="font-semibold text-foreground">0</span> posts</span>
                       <span><span className="font-semibold text-foreground">0</span> followers</span>
                       <span><span className="font-semibold text-foreground">0</span> following</span>
                   </div> */}
                   {profile.bio && (
                        <p className="text-sm text-foreground/90 mt-2">{profile.bio}</p>
                   )}
               </div>
           </div>
        </CardHeader>
        
        <Separator />

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
        
        {/* Placeholder for Tabbed Content (Posts, About, etc.) */}
        <Separator />
        <div className="p-4 md:p-6 text-center text-muted-foreground">
            <Grid3X3 className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">Student posts will appear here soon!</p>
            <p className="text-xs">(Feature under development)</p>
        </div>
      </Card>
    </div>
  );
}
