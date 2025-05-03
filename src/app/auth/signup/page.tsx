"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/config/firebase'; // Import potentially null auth/db
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Briefcase, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const signupSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  role: z.enum(['student', 'client'], { required_error: 'You must select a role' }),
  username: z.string().min(3, { message: 'Username must be at least 3 characters' }).optional(), // Optional for now
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const initialRole = searchParams.get('role') === 'client' ? 'client' : 'student'; // Default to student if param missing/invalid

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: '',
      password: '',
      role: initialRole,
      username: '',
    },
  });

   // Check Firebase services availability on mount
   useEffect(() => {
     // This effect primarily checks for the *initial* configuration state
     if (!auth || !db) {
       setFirebaseError("Firebase is not configured correctly. Please check setup and environment variables.");
     } else {
       setFirebaseError(null); // Clear error if services seem available initially
     }
   }, []);


   // Update default role if search param changes after initial load
   useEffect(() => {
     const roleParam = searchParams.get('role');
     if (roleParam === 'client' || roleParam === 'student') {
       form.setValue('role', roleParam);
     }
   }, [searchParams, form]);


  const onSubmit = async (data: SignupFormValues) => {
    setIsLoading(true);
    setFirebaseError(null); // Clear previous errors

    // Explicitly check if auth and db are available *before* proceeding with the API call
    if (!auth || !db) {
       const configError = "Signup cannot proceed: Firebase is not properly initialized.";
       setFirebaseError(configError);
       toast({
         title: 'Signup Failed',
         description: configError + " Please check console or contact support.",
         variant: 'destructive',
       });
       setIsLoading(false);
       return;
    }

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;

      // 2. Create user profile document in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        role: data.role,
        username: data.username || user.email?.split('@')[0] || `user_${user.uid.substring(0, 5)}`, // Default username logic
        createdAt: serverTimestamp(),
        // Initialize other profile fields based on role if needed
        ...(data.role === 'student' ? { skills: [], portfolioLinks: [], bio: '', profilePictureUrl: '' } : {}),
        ...(data.role === 'client' ? { companyName: '', website: '' } : {}), // Example client fields
      });

      toast({
        title: 'Account Created Successfully!',
        description: `Welcome to HustleUp as a ${data.role}. Redirecting...`,
      });

      // Redirect based on role
      router.push(data.role === 'student' ? '/student/dashboard' : '/client/dashboard');

    } catch (error: any) {
      console.error('Signup error:', error);
      let errorMessage = 'An unexpected error occurred during signup.';
      if (error.code) {
        switch (error.code) {
          case 'auth/email-already-in-use':
            errorMessage = 'This email address is already registered.';
            break;
          case 'auth/invalid-email':
            errorMessage = 'Invalid email format.';
            break;
          case 'auth/weak-password':
            errorMessage = 'Password is too weak. Please choose a stronger password.';
            break;
          case 'auth/operation-not-allowed': // Possible if email/password auth is disabled
             errorMessage = 'Email/Password sign-up is currently disabled.';
             break;
          case 'auth/configuration-not-found': // Specific error
             errorMessage = 'Firebase Authentication configuration is missing or incomplete. Please ensure Email/Password sign-in is enabled in your Firebase project.';
             setFirebaseError(errorMessage); // Set specific state for config errors
             break;
          case 'auth/invalid-api-key': // Added from previous errors
          case 'auth/api-key-not-valid':
          case 'auth/app-deleted':
          case 'auth/app-not-authorized':
             errorMessage = 'Firebase configuration error (API Key or App setup). Please check your .env.local file and Firebase project settings.';
             setFirebaseError(errorMessage); // Set specific state for config errors
             break;
          default:
            errorMessage = `Signup failed: ${error.message} (Code: ${error.code})`;
        }
      }
      toast({
        title: 'Signup Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      setIsLoading(false); // Only stop loading on error
    }
  };

  return (
     <div className="flex items-center justify-center min-h-[calc(100vh-10rem)] py-8">
       <Card className="w-full max-w-lg glass-card">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create your HustleUp Account</CardTitle>
          <CardDescription>Join as a Student or Client to get started.</CardDescription>
        </CardHeader>
        <CardContent>
           {firebaseError && (
               <Alert variant="destructive" className="mb-4">
                 <AlertTriangle className="h-4 w-4" />
                 <AlertTitle>Configuration Error</AlertTitle>
                 <AlertDescription>{firebaseError}</AlertDescription>
               </Alert>
             )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

              <FormField
                 control={form.control}
                 name="username"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel>Username (Public)</FormLabel>
                     <FormControl>
                       <Input placeholder="e.g., creative_coder" {...field} />
                     </FormControl>
                     <FormDescription>This will be shown on your profile.</FormDescription>
                     <FormMessage />
                   </FormItem>
                 )}
               />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="you@example.com" {...field} type="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input placeholder="••••••••" {...field} type="password" />
                    </FormControl>
                     <FormDescription>Must be at least 6 characters long.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading || !!firebaseError}>
                 {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
            Already have an account?{' '}
            <Button variant="link" asChild className="p-0 h-auto">
               <Link href="/auth/login">Log in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
