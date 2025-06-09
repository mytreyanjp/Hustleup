
"use client";

import { useFirebase } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ShieldCheck, Settings, Briefcase, HelpCircle } from 'lucide-react'; // Added HelpCircle
import Link from 'next/link';

export default function AdminDashboardPage() {
  const { userProfile } = useFirebase();

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Admin Dashboard</h1>
      </div>
      <p className="text-md sm:text-lg text-muted-foreground">
        Welcome, {userProfile?.username || 'Admin'}! Manage the platform here.
      </p>

      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
         <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-sm font-medium">Manage Admins</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Promote or demote users to admin roles.
            </p>
             <Button variant="outline" size="sm" className="text-sm w-full sm:w-auto" asChild>
                <Link href="/admin/manage-admins">Go to Manage Admins</Link>
             </Button>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-sm font-medium">Manage Gigs</CardTitle>
            <Briefcase className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              View, filter, and manage all gigs on the platform.
            </p>
             <Button variant="outline" size="sm" className="text-sm w-full sm:w-auto" asChild>
                <Link href="/admin/manage-gigs">Go to Manage Gigs</Link>
             </Button>
          </CardContent>
        </Card>
        
        <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-sm font-medium">Support Chat Requests</CardTitle> {/* New Card */}
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              View and respond to user support chat requests.
            </p>
             <Button variant="outline" size="sm" className="text-sm w-full sm:w-auto" asChild>
                <Link href="/admin/support-requests">View Requests</Link>
             </Button>
          </CardContent>
        </Card>

        <Card className="glass-card opacity-50 cursor-not-allowed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-sm font-medium">Content Moderation (Soon)</CardTitle>
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Review reported content and users.
            </p>
             <Button variant="outline" size="sm" className="text-sm w-full sm:w-auto" disabled>
                Coming Soon
             </Button>
          </CardContent>
        </Card>
        
        <Card className="glass-card opacity-50 cursor-not-allowed">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
            <CardTitle className="text-sm font-medium">Platform Settings (Soon)</CardTitle>
            <Settings className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Configure global application settings.
            </p>
             <Button variant="outline" size="sm" className="text-sm w-full sm:w-auto" disabled>
                Coming Soon
             </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
