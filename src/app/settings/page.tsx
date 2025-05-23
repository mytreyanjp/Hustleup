
"use client";

import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const { user, loading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login?redirect=/settings');
    }
  }, [user, loading, router]);

  if (loading) {
     return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
     return <div className="text-center py-10"><p>Please log in to view settings.</p></div>;
  }

  const handleChangePassword = async () => {
    if (!user || !user.email) {
      toast({
        title: 'Error',
        description: 'No user email found to send reset link.',
        variant: 'destructive',
      });
      return;
    }
    if (!auth) {
        toast({ title: "Authentication Error", description: "Firebase Auth is not available.", variant: "destructive"});
        return;
    }

    setIsChangingPassword(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast({
        title: 'Password Reset Email Sent',
        description: 'Please check your inbox (and spam folder) for instructions to reset your password.',
      });
    } catch (error: any) {
      console.error('Error sending password reset email:', error);
      let errorMessage = 'Failed to send password reset email.';
      if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many requests. Please try again later.';
      }
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleUpdateEmail = () => {
    toast({
        title: "Feature Coming Soon",
        description: "Updating your email address will be available in a future update."
    });
  };
  const handleDeleteAccount = () => {
     toast({
        title: "Feature Coming Soon",
        description: "Account deletion will be available in a future update. This requires careful implementation."
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
       <h1 className="text-3xl font-bold tracking-tight mb-6">Account Settings</h1>

       <Card className="glass-card">
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Manage your account security settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4">
              <div>
                 <p className="font-medium">Password</p>
                 <p className="text-sm text-muted-foreground">Change your account password via email.</p>
              </div>
              <Button
                variant="outline"
                onClick={handleChangePassword}
                className="mt-2 sm:mt-0"
                disabled={isChangingPassword}
              >
                {isChangingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
              </Button>
           </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4">
              <div>
                 <p className="font-medium">Email Address</p>
                 <p className="text-sm text-muted-foreground">Current: {user.email}</p>
              </div>
              <Button variant="outline" onClick={handleUpdateEmail} className="mt-2 sm:mt-0" disabled>Update Email (Coming Soon)</Button>
           </div>
        </CardContent>
      </Card>

       <Card className="mt-6 glass-card border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
           <CardDescription>These actions are permanent and cannot be undone. Please proceed with caution.</CardDescription>
        </CardHeader>
        <CardContent>
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div>
                 <p className="font-medium">Delete Account</p>
                 <p className="text-sm text-muted-foreground">Permanently remove your account and all associated data.</p>
              </div>
              <Button variant="destructive" onClick={handleDeleteAccount} className="mt-2 sm:mt-0" disabled>Delete Account (Coming Soon)</Button>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
