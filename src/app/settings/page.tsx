
"use client";

import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { sendPasswordResetEmail, deleteUser as deleteFirebaseAuthUser } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function SettingsPage() {
  const { user, loading } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login?redirect=/settings');
    }
  }, [user, loading, router]);

  if (loading) {
     return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
     // This state should ideally not be reached if the useEffect redirect works properly
     return <div className="text-center py-10"><p>Redirecting to login...</p></div>;
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

  const handleDeleteAccount = async () => {
    if (!user || !auth || !db) {
      toast({ title: "Error", description: "User session or Firebase services unavailable.", variant: "destructive"});
      return;
    }
    setIsDeletingAccount(true);
    try {
      // 1. Delete Firestore user document (optional, but good practice)
      const userDocRef = doc(db, 'users', user.uid);
      await deleteDoc(userDocRef);
      console.log("User document deleted from Firestore.");

      // 2. Delete Firebase Auth user
      if (auth.currentUser) { // Ensure currentUser is available
        await deleteFirebaseAuthUser(auth.currentUser); 
      } else {
        throw new Error("Current user not available in Firebase Auth for deletion.");
      }
      

      toast({
        title: 'Account Deleted Successfully',
        description: 'Your account and associated data have been removed. You will be redirected.',
      });
      router.push('/'); // Redirect to homepage after successful deletion

    } catch (error: any) {
      console.error('Error deleting account:', error);
      let errorMessage = 'Failed to delete your account.';
      if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'This operation is sensitive and requires recent authentication. Please log out and log back in, then try again.';
      } else if (error.code === 'auth/network-request-failed') {
         errorMessage = 'Network error. Please check your connection and try again.';
      }
      toast({
        title: 'Account Deletion Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };


  return (
    <div className="max-w-2xl mx-auto py-8">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-6 self-start">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
       </Button>
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
                 <p className="text-sm text-muted-foreground">Permanently remove your account and all associated data from HustleUp.</p>
              </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="mt-2 sm:mt-0" disabled={isDeletingAccount}>
                        {isDeletingAccount && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete My Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your
                        account, remove your data from our servers, and you will lose access to all your gigs, applications, and messages.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeletingAccount}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteAccount}
                        disabled={isDeletingAccount}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        {isDeletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Yes, Delete My Account
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
