
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Briefcase, Building, Globe, Info, Mail, Phone } from 'lucide-react';

const completeProfileSchema = z.object({
  username: z.string().min(3, { message: 'Username must be at least 3 characters' }).max(30, { message: 'Username cannot exceed 30 characters'}),
  role: z.enum(['student', 'client'], { required_error: 'You must select a role' }),
  companyName: z.string().max(100, { message: 'Company name cannot exceed 100 characters' }).optional(),
  website: z.string().url({ message: 'Please enter a valid URL for your website (e.g., https://example.com)' }).max(100).optional().or(z.literal('')),
  companyDescription: z.string().max(500, { message: 'Company description cannot exceed 500 characters' }).optional(),
  personalEmail: z.string().email({ message: 'Invalid email format' }).max(100).optional().or(z.literal('')),
  personalPhone: z.string().regex(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format (e.g., +1234567890)' }).max(20).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  if (data.role === 'client') {
    if (!data.companyName || data.companyName.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['companyName'],
        message: 'Company name is required for clients.',
      });
    }
    if (!data.website || data.website.trim() === '') {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['website'],
            message: 'Company website is required for clients.',
        });
    } else {
        try {
             if (data.website) z.string().url().parse(data.website);
        } catch (e) {
            ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['website'],
            message: 'Please enter a valid URL (e.g., https://example.com).',
            });
        }
    }
    if (!data.companyDescription || data.companyDescription.trim().length < 20) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['companyDescription'],
        message: 'Company description is required for clients and must be at least 20 characters.',
      });
    }
  }
});


type CompleteProfileFormValues = z.infer<typeof completeProfileSchema>;

export default function CompleteProfilePage() {
  const { user, loading: authLoading, refreshUserProfile } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CompleteProfileFormValues>({
    resolver: zodResolver(completeProfileSchema),
    defaultValues: {
      username: '',
      role: undefined,
      companyName: '',
      website: '',
      companyDescription: '',
      personalEmail: '',
      personalPhone: '',
    },
    mode: 'onChange',
  });

  const selectedRole = form.watch("role");

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/auth/login');
      } else {
        form.setValue('username', user.displayName || user.email?.split('@')[0] || '');
      }
    }
  }, [user, authLoading, router, form]);

  const onSubmit = async (data: CompleteProfileFormValues) => {
    if (!user || !db) {
      toast({ title: 'Error', description: 'User session or database not available.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userProfileData: any = {
        uid: user.uid,
        email: user.email,
        username: data.username,
        role: data.role,
        profilePictureUrl: user.photoURL || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        averageRating: 0,
        totalRatings: 0,
        following: [],
        followersCount: 0,
        readReceiptsEnabled: true, // Default for new profiles
      };

      if (data.role === 'student') {
        userProfileData.skills = [];
        userProfileData.portfolioLinks = [];
        userProfileData.bio = '';
        userProfileData.bookmarkedGigIds = [];
      } else if (data.role === 'client') {
        userProfileData.companyName = data.companyName;
        userProfileData.website = data.website;
        userProfileData.companyDescription = data.companyDescription;
        userProfileData.personalEmail = data.personalEmail || '';
        userProfileData.personalPhone = data.personalPhone || '';
      }
      
      await setDoc(userDocRef, userProfileData, { merge: true });

      toast({
        title: 'Profile Completed!',
        description: 'Your account is ready. Redirecting...',
      });

      if (refreshUserProfile) await refreshUserProfile();

      router.push(data.role === 'student' ? '/student/profile' : '/client/dashboard');

    } catch (error: any) {
      console.error('Complete profile error:', error);
      toast({
        title: 'Profile Completion Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen"><p>Redirecting to login...</p></div>;
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-8">
      <Card className="w-full max-w-lg glass-card">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
          <CardDescription>Just a few more details to get you started on HustleUp by PromoFlix.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-medium">Email: <span className="text-muted-foreground">{user.email}</span></p>
                {user.displayName && <p className="text-sm font-medium">Name (from provider): <span className="text-muted-foreground">{user.displayName}</span></p>}
              </div>

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username (Public)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., creative_coder or YourName" {...field} />
                    </FormControl>
                    <FormDescription>This will be shown on your profile.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>I want to join as a...</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) => {
                            field.onChange(value);
                            form.trigger(['companyName', 'website', 'companyDescription', 'personalEmail', 'personalPhone']);
                        }}
                        defaultValue={field.value}
                        className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="student" />
                          </FormControl>
                          <FormLabel className="font-normal flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            Student (Find Work)
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="client" />
                          </FormControl>
                          <FormLabel className="font-normal flex items-center gap-2">
                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                            Client (Post Gigs)
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedRole === 'client' && (
                <>
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className='flex items-center gap-1'>
                            <Building className="h-4 w-4 text-muted-foreground" /> Company Name
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Acme Innovations Inc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className='flex items-center gap-1'>
                            <Globe className="h-4 w-4 text-muted-foreground" /> Company Website
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="https://yourcompany.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="companyDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className='flex items-center gap-1'>
                           <Info className="h-4 w-4 text-muted-foreground" /> About Your Company
                        </FormLabel>
                        <FormControl>
                          <Textarea placeholder="Tell students about your company, its mission, and the types of projects you typically offer (min 20 characters)." {...field} rows={4}/>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="personalEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                           <Mail className="h-4 w-4 text-muted-foreground" /> Personal Contact Email (Optional)
                        </FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="your.personal@example.com" {...field} />
                        </FormControl>
                        <FormDescription>This email will only be shared if you explicitly choose to in a chat with a hired student.</FormDescription>
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
                           <Phone className="h-4 w-4 text-muted-foreground" /> Personal Contact Phone (Optional)
                        </FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="+1234567890" {...field} />
                        </FormControl>
                        <FormDescription>This phone number will only be shared if you explicitly choose to in a chat.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting || authLoading}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Profile & Continue
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
    
