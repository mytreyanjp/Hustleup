
"use client";

import { useState, useEffect, useRef, useCallback } from 'react'; // Added useCallback
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
// import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Media upload disabled
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, Edit, User, Briefcase, Building, Globe, Info, Mail, Phone, ArrowLeft } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// import { Progress } from '@/components/ui/progress'; // Media upload disabled
import NextImage from 'next/image'; // Renamed to avoid conflict
import { cn } from '@/lib/utils';

const clientProfileEditSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username cannot exceed 50 characters"),
  companyName: z.string().min(2, "Company name must be at least 2 characters").max(100, "Company name cannot exceed 100 characters"),
  website: z.string().url({ message: "Please enter a valid URL (e.g., https://example.com)" }).max(100).or(z.literal('')),
  companyDescription: z.string().min(20, "Company description must be at least 20 characters").max(500, "Company description cannot exceed 500 characters"),
  personalEmail: z.string().email({ message: 'Invalid email format' }).max(100).optional().or(z.literal('')),
  personalPhone: z.string().regex(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format (e.g., +1234567890)' }).max(20).optional().or(z.literal('')),
});

type ClientProfileEditFormValues = z.infer<typeof clientProfileEditSchema>;

const PREDEFINED_AVATARS = [
  { url: 'https://picsum.photos/seed/clientavatar1/200/200', hint: 'professional headshot' },
  { url: 'https://picsum.photos/seed/clientavatar2/200/200', hint: 'company logo placeholder' },
  { url: 'https://picsum.photos/seed/clientavatar3/200/200', hint: 'abstract design' },
  { url: 'https://picsum.photos/seed/clientavatar4/200/200', hint: 'office building' },
  { url: 'https://picsum.photos/seed/clientavatar5/200/200', hint: 'modern workspace' },
  { url: 'https://picsum.photos/seed/clientavatar6/200/200', hint: 'team picture' },
];

export default function EditClientProfilePage() {
  const { user, userProfile, loading: authLoading, role, refreshUserProfile } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormReady, setIsFormReady] = useState(false);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedPredefinedAvatar, setSelectedPredefinedAvatar] = useState<string | null>(null);

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

  const populateFormAndPreview = useCallback((profile: UserProfile | null) => {
    if (profile) {
      form.reset({
        username: profile.username || user?.email?.split('@')[0] || '',
        companyName: profile.companyName || '',
        website: profile.website || '',
        companyDescription: profile.companyDescription || '',
        personalEmail: profile.personalEmail || '',
        personalPhone: profile.personalPhone || '',
      });
      setImagePreview(profile.profilePictureUrl || null);
      setSelectedPredefinedAvatar(null);
    } else if (user) {
       form.reset({
        username: user.email?.split('@')[0] || '',
        companyName: '',
        website: '',
        companyDescription: '',
        personalEmail: '',
        personalPhone: '',
      });
      setImagePreview(null);
      setSelectedPredefinedAvatar(null);
    }
  }, [form, user]);


  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') {
        router.push('/auth/login?redirect=/client/profile/edit');
      } else { // Changed: use populateFormAndPreview here
        populateFormAndPreview(userProfile);
        setIsFormReady(true);
      }
    }
  }, [user, userProfile, authLoading, role, router, populateFormAndPreview]);


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

      if (selectedPredefinedAvatar) {
        updateData.profilePictureUrl = selectedPredefinedAvatar;
      } else {
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
  
  const handleSelectPredefinedAvatar = (avatarUrl: string) => {
    setSelectedPredefinedAvatar(avatarUrl);
    setImagePreview(avatarUrl);
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
                <AvatarImage src={imagePreview || undefined} alt={userProfile?.companyName || userProfile?.username || 'Client'} />
                <AvatarFallback>{getInitials(user?.email, userProfile?.username, userProfile?.companyName)}</AvatarFallback>
              </Avatar>
            </div>
             {/* Predefined Avatar Selection */}
            <div className="w-full">
              <p className="text-sm font-medium text-center mb-2">Or choose an avatar</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {PREDEFINED_AVATARS.map((avatar) => (
                  <button
                    type="button"
                    key={avatar.url}
                    onClick={() => handleSelectPredefinedAvatar(avatar.url)}
                    className={cn(
                      "rounded-full overflow-hidden border-2 p-0.5 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                      imagePreview === avatar.url ? "border-primary ring-2 ring-primary ring-offset-2" : "border-transparent hover:border-muted-foreground/50"
                    )}
                    title={`Select avatar: ${avatar.hint}`}
                  >
                    <NextImage
                      src={avatar.url}
                      alt={avatar.hint}
                      width={60}
                      height={60}
                      className="rounded-full object-cover aspect-square"
                      data-ai-hint={avatar.hint}
                    />
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">File uploads are currently disabled.</p>
            </div>
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
