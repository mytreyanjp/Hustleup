
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword, signInWithPopup, getAdditionalUserInfo, UserCredential, OAuthProvider } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db, googleAuthProvider, appleAuthProvider, githubAuthProvider } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Briefcase, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const signupSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  role: z.enum(['student', 'client'], { required_error: 'You must select a role' }),
  username: z.string().min(3, { message: 'Username must be at least 3 characters' }).max(30, {message: 'Username cannot exceed 30 characters'}),
});

type SignupFormValues = z.infer<typeof signupSchema>;

// SVG for Google Icon
const GoogleIcon = () => (
  <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
    <path fill="currentColor" d="M488 261.8C488 403.3 381.5 512 244 512 110.5 512 0 401.5 0 265.5S110.5 19 244 19c70.5 0 132.5 29 177.5 76.5l-64.5 64.5C330.5 131.5 290.5 112 244 112c-80.5 0-147 65.5-147 153.5S163.5 419 244 419c47.5 0 87.5-24.5 113.5-62.5H244v-87h244c1.5 10.5 2.5 22.5 2.5 34.5z"></path>
  </svg>
);

// SVG for Apple Icon
const AppleIcon = () => (
    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="apple" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512">
        <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C39.2 141.6 0 184.8 0 246.4c0 37.5 19.7 74.7 50.4 99.5C34.3 368 19.8 405.2 19.8 442.6c0 6.7 .6 13.4 1.7 19.9H192v-29.3H17.4c-.8-6.5-1.4-13.2-1.4-20.2 .1-33.9 14.6-60.5 40.8-79.2 25.2-17.9 50.5-27.5 76.8-27.5 27.7 0 53.5 11.7 76.8 31.4 22.3 18.9 35.9 45.8 35.9 77.9 .1 21.3-5.3 42.8-15.1 63.2H318.7c1.6-11.6 2.4-23.6 2.4-36C321.1 300.1 318.9 284.2 318.7 268.7zM226.1 184c-15.5-16.4-35.5-25.3-55.7-25.3-21.3 0-42.5 10.2-59.3 26.8-17.2 16.8-29.3 39.9-30.1 64.6H287c-.7-24.4-12.5-47.1-29.9-63.2-5.2-4.8-11.3-9.1-17.9-12.9-1.1-.6-2.2-1.2-3.1-1.8z"></path>
    </svg>
);

