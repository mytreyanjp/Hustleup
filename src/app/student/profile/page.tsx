
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, updateDoc } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Trash2, UploadCloud } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants';
import { Progress } from '@/components/ui/progress';
import type { UserProfile } from '@/context/firebase-context';
import Link from 'next/link'; // Added Link

const portfolioLinkSchema = z.object({
  value: z.string().url({ message: 'Invalid URL format' }).or(z.literal('')),
});

const profileSchema = z.object({
  username: z.string().min(3, { message: 'Username must be at least 3 characters' }),
  bio: z.string().max(500, { message: 'Bio cannot exceed 500 characters' }).optional().or(z.literal('')),
  skills: z.array(z.string()).max(15, { message: 'Maximum 15 skills allowed' }).optional(),
  portfolioLinks: z.array(portfolioLinkSchema).max(5, { message: 'Maximum 5 portfolio links allowed' }).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function StudentProfilePage() {
  const { user, userProfile, loading: authLoading, role, refreshUserProfile } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormReady, setIsFormReady] = useState(false);

  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      username: '',
      bio: '',
      skills: [],
      portfolioLinks: [],
    },
  });

  const { fields: actualLinkFields, append: actualAppendLink, remove: actualRemoveLink } = useFieldArray({
    control: form.control,
    name: "portfolioLinks"
  });


   useEffect(() => {
     if (!authLoading) {
       if (!user || role !== 'student') {
         router.push('/auth/login?redirect=/student/profile');
       } else if (userProfile) {
         form.reset({
           username: userProfile.username || user.email?.split('@')[0] || '',
           bio: userProfile.bio || '',
           skills: (userProfile.skills as Skill[]) || [],
           portfolioLinks: userProfile.portfolioLinks?.map(link => ({ value: link })) || [],
         });
         setImagePreview(userProfile.profilePictureUrl || null);
         setIsFormReady(true);
       } else if (user && !userProfile) { // User exists but profile hasn't loaded or is null (new user edge case)
         form.reset({ // Initialize with some defaults from auth if profile is missing
             username: user.email?.split('@')[0] || '',
             bio: '',
             skills: [],
             portfolioLinks: [],
         });
         setIsFormReady(true); // Allow form to render
       }
     }
   }, [user, userProfile, authLoading, role, router, form]);

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Image Too Large", description: "Please select an image smaller than 5MB.", variant: "destructive"});
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        toast({ title: "Invalid File Type", description: "Please select a JPG, PNG, WEBP, or GIF image.", variant: "destructive"});
        return;
      }
      setSelectedImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleImageUpload = async () => {
    if (!selectedImageFile || !user) {
      toast({ title: "No Image Selected", description: "Please select an image file to upload.", variant: "destructive" });
      return;
    }
    if (!storage) {
      toast({ title: "Storage Error", description: "Firebase Storage is not configured.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const filePath = `profile_pictures/${user.uid}/${Date.now()}_${selectedImageFile.name}`;
    const fileStorageRef = storageRef(storage, filePath);
    const uploadTask = uploadBytesResumable(fileStorageRef, selectedImageFile);

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(progress);
      },
      (error) => {
        console.error("Image upload error:", error);
        toast({ title: "Upload Failed", description: `Could not upload image: ${error.message}`, variant: "destructive" });
        setIsUploading(false);
        setUploadProgress(null);
        setSelectedImageFile(null); // Clear selection on error
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const userDocRef = doc(db, 'users', user.uid);
          await updateDoc(userDocRef, {
            profilePictureUrl: downloadURL,
            profileUpdatedAt: new Date(), // Use Firestore server timestamp if preferred
          });
          toast({ title: "Profile Picture Updated!", description: "Your new picture is now live." });
          if (refreshUserProfile) await refreshUserProfile(); // Refresh context to show new pic
          setSelectedImageFile(null); // Clear selection on success
        } catch (updateError: any) {
          console.error("Error updating profile picture URL in Firestore:", updateError);
          toast({ title: "Update Failed", description: `Could not save profile picture: ${updateError.message}`, variant: "destructive" });
        } finally {
          setIsUploading(false);
          setUploadProgress(null);
        }
      }
    );
  };


  const onSubmit = async (data: ProfileFormValues) => {
    if (!user) return;
    setIsSubmitting(true);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updateData: Partial<UserProfile> = { 
        username: data.username,
        bio: data.bio || '', // Ensure empty string if undefined
        skills: data.skills || [],
        portfolioLinks: data.portfolioLinks?.map(link => link.value).filter(Boolean) || [], // Filter out empty strings
        profileUpdatedAt: new Date(), // Use Firestore server timestamp if preferred
      };

      // If a new image was uploaded and its URL is in imagePreview (and not yet in userProfile from context refresh)
      // OR if userProfile context already has the latest pic URL
      if (imagePreview && userProfile?.profilePictureUrl !== imagePreview && selectedImageFile) {
         // This case is less likely if handleImageUpload updates context correctly,
         // but as a fallback, or if picture was uploaded but form not saved yet.
         // Ideally, handleImageUpload refreshes context, and then userProfile.profilePictureUrl is used.
         // For now, assume userProfile.profilePictureUrl is the source of truth after an upload.
      }
       if (userProfile?.profilePictureUrl) {
           updateData.profilePictureUrl = userProfile.profilePictureUrl;
       }


      await updateDoc(userDocRef, updateData);

      toast({
        title: 'Profile Updated',
        description: 'Your profile details have been successfully saved.',
      });
      if (refreshUserProfile) { // Refresh context AFTER successful save
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

   if (authLoading || !isFormReady) { // Wait for auth and form readiness (profile data loaded)
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
             <div className="relative group">
                <Avatar className="h-24 w-24 sm:h-28 sm:w-28 text-3xl border-2 border-muted shadow-md">
                  <AvatarImage src={imagePreview || userProfile?.profilePictureUrl} alt={userProfile?.username || 'User'} />
                  <AvatarFallback>{getInitials(user?.email, userProfile?.username)}</AvatarFallback>
                </Avatar>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 h-8 w-8 p-0 rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                    onClick={() => fileInputRef.current?.click()}
                    title="Change profile picture"
                    disabled={isUploading}
                >
                    <UploadCloud className="h-4 w-4" />
                </Button>
             </div>
             <input 
                type="file" 
                ref={fileInputRef} 
                hidden 
                accept="image/png, image/jpeg, image/webp, image/gif" 
                onChange={handleImageFileChange}
             />
             <div className='text-center sm:text-left flex-grow'>
               <CardTitle className="text-2xl">Edit Your Profile</CardTitle>
               <CardDescription>Keep your information up-to-date to attract clients.</CardDescription>
                {selectedImageFile && !isUploading && (
                    <Button onClick={handleImageUpload} size="sm" className="mt-2">
                        <UploadCloud className="mr-2 h-4 w-4" /> Upload New Picture
                    </Button>
                )}
                {isUploading && uploadProgress !== null && (
                    <div className="mt-2 space-y-1">
                        <Progress value={uploadProgress} className="w-full h-2" />
                        <p className="text-xs text-muted-foreground text-center">Uploading: {uploadProgress.toFixed(0)}%</p>
                    </div>
                )}
             </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href={`/profile/${user?.uid}`}>View My Public Profile</Link>
            </Button>
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

              <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting || isUploading}>
                {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
