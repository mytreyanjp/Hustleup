
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword, signInWithPopup, OAuthProvider } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore';
import { auth, db, googleAuthProvider, githubAuthProvider } from '@/config/firebase'; // Removed appleAuthProvider
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Briefcase, AlertTriangle, Building, Globe, Info, Mail, Phone } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const signupSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
  role: z.enum(['student', 'client'], { required_error: 'You must select a role' }),
  username: z.string().min(3, { message: 'Username must be at least 3 characters' }).max(30, {message: 'Username cannot exceed 30 characters'}),
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


type SignupFormValues = z.infer<typeof signupSchema>;

// SVG for Google Icon
const GoogleIcon = () => (
  <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
    <path fill="currentColor" d="M488 261.8C488 403.3 381.5 512 244 512 110.5 512 0 401.5 0 265.5S110.5 19 244 19c70.5 0 132.5 29 177.5 76.5l-64.5 64.5C330.5 131.5 290.5 112 244 112c-80.5 0-147 65.5-147 153.5S163.5 419 244 419c47.5 0 87.5-24.5 113.5-62.5H244v-87h244c1.5 10.5 2.5 22.5 2.5 34.5z"></path>
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
        userProfileData.companyName = data.companyName || ''; 
        userProfileData.website = data.website || ''; 
        userProfileData.companyDescription = data.companyDescription || '';
        userProfileData.personalEmail = data.personalEmail || '';
        userProfileData.personalPhone = data.personalPhone || '';
      }

      await setDoc(userDocRef, userProfileData);

      toast({
        title: 'Account Created Successfully!',
        description: `Welcome to HustleUp by PromoFlix as a ${data.role}. Redirecting...`,
      });
      
      router.push(data.role === 'student' ? '/student/profile' : '/client/dashboard');

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
          case 'auth/invalid-credential': // Added this specific error for OAuth issues during signup context too
             errorMessage = `Sign-up failed due to an invalid credential configuration. This often means there's a misconfiguration in your Firebase project for the sign-in method, or an issue with your developer account setup for that provider. Please double-check your Firebase console settings and the provider's developer portal. Raw error: ${error.message || 'No specific message from provider.'}`;
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

  const handleOAuthSignUp = async (provider: typeof googleAuthProvider | typeof githubAuthProvider, providerName: string) => { // Removed appleAuthProvider
    if (!provider || !auth || !db) {
      toast({ title: 'Error', description: `Firebase not configured for ${providerName} Sign-In.`, variant: 'destructive' });
      setIsOAuthLoading(false);
      return;
    }
    setIsOAuthLoading(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists() && docSnap.data()?.role) {
        // User exists and has a role, likely a returning user.
        toast({
          title: 'Welcome Back!',
          description: `Signed in as ${user.displayName || user.email}. Redirecting...`,
        });
        const userRole = docSnap.data()?.role;
        router.push(userRole === 'student' ? '/student/profile' : '/client/dashboard');
      } else {
        // New user via OAuth, or existing user without a role (needs profile completion)
        toast({
          title: `Account Created with ${providerName}!`,
          description: 'Please complete your profile to get started.',
        });
        router.push('/auth/complete-profile'); 
      }
    } catch (error: any) {
      let errorMessage = `${providerName} Sign-Up failed. Please try again.`;
      if (error.code) {
         switch (error.code) {
          case 'auth/account-exists-with-different-credential':
            errorMessage = `An account with the email ${error.customData?.email || 'you provided'} already exists. It was created using a different sign-in method (e.g., password, or another social provider). Please sign in using your original method.`;
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
             errorMessage = `Sign-up with ${providerName} failed due to an invalid credential configuration. This often means there's a misconfiguration in your Firebase project for the ${providerName} sign-in method, or an issue with your ${providerName} developer account setup. Please double-check your Firebase console settings and the ${providerName} developer portal. Raw error: ${error.message || 'No specific message from provider.'}`;
             break;
          case 'auth/oauth-provider-error': 
             errorMessage = `An error occurred with ${providerName} Sign-In. Please ensure your ${providerName} application is correctly configured and linked in Firebase. Full error: ${error.message}`;
             break;
          default:
            errorMessage = `${providerName} Sign-Up error: ${error.message || 'An unknown error occurred.'} (Code: ${error.code || 'N/A'})`;
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
          <CardTitle className="text-2xl">Create your HustleUp by PromoFlix Account</CardTitle>
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

              <FormField
                 control={form.control}
                 name="username"
                 render={({ field }) => (
                   <FormItem>
                     <FormLabel>Username (Public)</FormLabel>
                     <FormControl>
                       <Input placeholder={selectedRole === "client" ? "e.g., Your Name (Contact Person)" : "e.g., creative_coder"} {...field} />
                     </FormControl>
                     <FormDescription>This will be shown on your profile. {selectedRole === "client" && "This is typically your personal name, not the company name."}</FormDescription>
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


              <Button type="submit" className="w-full" disabled={isLoading || isOAuthLoading || !!firebaseError}>
                 {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account
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
