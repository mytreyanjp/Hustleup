
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword, signInWithPopup, getAdditionalUserInfo } from 'firebase/auth'; // Added Google sign-in
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleAuthProvider } from '@/config/firebase'; // Import googleAuthProvider
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
  username: z.string().min(3, { message: 'Username must be at least 3 characters' }).max(30, {message: 'Username cannot exceed 30 characters'}).optional(),
});

type SignupFormValues = z.infer<typeof signupSchema>;

// SVG for Google Icon (can be moved to a shared component)
const GoogleIcon = () => (
  <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
    <path fill="currentColor" d="M488 261.8C488 403.3 381.5 512 244 512 110.5 512 0 401.5 0 265.5S110.5 19 244 19c70.5 0 132.5 29 177.5 76.5l-64.5 64.5C330.5 131.5 290.5 112 244 112c-80.5 0-147 65.5-147 153.5S163.5 419 244 419c47.5 0 87.5-24.5 113.5-62.5H244v-87h244c1.5 10.5 2.5 22.5 2.5 34.5z"></path>
  </svg>
);


export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const initialRole = searchParams.get('role') === 'client' ? 'client' : 'student';

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: '',
      password: '',
      role: initialRole,
      username: '',
    },
  });

   useEffect(() => {
     if (!auth || !db) {
       setFirebaseError("Firebase is not configured correctly. Please check setup and environment variables.");
     } else {
       setFirebaseError(null);
     }
   }, []);

   useEffect(() => {
     const roleParam = searchParams.get('role');
     if (roleParam === 'client' || roleParam === 'student') {
       form.setValue('role', roleParam);
     }
   }, [searchParams, form]);

  const handleEmailPasswordSignup = async (data: SignupFormValues) => {
    setIsLoading(true);
    setFirebaseError(null);

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
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;

      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        role: data.role,
        username: data.username || user.email?.split('@')[0] || `user_${user.uid.substring(0, 5)}`,
        profilePictureUrl: '', // Default empty, Google sign-up will use Google's photo
        createdAt: serverTimestamp(),
        ...(data.role === 'student' ? { skills: [], portfolioLinks: [], bio: '' } : {}),
        ...(data.role === 'client' ? { companyName: '', website: '' } : {}),
      });

      toast({
        title: 'Account Created Successfully!',
        description: `Welcome to HustleUp as a ${data.role}. Redirecting...`,
      });
      router.push(data.role === 'student' ? '/student/dashboard' : '/client/dashboard');

    } catch (error: any) {
      console.error('Signup error:', error);
      // ... (existing error handling)
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
          case 'auth/operation-not-allowed': 
             errorMessage = 'Email/Password sign-up is currently disabled.';
             break;
          case 'auth/configuration-not-found': 
             errorMessage = 'Firebase Authentication configuration is missing or incomplete. Please ensure Email/Password sign-in is enabled in your Firebase project.';
             setFirebaseError(errorMessage); 
             break;
          case 'auth/invalid-api-key': 
          case 'auth/api-key-not-valid':
          case 'auth/app-deleted':
          case 'auth/app-not-authorized':
             errorMessage = 'Firebase configuration error (API Key or App setup). Please check your .env.local file and Firebase project settings.';
             setFirebaseError(errorMessage); 
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
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    if (!auth || !googleAuthProvider || !db) {
      toast({ title: 'Error', description: 'Firebase not configured for Google Sign-In.', variant: 'destructive' });
      setIsGoogleLoading(false);
      return;
    }
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const user = result.user;
      const additionalUserInfo = getAdditionalUserInfo(result);

      // Check if user document already exists (e.g., if they logged in via Google before completing email signup)
      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        // User already exists, possibly from a previous Google sign-in attempt or direct login
        toast({
          title: 'Welcome Back!',
          description: `Signed in as ${user.displayName || user.email}.`,
        });
        router.push('/'); // Redirect to homepage, which will handle role-based dashboard redirect
      } else if (additionalUserInfo?.isNewUser || !docSnap.exists()) {
        // New user via Google, or user auth record exists but no Firestore profile (e.g. from prior login page Google signin)
        toast({
          title: 'Account Created with Google!',
          description: 'Please complete your profile to get started.',
        });
        router.push('/auth/complete-profile'); // Redirect to complete profile page
      }
    } catch (error: any) {
      console.error('Google Sign-Up error:', error);
      let errorMessage = 'Google Sign-Up failed.';
      if (error.code === 'auth/account-exists-with-different-credential') {
        errorMessage = 'An account already exists with this email. Try logging in or use a different email.';
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Google Sign-Up cancelled.';
      }
      toast({
        title: 'Google Sign-Up Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsGoogleLoading(false);
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
            <form onSubmit={form.handleSubmit(handleEmailPasswordSignup)} className="space-y-4">
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

              <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading || !!firebaseError}>
                 {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account with Email
              </Button>
            </form>
          </Form>

           <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or sign up with
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignUp}
            disabled={isLoading || isGoogleLoading || !!firebaseError}
          >
            {isGoogleLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Sign up with Google
          </Button>

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
