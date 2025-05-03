"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea'; // Assuming Textarea exists
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge'; // For displaying skills

const profileSchema = z.object({
  username: z.string().min(3, { message: 'Username must be at least 3 characters' }),
  // profilePictureUrl: z.string().url({ message: 'Invalid URL' }).optional().or(z.literal('')), // Handle image upload later
  bio: z.string().max(500, { message: 'Bio cannot exceed 500 characters' }).optional().or(z.literal('')),
  skills: z.array(z.string().min(1, { message: 'Skill cannot be empty' })).max(15, { message: 'Maximum 15 skills allowed' }).optional(),
  portfolioLinks: z.array(z.object({
    value: z.string().url({ message: 'Invalid URL format' }).or(z.literal('')),
  })).max(5, { message: 'Maximum 5 portfolio links allowed' }).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function StudentProfilePage() {
  const { user, userProfile, loading, role, refreshUserProfile } = useFirebase(); // Assume refreshUserProfile exists
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(true);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: '',
      bio: '',
      skills: [],
      portfolioLinks: [],
    },
  });

   // Field array hooks
   const { fields: skillFields, append: appendSkill, remove: removeSkill } = useFieldArray({
     control: form.control,
     name: "skills"
   });
    const { fields: linkFields, append: appendLink, remove: removeLink } = useFieldArray({
     control: form.control,
     name: "portfolioLinks"
   });


   // Protect route and fetch initial profile data
   useEffect(() => {
     if (!loading) {
       if (!user || role !== 'student') {
         router.push('/auth/login');
       } else if (userProfile) {
         // Populate form with existing profile data
         form.reset({
           username: userProfile.username || '',
           bio: userProfile.bio || '',
           skills: userProfile.skills || [],
           portfolioLinks: userProfile.portfolioLinks?.map(link => ({ value: link })) || [],
         });
         setIsFetchingProfile(false);
       } else {
         // Still waiting for profile data from context, or profile doesn't exist yet
          setIsFetchingProfile(false); // Assume profile fetch failed or is new
       }
     }
   }, [user, userProfile, loading, role, router, form]);

  const onSubmit = async (data: ProfileFormValues) => {
    if (!user) return;
    setIsLoading(true);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updateData = {
        username: data.username,
        bio: data.bio || '',
        skills: data.skills || [],
        portfolioLinks: data.portfolioLinks?.map(link => link.value).filter(Boolean) || [], // Store only valid URLs
        profileUpdatedAt: new Date(), // Add an updated timestamp
      };

      await updateDoc(userDocRef, updateData);

      toast({
        title: 'Profile Updated',
        description: 'Your profile has been successfully saved.',
      });

      // Optionally refresh the profile data in the context
       if (refreshUserProfile) { // Check if refresh function exists
           await refreshUserProfile();
       }


    } catch (error: any) {
      console.error('Profile update error:', error);
      toast({
        title: 'Update Failed',
        description: `Could not update profile: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

   const getInitials = (email: string | null | undefined) => {
     if (!email) return '??';
     return email.substring(0, 2).toUpperCase();
   };


   if (isFetchingProfile || loading) {
     return (
        <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
     );
   }

  return (
    <div className="max-w-3xl mx-auto">
       <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-center gap-4">
             <Avatar className="h-20 w-20">
               <AvatarImage src={userProfile?.profilePictureUrl} alt={userProfile?.username || 'User'} />
               <AvatarFallback className="text-2xl">{getInitials(user?.email)}</AvatarFallback>
             </Avatar>
             <div className='text-center sm:text-left'>
               <CardTitle className="text-2xl">Edit Your Profile</CardTitle>
               <CardDescription>Keep your information up-to-date to attract clients.</CardDescription>
               {/* TODO: Add profile picture upload functionality */}
               <Button variant="outline" size="sm" className="mt-2" disabled>Upload Picture (Soon)</Button>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input placeholder="Your public username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Tell clients about yourself (max 500 chars)" {...field} rows={4} />
                    </FormControl>
                     <FormDescription>A short introduction about your skills and experience.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

               {/* Skills Section */}
               <div>
                 <FormLabel>Skills</FormLabel>
                 <div className="flex flex-wrap gap-2 mt-2 mb-2">
                   {skillFields.map((field, index) => (
                     <div key={field.id} className="flex items-center gap-1">
                       <FormField
                         control={form.control}
                         name={`skills.${index}`}
                         render={({ field: skillField }) => (
                           <Input
                             {...skillField}
                             placeholder="e.g., React, Design"
                             className="h-8 text-sm"
                           />
                         )}
                       />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                           className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => removeSkill(index)}
                        >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                     </div>
                   ))}
                 </div>
                 <Button
                   type="button"
                   variant="outline"
                   size="sm"
                   onClick={() => appendSkill('')}
                   disabled={skillFields.length >= 15}
                 >
                   <PlusCircle className="mr-2 h-4 w-4" /> Add Skill
                 </Button>
                 <FormMessage>{form.formState.errors.skills?.message || form.formState.errors.skills?.root?.message}</FormMessage>
                 <FormDescription className="mt-1">List your key skills (max 15).</FormDescription>
               </div>


                {/* Portfolio Links Section */}
               <div>
                 <FormLabel>Portfolio Links</FormLabel>
                 <div className="space-y-2 mt-2">
                   {linkFields.map((field, index) => (
                     <div key={field.id} className="flex items-center gap-2">
                       <FormField
                         control={form.control}
                         name={`portfolioLinks.${index}.value`}
                         render={({ field: linkField }) => (
                           <FormItem className="flex-1">
                              <FormControl>
                               <Input placeholder="https://your-portfolio.com" {...linkField} />
                               </FormControl>
                             <FormMessage />
                           </FormItem>
                         )}
                       />
                       <Button
                         type="button"
                         variant="ghost"
                         size="icon"
                          className="h-9 w-9 text-destructive hover:bg-destructive/10"
                         onClick={() => removeLink(index)}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                     </div>
                   ))}
                 </div>
                 <Button
                   type="button"
                   variant="outline"
                   size="sm"
                   className="mt-2"
                   onClick={() => appendLink({ value: '' })}
                   disabled={linkFields.length >= 5}
                 >
                   <PlusCircle className="mr-2 h-4 w-4" /> Add Link
                 </Button>
                  <FormMessage>{form.formState.errors.portfolioLinks?.message || form.formState.errors.portfolioLinks?.root?.message}</FormMessage>
                 <FormDescription className="mt-1">Links to your work (GitHub, Behance, personal site, etc. max 5).</FormDescription>
               </div>


              <Button type="submit" className="w-full sm:w-auto" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

// Extend FirebaseContextType in firebase-context.tsx to include refreshUserProfile
// Example in firebase-context.tsx:
/*
interface FirebaseContextType {
  // ... other fields
  refreshUserProfile: () => Promise<void>; // Add this
}

// In FirebaseProvider:
const refreshUserProfile = async () => {
    if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                 const profileData = { uid: user.uid, email: user.email, ...docSnap.data() } as UserProfile;
                 setUserProfile(profileData);
                 setRole(profileData.role || null);
            } else {
                 setUserProfile({ uid: user.uid, email: user.email, role: null });
                 setRole(null);
            }
        } catch (error) {
            console.error("Error refreshing user profile:", error);
             setUserProfile({ uid: user.uid, email: user.email, role: null });
             setRole(null);
        }
    }
};

const value = { user, userProfile, loading, role, refreshUserProfile }; // Include in context value
*/

