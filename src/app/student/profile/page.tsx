
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form'; // Removed useFieldArray
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, updateDoc } from 'firebase/firestore'; // Removed getDoc as profile comes from context
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2 } from 'lucide-react'; // PlusCircle and Trash2 might be unused now
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills'; // Import new component
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants'; // Import predefined skills

const portfolioLinkSchema = z.object({
  value: z.string().url({ message: 'Invalid URL format' }).or(z.literal('')),
});

const profileSchema = z.object({
  username: z.string().min(3, { message: 'Username must be at least 3 characters' }),
  bio: z.string().max(500, { message: 'Bio cannot exceed 500 characters' }).optional().or(z.literal('')),
  skills: z.array(z.string()).max(15, { message: 'Maximum 15 skills allowed' }).optional(), // Skills are now selected from predefined list
  portfolioLinks: z.array(portfolioLinkSchema).max(5, { message: 'Maximum 5 portfolio links allowed' }).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function StudentProfilePage() {
  const { user, userProfile, loading: authLoading, role, refreshUserProfile } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false); // Renamed for clarity
  const [isFormReady, setIsFormReady] = useState(false);


  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: '',
      bio: '',
      skills: [],
      portfolioLinks: [],
    },
  });

   // Field array hook for portfolio links (skills handled by MultiSelectSkills)
   const { fields: linkFields, append: appendLink, remove: removeLink } = useForm<ProfileFormValues>().control.register ? useForm<ProfileFormValues>().control : useForm({
    defaultValues: { portfolioLinks: [] }
   }).control // Fallback if used outside a FormProvider initially, though Form should provide it
    // This is a bit of a workaround for useFieldArray needing control. Better to ensure Form is always parent.
    // A cleaner way: const { control } = form; and then pass control to useFieldArray
    // For now, let's assume 'form.control' is available when needed.
    // Corrected useFieldArray:
    const fieldArrayMethods = useForm<ProfileFormValues>().control; // Get control from useForm instance

    // This useEffect depends on userProfile. Let's use a more direct way if useFieldArray requires control immediately.
    // For portfolioLinks
    const portfolioLinksControl = form.control;
    const { fields: actualLinkFields, append: actualAppendLink, remove: actualRemoveLink } = useFieldArray({
        control: portfolioLinksControl,
        name: "portfolioLinks"
    });


   useEffect(() => {
     if (!authLoading) {
       if (!user || role !== 'student') {
         router.push('/auth/login');
       } else if (userProfile) {
         form.reset({
           username: userProfile.username || user.email?.split('@')[0] || '',
           bio: userProfile.bio || '',
           skills: (userProfile.skills as Skill[]) || [],
           portfolioLinks: userProfile.portfolioLinks?.map(link => ({ value: link })) || [],
         });
         setIsFormReady(true);
       } else {
         // User is student, but profile is null (maybe new user or fetch issue)
         form.reset({ // Reset with some defaults if profile is missing
             username: user.email?.split('@')[0] || '',
             bio: '',
             skills: [],
             portfolioLinks: [],
         });
         setIsFormReady(true);
       }
     }
   }, [user, userProfile, authLoading, role, router, form]);

  const onSubmit = async (data: ProfileFormValues) => {
    if (!user) return;
    setIsSubmitting(true);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updateData = {
        username: data.username,
        bio: data.bio || '',
        skills: data.skills || [],
        portfolioLinks: data.portfolioLinks?.map(link => link.value).filter(Boolean) || [],
        profileUpdatedAt: new Date(),
      };

      await updateDoc(userDocRef, updateData);

      toast({
        title: 'Profile Updated',
        description: 'Your profile has been successfully saved.',
      });
      if (refreshUserProfile) {
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
      setIsSubmitting(false);
    }
  };

   const getInitials = (email: string | null | undefined, username?: string | null) => {
     if (username) return username.substring(0, 2).toUpperCase();
     if (email) return email.substring(0, 2).toUpperCase();
     return '??';
   };

   if (authLoading || !isFormReady) {
     return (
        <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
     );
   }

  return (
    <div className="max-w-3xl mx-auto py-8">
       <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-center gap-4">
             <Avatar className="h-20 w-20">
               <AvatarImage src={userProfile?.profilePictureUrl} alt={userProfile?.username || 'User'} />
               <AvatarFallback className="text-2xl">{getInitials(user?.email, userProfile?.username)}</AvatarFallback>
             </Avatar>
             <div className='text-center sm:text-left'>
               <CardTitle className="text-2xl">Edit Your Profile</CardTitle>
               <CardDescription>Keep your information up-to-date to attract clients.</CardDescription>
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
                      <Textarea placeholder="Tell clients about yourself (max 500 chars)" {...field} value={field.value ?? ''} rows={4} />
                    </FormControl>
                     <FormDescription>A short introduction about your skills and experience.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="skills"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Skills</FormLabel>
                    <FormControl>
                      <MultiSelectSkills
                        options={PREDEFINED_SKILLS}
                        selected={(field.value as Skill[]) || []}
                        onChange={field.onChange}
                        placeholder="Select your skills"
                        maxSkills={15}
                      />
                    </FormControl>
                    <FormDescription>List your key skills (max 15).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

               <div>
                 <FormLabel>Portfolio Links</FormLabel>
                 <div className="space-y-2 mt-2">
                   {actualLinkFields.map((field, index) => (
                     <div key={field.id} className="flex items-center gap-2">
                       <FormField
                         control={form.control}
                         name={`portfolioLinks.${index}.value`}
                         render={({ field: linkField }) => (
                           <FormItem className="flex-1">
                              <FormControl>
                               <Input placeholder="https://your-portfolio.com" {...linkField} value={linkField.value ?? ''} />
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
                         onClick={() => actualRemoveLink(index)}
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
                   onClick={() => actualAppendLink({ value: '' })}
                   disabled={actualLinkFields.length >= 5}
                 >
                   <PlusCircle className="mr-2 h-4 w-4" /> Add Link
                 </Button>
                  <FormMessage>{form.formState.errors.portfolioLinks?.message || (form.formState.errors.portfolioLinks as any)?.root?.message}</FormMessage>
                 <FormDescription className="mt-1">Links to your work (GitHub, Behance, personal site, etc. max 5).</FormDescription>
               </div>

              <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