// SVG for GitHub Icon
const GitHubIcon = () => (
    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="github" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512">
        <path fill="currentColor" d="M165.9 397.4c0 2-1.3 3.2-3.2 3.2h-3.2c-1.3 0-3.2-1.3-3.2-3.2V297.2c0-2 1.3-3.2 3.2-3.2h3.2c1.3 0 3.2 1.3 3.2 3.2v100.2zm100.2 0c0 2-1.3 3.2-3.2 3.2h-3.2c-1.3 0-3.2-1.3-3.2-3.2V297.2c0-2 1.3-3.2 3.2-3.2h3.2c1.3 0 3.2 1.3 3.2 3.2v100.2zm100.2 0c0 2-1.3 3.2-3.2 3.2h-3.2c-1.3 0-3.2-1.3-3.2-3.2V297.2c0-2 1.3-3.2 3.2-3.2h3.2c1.3 0 3.2 1.3 3.2 3.2v100.2zm-300.5-78.3c0-2.3-1.3-4.5-3.2-4.5h-3.2c-1.3 0-3.2 2.3-3.2 4.5v73.6c0 2.3 1.3 4.5 3.2 4.5h3.2c1.3 0 3.2-2.3 3.2-4.5v-73.6zm100.2 0c0-2.3-1.3-4.5-3.2-4.5h-3.2c-1.3 0-3.2 2.3-3.2 4.5v73.6c0 2.3 1.3 4.5 3.2 4.5h3.2c1.3 0 3.2-2.3 3.2-4.5v-73.6zm100.2 0c0-2.3-1.3-4.5-3.2-4.5h-3.2c-1.3 0-3.2 2.3-3.2 4.5v73.6c0 2.3 1.3 4.5 3.2 4.5h3.2c1.3 0 3.2-2.3 3.2-4.5v-73.6zM248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm121.6 352.9c-15.2 15.2-34.3 24.8-56.2 24.8H172.9c-21.9 0-41-9.7-56.2-24.8A83.52 83.52 0 0 1 97 280.1c0-26.2 12.5-47.8 29.4-63.2 15.2-13.2 34.3-21.3 56.2-21.3h100.2c21.9 0 41 8.1 56.2 21.3 17 15.4 29.4 37 29.4 63.2-.1 26.2-12.6 47.8-29.5 63.2z"></path>
    </svg>
);

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
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
      const userProfileData: any = {
        uid: user.uid,
        email: user.email,
        role: data.role,
        username: data.username || user.email?.split('@')[0] || `user_${user.uid.substring(0, 5)}`,
        profilePictureUrl: '', 
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
        userProfileData.companyName = ''; // Initialize empty, user completes in next step or profile edit
        userProfileData.website = ''; // Initialize empty
      }

      await setDoc(userDocRef, userProfileData);

      toast({
        title: 'Account Created Successfully!',
        description: `Welcome to HustleUp as a ${data.role}. Redirecting...`,
      });
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
          case 'auth/operation-not-allowed': 
             errorMessage = 'Email/Password sign-up is currently disabled. Please enable it in your Firebase project console (Authentication -> Sign-in method).';
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

  const handleOAuthSignUp = async (provider: typeof googleAuthProvider | typeof appleAuthProvider | typeof githubAuthProvider, providerName: string) => {
    if (!provider || !auth || !db) {
      toast({ title: 'Error', description: `Firebase not configured for ${providerName} Sign-In.`, variant: 'destructive' });
      setIsOAuthLoading(false);
      return;
    }
    setIsOAuthLoading(true);
    try {
      if (providerName === "Apple" && appleAuthProvider) {
        (appleAuthProvider as OAuthProvider).addScope('email');
        (appleAuthProvider as OAuthProvider).addScope('name');
      }

      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists() && docSnap.data()?.role) {
        toast({
          title: 'Welcome Back!',
          description: `Signed in as ${user.displayName || user.email}. Redirecting...`,
        });
        router.push('/'); 
      } else {
        toast({
          title: `Account Created with ${providerName}!`,
          description: 'Please complete your profile to get started.',
        });
        router.push('/auth/complete-profile'); 
      }
    } catch (error: any) {
      console.error(`${providerName} Sign-Up error (raw):`, error);
      console.error(`${providerName} Sign-Up error code:`, error.code);
      console.error(`${providerName} Sign-Up error message:`, error.message);
      if (error.customData) {
        console.error(`${providerName} Sign-Up error customData:`, error.customData);
      }
       if (error.credential) { 
        console.error(`${providerName} Sign-Up error credential:`, JSON.stringify(error.credential));
      }

      let errorMessage = `${providerName} Sign-Up failed. Please try again.`;
      if (error.code) {
         switch (error.code) {
          case 'auth/account-exists-with-different-credential':
            errorMessage = `An account with the email ${error.customData?.email || 'you provided'} already exists. Please log in using your original sign-in method, or sign up with a different email.`;
            break;
          case 'auth/popup-closed-by-user':
            errorMessage = `${providerName} Sign-Up cancelled.`;
            break;
          case 'auth/cancelled-popup-request':
          case 'auth/popup-blocked':
            errorMessage = `Pop-up for ${providerName} Sign-Up was closed or blocked. Please try again and ensure pop-ups are allowed for this site.`;
            break;
          case 'auth/operation-not-supported-in-this-environment':
            errorMessage = `${providerName} Sign-In is not supported in this browser or environment.`;
            break;
          case 'auth/operation-not-allowed':
            errorMessage = `${providerName} Sign-Up is currently disabled. Please check the Firebase project console (Authentication -> Sign-in method) and ensure ${providerName} is enabled and correctly configured.`;
            break;
          case 'auth/unauthorized-domain':
            errorMessage = `The domain of this application is not authorized for ${providerName} Sign-In. Please add it to the authorized domains in your Firebase project console (Authentication -> Settings -> Authorized domains).`;
            break;
          case 'auth/invalid-credential':
             errorMessage = `Invalid credential provided for ${providerName} Sign-In. This might indicate a configuration issue with the provider on the Firebase or ${providerName} developer console. Full error: ${error.message}`;
             break;
          case 'auth/oauth-provider-error': 
             errorMessage = `An error occurred with ${providerName} Sign-In. Please ensure your ${providerName} application is correctly configured and linked in Firebase. Full error: ${error.message}`;
             break;
          default:
            if (providerName === "Apple") {
                errorMessage = `Apple Sign-In failed. This often indicates an issue with the complex setup required in both the Apple Developer portal and Firebase. Please double-check all App IDs, Services IDs, private keys, and team configurations. (Code: ${error.code || 'N/A'}, Message: ${error.message || 'No specific message'})`;
            } else {
                 errorMessage = `${providerName} Sign-Up error: ${error.message || 'An unknown error occurred.'} (Code: ${error.code || 'N/A'})`;
            }
        }
      }
      toast({
        title: `${providerName} Sign-Up Failed`,
        description: errorMessage,
        variant: 'destructive',
        duration: 10000, 
      });
    } finally {
      setIsOAuthLoading(false);
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
                         onValueChange={(value) => {
                           field.onChange(value);
                           if (value === 'client') {
                             // Optionally prefill username if client and if that makes sense for your UX
                             // form.setValue('username', user.email?.split('@')[0] || '');
                           }
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

              <FormField
                 control={form.control}
                 name="username"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel>Username (Public)</FormLabel>
                     <FormControl>
                       <Input placeholder={form.getValues("role") === "client" ? "e.g., AcmeCorp" : "e.g., creative_coder"} {...field} />
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

              <Button type="submit" className="w-full" disabled={isLoading || isOAuthLoading || !!firebaseError}>
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
          
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleOAuthSignUp(googleAuthProvider, "Google")}
              disabled={isLoading || isOAuthLoading || !!firebaseError}
            >
              {isOAuthLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Sign up with Google
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleOAuthSignUp(appleAuthProvider, "Apple")}
              disabled={isLoading || isOAuthLoading || !!firebaseError || !appleAuthProvider}
            >
              {isOAuthLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <AppleIcon />
              )}
              Sign up with Apple
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleOAuthSignUp(githubAuthProvider, "GitHub")}
              disabled={isLoading || isOAuthLoading || !!firebaseError || !githubAuthProvider}
            >
              {isOAuthLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitHubIcon />
              )}
              Sign up with GitHub
            </Button>
          </div>

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
