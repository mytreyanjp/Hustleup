
"use client";

import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, MessageSquare, Bell, BellOff, Edit3, UserCircle as ViewProfileIcon } from 'lucide-react'; // Added Edit3, ViewProfileIcon
import { sendPasswordResetEmail, deleteUser as deleteFirebaseAuthUser } from 'firebase/auth';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link'; // Added Link import
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
  const { 
    user, 
    userProfile, 
    loading, 
    role, // Added role here
    refreshUserProfile, 
    isNotificationsEnabledOnDevice, 
    requestNotificationPermission, 
    disableNotificationsOnDevice 
  } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [readReceipts, setReadReceipts] = useState(true);
  const [isUpdatingReceipts, setIsUpdatingReceipts] = useState(false);
  const [isProcessingNotifications, setIsProcessingNotifications] = useState(false);


  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login?redirect=/settings');
    }
    if (userProfile) {
      setReadReceipts(userProfile.readReceiptsEnabled === undefined ? true : userProfile.readReceiptsEnabled);
    }
  }, [user, userProfile, loading, router]);

  if (loading) {
     return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user || !userProfile) {
     return <div className="text-center py-10"><p>Redirecting to login or loading profile...</p></div>;
  }

  const handleChangePassword = async () => {
    if (!user || !user.email) {
      toast({ title: 'Error', description: 'No user email found to send reset link.', variant: 'destructive' });
      return;
    }
    if (!auth) {
        toast({ title: "Authentication Error", description: "Firebase Auth is not available.", variant: "destructive"});
        return;
    }
    setIsChangingPassword(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast({ title: 'Password Reset Email Sent', description: 'Please check your inbox (and spam folder) for instructions to reset your password.' });
    } catch (error: any) {
      console.error('Error sending password reset email:', error);
      toast({ title: 'Error', description: `Failed to send password reset email: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleToggleReadReceipts = async (checked: boolean) => {
    if (!user || !db) {
        toast({ title: "Error", description: "User session or database unavailable.", variant: "destructive"});
        return;
    }
    setIsUpdatingReceipts(true);
    setReadReceipts(checked); 
    try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { readReceiptsEnabled: checked });
        toast({ title: "Setting Updated", description: `Read receipts ${checked ? 'enabled' : 'disabled'}.`});
        if (refreshUserProfile) await refreshUserProfile();
    } catch (error: any) {
        setReadReceipts(!checked); 
        toast({ title: "Update Failed", description: "Could not save read receipts preference.", variant: "destructive" });
    } finally {
        setIsUpdatingReceipts(false);
    }
  };

  const handleToggleBrowserNotifications = async () => {
    setIsProcessingNotifications(true);
    if (isNotificationsEnabledOnDevice) {
      await disableNotificationsOnDevice();
      toast({ title: "Browser Notifications Disabled", description: "You will no longer receive push notifications on this device."});
    } else {
      const success = await requestNotificationPermission();
      if (success) {
        toast({ title: "Browser Notifications Enabled!", description: "You will now receive push notifications on this device."});
      } else {
        toast({ title: "Permission Denied", description: "Could not enable browser notifications. Please check your browser settings.", variant: "destructive"});
      }
    }
    setIsProcessingNotifications(false);
  };

  const handleDeleteAccount = async () => {
    if (!user || !auth || !db) {
      toast({ title: "Error", description: "User session or Firebase services unavailable.", variant: "destructive"});
      return;
    }
    setIsDeletingAccount(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await deleteDoc(userDocRef);
      if (auth.currentUser) { 
        await deleteFirebaseAuthUser(auth.currentUser); 
      } else {
        throw new Error("Current user not available in Firebase Auth for deletion.");
      }
      toast({ title: 'Account Deleted Successfully', description: 'Your account and associated data have been removed. Redirecting...' });
      router.push('/'); 
    } catch (error: any) {
      console.error('Error deleting account:', error);
      toast({ title: 'Account Deletion Failed', description: `Failed to delete your account: ${error.message}`, variant: 'destructive' });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const profileLink = 
    role === 'student' ? '/student/profile' :
    role === 'client' ? '/client/profile/edit' :
    role === 'admin' && user ? `/profile/${user.uid}` :
    '/auth/login';

  const profileLinkText = 
    role === 'admin' ? 'View My Profile' : 'Edit Profile';
  
  const ProfileIcon = role === 'admin' ? ViewProfileIcon : Edit3;

  return (
    <div className="max-w-2xl mx-auto py-8">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-6 self-start">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
       </Button>
       <h1 className="text-3xl font-bold tracking-tight mb-6">Account Settings</h1>

       <Card className="glass-card">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Manage your public profile information.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div>
                <p className="font-medium">Your Profile</p>
                <p className="text-sm text-muted-foreground">
                  {role === 'admin' ? 'View your basic user profile information.' : 'Update your public profile details and preferences.'}
                </p>
              </div>
              <Button
                variant="outline"
                asChild
                className="mt-2 sm:mt-0"
              >
                <Link href={profileLink}>
                  <ProfileIcon className="mr-2 h-4 w-4" /> {profileLinkText}
                </Link>
              </Button>
            </div>
        </CardContent>
      </Card>

       <Card className="glass-card mt-6">
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Manage your account preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4">
             <div>
               <Label htmlFor="read-receipts-switch" className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                Chat Read Receipts
               </Label>
               <p className="text-sm text-muted-foreground">
                 Allow others to see when you've read their messages. If disabled, you also won't see when others read your messages.
               </p>
             </div>
             <Switch
               id="read-receipts-switch"
               checked={readReceipts}
               onCheckedChange={handleToggleReadReceipts}
               disabled={isUpdatingReceipts}
               className="mt-2 sm:mt-0"
             />
           </div>

           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-4">
             <div>
               <Label htmlFor="browser-notifications-button" className="font-medium flex items-center gap-2">
                {isNotificationsEnabledOnDevice ? <Bell className="h-4 w-4 text-green-500" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                Browser Push Notifications
               </Label>
               <p className="text-sm text-muted-foreground">
                 {isNotificationsEnabledOnDevice 
                   ? "Notifications are enabled for this device. You'll receive updates even when the app is in the background." 
                   : "Enable notifications to get real-time updates on new messages, gig status, etc., on this device."}
               </p>
             </div>
             <Button
                id="browser-notifications-button"
                variant="outline"
                onClick={handleToggleBrowserNotifications}
                className="mt-2 sm:mt-0"
                disabled={isProcessingNotifications}
              >
                {isProcessingNotifications && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isNotificationsEnabledOnDevice ? "Disable on this Device" : "Enable on this Device"}
              </Button>
           </div>
        </CardContent>
      </Card>

       <Card className="glass-card mt-6">
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
                 <p className="text-sm text-muted-foreground">Permanently remove your account and all associated data from HustleUp by PromoFlix.</p>
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
