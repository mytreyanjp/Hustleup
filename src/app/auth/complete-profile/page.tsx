
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Briefcase, Building, Globe } from 'lucide-react'; // Added Building, Globe

const completeProfileSchema = z.object({
  username: z.string().min(3, { message: 'Username must be at least 3 characters' }).max(30, { message: 'Username cannot exceed 30 characters'}),
  role: z.enum(['student', 'client'], { required_error: 'You must select a role' }),
  companyName: z.string().max(100, { message: 'Company name cannot exceed 100 characters' }).optional(),
  website: z.string().url({ message: 'Please enter a valid URL for your website (e.g., https://example.com)' }).max(100).optional().or(z.literal('')),
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
    },
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
        averageRating: 0,
        totalRatings: 0,
      };

      if (data.role === 'student') {
        userProfileData.skills = [];
        userProfileData.portfolioLinks = [];
        userProfileData.bio = '';
        userProfileData.bookmarkedGigIds = [];
      } else if (data.role === 'client') {
        userProfileData.companyName = data.companyName || '';
        userProfileData.website = data.website || '';
      }
      
      await setDoc(userDocRef, userProfileData, { merge: true }); // Use merge to be safe

      toast({
        title: 'Profile Completed!',
        description: 'Your account is ready. Redirecting...',
      });

      if (refreshUserProfile) await refreshUserProfile();

      router.push(data.role === 'student' ? '/student/dashboard' : '/client/dashboard');

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
          <CardDescription>Just a few more details to get you started on HustleUp.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-medium">Email: <span className="text-muted-foreground">{user.email}</span></p>
                {user.displayName && <p className="text-sm font-medium">Name: <span className="text-muted-foreground">{user.displayName}</span></p>}
              </div>

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username (Public)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., creative_coder or YourCompanyName" {...field} />
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
                        onValueChange={field.onChange}
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
                        <FormLabel>Company Name (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Acme Corp" {...field} />
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
                        <FormLabel>Company Website (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://yourcompany.com" {...field} />
                        </FormControl>
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
