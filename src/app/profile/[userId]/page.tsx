"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Link as LinkIcon, ArrowLeft, GraduationCap, MessageSquare } from 'lucide-react';
import type { UserProfile } from '@/context/firebase-context'; // Import the type
import { useFirebase } from '@/context/firebase-context'; // To check if viewer is client

export default function PublicProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const router = useRouter();
  const { user: viewerUser, role: viewerRole } = useFirebase(); // Get viewer info

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
           // Ensure only student profiles are publicly viewable this way
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
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

      <Card className="glass-card overflow-hidden">
        <CardHeader className="bg-muted/30 p-6">
           <div className="flex flex-col sm:flex-row items-center gap-6">
               <Avatar className="h-24 w-24 border-4 border-background shadow-md">
                  <AvatarImage src={profile.profilePictureUrl} alt={profile.username || 'Student'} />
                   <AvatarFallback className="text-3xl">{getInitials(profile.email, profile.username)}</AvatarFallback>
               </Avatar>
               <div className="text-center sm:text-left">
                   <CardTitle className="text-2xl flex items-center gap-2 justify-center sm:justify-start">
                       {profile.username || 'Student Profile'}
                       <GraduationCap className="h-6 w-6 text-primary" />
                   </CardTitle>
                   {/* Optional: Add location or join date */}
                    <CardDescription className="mt-1">{profile.email}</CardDescription>
                    {viewerRole === 'client' && (
                         <Button size="sm" asChild className="mt-3">
                             <Link href={`/chat?userId=${profile.uid}`}>
                                <MessageSquare className="mr-1 h-4 w-4" /> Contact Student
                             </Link>
                         </Button>
                    )}
               </div>
           </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
           {profile.bio && (
              <div>
                 <h3 className="font-semibold mb-2 text-lg">About Me</h3>
                 <p className="text-sm text-foreground/90 whitespace-pre-wrap">{profile.bio}</p>
              </div>
           )}

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
                         href={link}
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
      </Card>

       {/* Potential Future Section: Gig History / Reviews */}

    </div>
  );
}

