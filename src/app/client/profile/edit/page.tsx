
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Edit, User, Briefcase, Building, Globe, Info, Mail, Phone, ArrowLeft } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';

const clientProfileEditSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username cannot exceed 50 characters"),
  companyName: z.string().min(2, "Company name must be at least 2 characters").max(100, "Company name cannot exceed 100 characters"),
  website: z.string().url({ message: "Please enter a valid URL (e.g., https://example.com)" }).max(100).or(z.literal('')),
  companyDescription: z.string().min(20, "Company description must be at least 20 characters").max(500, "Company description cannot exceed 500 characters"),
  personalEmail: z.string().email({ message: 'Invalid email format' }).max(100).optional().or(z.literal('')),
  personalPhone: z.string().regex(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format (e.g., +1234567890)' }).max(20).optional().or(z.literal('')),
});

type ClientProfileEditFormValues = z.infer<typeof clientProfileEditSchema>;

export default function EditClientProfilePage() {
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

  const form = useForm<ClientProfileEditFormValues>({
    resolver: zodResolver(clientProfileEditSchema),
    defaultValues: {
      username: '',
      companyName: '',
      website: '',
      companyDescription: '',
      personalEmail: '',
      personalPhone: '',
    },
  });

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') {
        router.push('/auth/login?redirect=/client/profile/edit');
      } else if (userProfile) {
        form.reset({
          username: userProfile.username || user.email?.split('@')[0] || '',
          companyName: userProfile.companyName || '',
          website: userProfile.website || '',
          companyDescription: userProfile.companyDescription || '',
          personalEmail: userProfile.personalEmail || '',
          personalPhone: userProfile.personalPhone || '',
        });
        setImagePreview(userProfile.profilePictureUrl || null);
        setIsFormReady(true);
      }
    }
  }, [user, userProfile, authLoading, role, router, form]);

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast({ title: "Image Too Large", description: "Please select an image smaller than 5MB.", variant: "destructive" });
        return;
      }
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        toast({ title: "Invalid File Type", description: "Please select a JPG, PNG, WEBP, or GIF image.", variant: "destructive" });
        return;
      }
      setSelectedImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleImageUpload = async () => {
    if (!selectedImageFile || !user || !storage) {
      toast({ title: "Upload Error", description: "No image selected or storage service unavailable. Check Firebase setup.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    const filePath = `profile_pictures/${user.uid}/${Date.now()}_${selectedImageFile.name}`;
    const fileStorageRefInstance = storageRefFn(storage, filePath);

    const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedImageFile);

    uploadTask.on('state_changed',
      (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
      (error: any) => {
        console.error("Firebase Storage Upload Error (Client Profile Pic):", error);
        let detailedErrorMessage = `Could not upload image. Code: ${error.code || 'UNKNOWN'}. Message: ${error.message || 'No message'}.`;
        let toastTitle = "Upload Failed";
        let duration = 15000;

        switch (error.code) {
          case 'storage/unauthorized':
            detailedErrorMessage = "Upload failed: Permission denied. CRITICAL: Check Firebase Storage rules for 'profile_pictures/{userId}/...'. Ensure they allow authenticated users to write. Also, check your login status. If on Spark plan and cannot access Rules tab, you may need to upgrade to Blaze plan for full Storage functionality.";
            break;
          case 'storage/canceled': detailedErrorMessage = "Upload canceled."; break;
          case 'storage/object-not-found': detailedErrorMessage = "Upload failed: Path or object not found. Check Storage bucket config or rules."; break;
          case 'storage/bucket-not-found': detailedErrorMessage = "Upload failed: Firebase Storage bucket not found. Verify `storageBucket` in Firebase config and ensure Storage is enabled."; break;
          case 'storage/project-not-found': detailedErrorMessage = "Upload failed: Firebase project not found. Verify Firebase project settings."; break;
          case 'storage/quota-exceeded': detailedErrorMessage = "Upload failed: Storage quota exceeded. Upgrade plan or free up space."; break;
          case 'storage/retry-limit-exceeded': detailedErrorMessage = "Upload failed after retries. Check network and Firebase Storage status."; break;
          default:
            if (error.message && (error.message.toLowerCase().includes('network request failed') || error.message.toLowerCase().includes('net::err_failed')) || error.code === 'storage/unknown' || !error.code) {
              toastTitle = "Network Error During Upload";
              detailedErrorMessage = `Upload failed (network issue). Check internet, browser Network tab, CORS for Storage bucket. Ensure Storage is enabled and rules are set. Error: ${error.message || 'Unknown network error'}`;
              duration = 20000;
            } else {
              detailedErrorMessage = `An unknown error occurred (Code: ${error.code || 'N/A'}). Check network, Storage rules, project plan. Server response: ${error.serverResponse || 'N/A'}`;
            }
            break;
        }
        toast({
          id: `client-pfp-upload-failed-${error.code || 'unknown'}`,
          title: toastTitle,
          description: detailedErrorMessage,
          variant: "destructive",
          duration: duration
        });
        setIsUploading(false); setUploadProgress(null); setSelectedImageFile(null);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const userDocRef = doc(db, 'users', user.uid);
          await updateDoc(userDocRef, { profilePictureUrl: downloadURL, updatedAt: Timestamp.now() });
          toast({ title: "Profile Picture Updated!", description: "Your new picture is now live." });
          if (refreshUserProfile) await refreshUserProfile();
          setSelectedImageFile(null);
        } catch (updateError: any) {
          toast({ title: "Update Failed", description: `Could not save profile picture URL: ${updateError.message}`, variant: "destructive" });
        } finally {
          setIsUploading(false); setUploadProgress(null);
        }
      }
    );
  };

  const onSubmit = async (data: ClientProfileEditFormValues) => {
    if (!user || !db) return;
    setIsSubmitting(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const updateData: Partial<UserProfile> = {
        username: data.username,
        companyName: data.companyName,
        website: data.website,
        companyDescription: data.companyDescription,
        personalEmail: data.personalEmail || '',
        personalPhone: data.personalPhone || '',
        updatedAt: Timestamp.now(),
      };

      if (userProfile?.profilePictureUrl && !selectedImageFile) { 
        updateData.profilePictureUrl = userProfile.profilePictureUrl;
      } else if (imagePreview && !selectedImageFile && userProfile?.profilePictureUrl !== imagePreview) {
        updateData.profilePictureUrl = userProfile?.profilePictureUrl || '';
      }
      

      await updateDoc(userDocRef, updateData);
      toast({ title: 'Profile Updated', description: 'Your client profile has been successfully saved.' });
      if (refreshUserProfile) await refreshUserProfile();
      router.push('/client/dashboard'); 
    } catch (error: any) {
      console.error('Client profile update error:', error);
      toast({ title: 'Update Failed', description: `Could not update profile: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const getInitials = (email: string | null | undefined, username?: string | null, companyName?: string | null) => {
    const nameToUse = companyName || username;
    if (nameToUse && nameToUse.trim() !== '') return nameToUse.substring(0, 2).toUpperCase();
    if (email) return email.substring(0, 2).toUpperCase();
    return '??';
  };


  if (authLoading || !isFormReady) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
       </Button>
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-2xl">Edit Client Profile</CardTitle>
          <CardDescription>Update your company and contact information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative group">
              <Avatar className="h-28 w-28 text-3xl border-2 border-muted shadow-md">
                <AvatarImage src={imagePreview || userProfile?.profilePictureUrl} alt={userProfile?.companyName || userProfile?.username || 'Client'} />
                <AvatarFallback>{getInitials(user?.email, userProfile?.username, userProfile?.companyName)}</AvatarFallback>
              </Avatar>
              <Button
                variant="outline" size="icon"
                className="absolute bottom-0 right-0 h-8 w-8 p-0 rounded-full opacity-80 group-hover:opacity-100 transition-opacity"
                onClick={() => fileInputRef.current?.click()}
                title="Change profile picture"
                disabled={isUploading}
              >
                <UploadCloud className="h-4 w-4" />
              </Button>
            </div>
            <input type="file" ref={fileInputRef} hidden accept="image/png, image/jpeg, image/webp, image/gif" onChange={handleImageFileChange} disabled={isUploading} />
            {selectedImageFile && !isUploading && (
              <Button onClick={handleImageUpload} size="sm" className="mt-2">
                <UploadCloud className="mr-2 h-4 w-4" /> Upload New Picture
              </Button>
            )}
            {isUploading && uploadProgress !== null && (
              <div className="mt-2 w-full max-w-xs space-y-1">
                <Progress value={uploadProgress} className="w-full h-2" />
                <p className="text-xs text-muted-foreground text-center">Uploading: {uploadProgress.toFixed(0)}%</p>
              </div>
            )}
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <User className="h-4 w-4 text-muted-foreground" /> Contact Person Name / Username
                    </FormLabel>
                    <FormControl><Input placeholder="e.g., John Doe (Public contact)" {...field} /></FormControl>
                    <FormDescription>This is the name displayed on your public profile as the contact person.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Building className="h-4 w-4 text-muted-foreground" /> Company Name
                    </FormLabel>
                    <FormControl><Input placeholder="e.g., Acme Innovations Inc." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Globe className="h-4 w-4 text-muted-foreground" /> Company Website
                    </FormLabel>
                    <FormControl><Input placeholder="https://yourcompany.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Info className="h-4 w-4 text-muted-foreground" /> About Your Company
                    </FormLabel>
                    <FormControl><Textarea placeholder="Tell students about your company, its mission, and the types of projects you typically offer (min 20 characters)." {...field} rows={4} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Card className="bg-secondary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Personal Contact Details (for sharing)</CardTitle>
                  <CardDescription className="text-xs">These details are optional and will only be shared in a chat if you explicitly choose to. They are not public on your profile.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <FormField
                    control={form.control}
                    name="personalEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Mail className="h-4 w-4 text-muted-foreground" /> Personal Email (Optional)
                        </FormLabel>
                        <FormControl><Input type="email" placeholder="your.personal@example.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="personalPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <Phone className="h-4 w-4 text-muted-foreground" /> Personal Phone (Optional)
                        </FormLabel>
                        <FormControl><Input type="tel" placeholder="+1234567890" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

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

    