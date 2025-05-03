"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"


const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setIsLoading(true);
    setEmailSent(false); // Reset success state on new submission
    try {
      await sendPasswordResetEmail(auth, data.email);
      setEmailSent(true);
      toast({
        title: 'Password Reset Email Sent',
        description: 'Check your inbox (and spam folder) for instructions to reset your password.',
      });
      form.reset(); // Clear the form
    } catch (error: any) {
      console.error('Password reset error:', error);
      let errorMessage = 'An unexpected error occurred.';
      if (error.code) {
        switch (error.code) {
          case 'auth/invalid-email':
            errorMessage = 'Invalid email format.';
            break;
          case 'auth/user-not-found':
            errorMessage = 'No user found with this email address.';
            break;
           case 'auth/missing-email': // Catch if email is somehow empty
               errorMessage = 'Please enter your email address.';
               break;
          default:
            errorMessage = `Failed to send reset email: ${error.message}`;
        }
      }
       toast({
        title: 'Password Reset Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
       setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
       <Card className="w-full max-w-md glass-card">
         <CardHeader className="text-center">
          <CardTitle className="text-2xl">Forgot Your Password?</CardTitle>
          <CardDescription>Enter your email address and we'll send you a link to reset it.</CardDescription>
        </CardHeader>
        <CardContent>
           {emailSent ? (
             <Alert variant="default" className='border-green-500'>
                 <Mail className="h-4 w-4" />
                 <AlertTitle className='text-green-700 dark:text-green-300'>Check Your Email</AlertTitle>
                 <AlertDescription>
                   A password reset link has been sent to the provided email address if it exists in our system. Please check your inbox and spam folder.
                 </AlertDescription>
                  <div className="mt-4 text-center">
                      <Button variant="link" asChild className="p-0 h-auto">
                          <Link href="/auth/login">Back to Log In</Link>
                      </Button>
                  </div>
             </Alert>
           ) : (
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
                 <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Reset Link
                 </Button>
               </form>
             </Form>
           )}
          {!emailSent && (
              <div className="mt-4 text-center text-sm">
                Remember your password?{' '}
                <Button variant="link" asChild className="p-0 h-auto">
                   <Link href="/auth/login">Log in</Link>
                </Button>
              </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
