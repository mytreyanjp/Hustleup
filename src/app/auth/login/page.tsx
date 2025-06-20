
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation'; // Added usePathname
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { signInWithEmailAndPassword, signInWithPopup, getAdditionalUserInfo, UserCredential, OAuthProvider } from 'firebase/auth';
import { auth, googleAuthProvider, githubAuthProvider, db } from '@/config/firebase'; // Removed appleAuthProvider
import { doc, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { useFirebase } from '@/context/firebase-context'; // Import useFirebase

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

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

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname(); // Get current pathname
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { user, role, loading: authContextLoading } = useFirebase(); // Get user, role, and context loading state

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    // Redirect if user is already logged in and has a role
    if (!authContextLoading && user && role) {
      if (!isLoading && !isOAuthLoading) { // Ensure not in the middle of a login attempt
        const targetPath =
          role === 'student' ? '/student/profile' :
          role === 'client' ? '/client/dashboard' :
          role === 'admin' ? '/admin/dashboard' :
          null;

        if (targetPath && pathname !== targetPath) {
          router.replace(targetPath);
        }
      }
    }
  }, [user, role, authContextLoading, isLoading, isOAuthLoading, router, pathname]);


  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      if (!auth) throw new Error("Firebase auth not initialized");
      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
      });
      // No router.push('/') here. Let the useEffect handle redirection based on context.
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'An unexpected error occurred during login.';
      if (error.code) {
        switch (error.code) {
          case 'auth/invalid-email':
            errorMessage = 'Invalid email format.';
            break;
          case 'auth/user-disabled':
            errorMessage = 'This user account has been disabled.';
            break;
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            errorMessage = 'The email or password you entered is incorrect. Please check your credentials and try again.';
            break;
          case 'auth/operation-not-allowed':
            errorMessage = 'Email/Password sign-in is currently disabled. Please enable it in your Firebase project console (Authentication -> Sign-in method).';
            break;
          default:
            errorMessage = `Login failed: ${error.message}`;
        }
      }
       toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
       setIsLoading(false); // Set loading to false here so useEffect can proceed
    }
  };

  const handleOAuthSignIn = async (provider: typeof googleAuthProvider | typeof githubAuthProvider, providerName: string) => { // Removed appleAuthProvider
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
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists() && userDocSnap.data()?.role) {
        toast({
          title: 'Login Successful',
          description: `Welcome back, ${user.displayName || user.email}!`,
        });
        // No router.push('/') here. Let the useEffect handle redirection.
      } else {
        toast({
          title: `Welcome ${user.displayName || user.email}!`,
          description: 'Please complete your profile to continue.',
        });
        router.push('/auth/complete-profile'); // This redirection is still needed for new OAuth users
      }
    } catch (error: any) {
      let errorMessage = `${providerName} Sign-In failed. Please try again.`;
      if (error.code) {
        switch (error.code) {
          case 'auth/account-exists-with-different-credential':
            errorMessage = `An account with the email ${error.customData?.email || 'you provided'} already exists. It was created using a different sign-in method (e.g., password, or another social provider). Please sign in using your original method, or try linking accounts if supported.`;
            break;
          case 'auth/popup-closed-by-user':
            errorMessage = `${providerName} Sign-In cancelled.`;
            break;
          case 'auth/cancelled-popup-request':
          case 'auth/popup-blocked':
            errorMessage = `Pop-up for ${providerName} Sign-In was closed or blocked. Please try again and ensure pop-ups are allowed for this site.`;
            break;
          case 'auth/operation-not-supported-in-this-environment':
            errorMessage = `${providerName} Sign-In is not supported in this browser or environment.`;
            break;
          case 'auth/operation-not-allowed':
            errorMessage = `${providerName} Sign-In is currently disabled. Please check the Firebase project console (Authentication -> Sign-in method) and ensure ${providerName} is enabled and correctly configured.`;
            break;
          case 'auth/unauthorized-domain':
            errorMessage = `The domain of this application is not authorized for ${providerName} Sign-In. Please add it to the authorized domains in your Firebase project console (Authentication -> Settings -> Authorized domains).`;
            break;
          case 'auth/invalid-credential':
             errorMessage = `Sign-in with ${providerName} failed. This often means there's a misconfiguration in your Firebase project for the ${providerName} sign-in method, or an issue with your ${providerName} developer account setup. Please double-check your Firebase console settings and the ${providerName} developer portal configuration. Raw error: ${error.message || 'No specific message from provider.'}`;
             break;
          case 'auth/oauth-provider-error': 
             errorMessage = `An error occurred with ${providerName} Sign-In. Please ensure your ${providerName} application is correctly configured and linked in Firebase. Full error: ${error.message}`;
             break;
          default:
            errorMessage = `${providerName} Sign-In error: ${error.message || 'An unknown error occurred.'} (Code: ${error.code || 'N/A'})`;
        }
      }
      toast({
        title: `${providerName} Sign-In Failed`,
        description: errorMessage,
        variant: 'destructive',
        duration: 10000, 
      });
    } finally {
      setIsOAuthLoading(false); // Set loading to false here so useEffect can proceed
    }
  };


  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
       <Card className="w-full max-w-md glass-card">
         <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome Back!</CardTitle>
          <CardDescription>Enter your credentials or sign in with a provider.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    <div className="relative">
                      <FormControl>
                        <Input 
                          placeholder="••••••••" 
                          {...field} 
                          type={showPassword ? "text" : "password"} 
                          className="pr-10"
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading || isOAuthLoading || authContextLoading}>
                 {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                 Log In
              </Button>
            </form>
          </Form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>
          
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleOAuthSignIn(googleAuthProvider, "Google")}
              disabled={isLoading || isOAuthLoading || authContextLoading}
            >
              {isOAuthLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              Sign in with Google
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => handleOAuthSignIn(githubAuthProvider, "GitHub")}
              disabled={isLoading || isOAuthLoading || !githubAuthProvider || authContextLoading} 
            >
              {isOAuthLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitHubIcon />
              )}
              Sign in with GitHub
            </Button>
          </div>


          <div className="mt-4 text-center text-sm">
            Don't have an account?{' '}
            <Button variant="link" asChild className="p-0 h-auto">
               <Link href="/auth/signup">Sign up</Link>
            </Button>
          </div>
           <div className="mt-2 text-center text-sm">
             <Button variant="link" asChild className="p-0 h-auto text-muted-foreground">
               <Link href="/auth/forgot-password">Forgot Password?</Link>
             </Button>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
