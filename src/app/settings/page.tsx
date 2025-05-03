"use client";

import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const { user, loading } = useFirebase();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login?redirect=/settings');
    }
  }, [user, loading, router]);

  if (loading) {
     return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
     // This case should ideally be handled by the redirect, but acts as a fallback
     return <div className="text-center py-10"><p>Please log in to view settings.</p></div>;
  }

  // TODO: Implement actual setting functionalities
  const handleChangePassword = () => { console.log("Change Password clicked"); };
  const handleUpdateEmail = () => { console.log("Update Email clicked"); };
  const handleDeleteAccount = () => { console.log("Delete Account clicked"); };

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
                 <p className="text-sm text-muted-foreground">Update your account password.</p>
              </div>
              <Button variant="outline" onClick={handleChangePassword} className="mt-2 sm:mt-0" disabled>Change Password (Soon)</Button>
           </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4">
              <div>
                 <p className="font-medium">Email Address</p>
                 <p className="text-sm text-muted-foreground">Current: {user.email}</p>
              </div>
              <Button variant="outline" onClick={handleUpdateEmail} className="mt-2 sm:mt-0" disabled>Update Email (Soon)</Button>
           </div>
        </CardContent>
      </Card>

       <Card className="mt-6 glass-card border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
           <CardDescription>These actions are permanent and cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <div>
                 <p className="font-medium">Delete Account</p>
                 <p className="text-sm text-muted-foreground">Permanently remove your account and all associated data.</p>
              </div>
               {/* TODO: Implement confirmation dialog */}
              <Button variant="destructive" onClick={handleDeleteAccount} className="mt-2 sm:mt-0" disabled>Delete Account (Soon)</Button>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
