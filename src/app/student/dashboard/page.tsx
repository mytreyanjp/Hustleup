
"use client";

import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Search, Wallet, UserCircle, Edit, Loader2 } from 'lucide-react'; // Added Loader2
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function StudentDashboardPage() {
  const { user, userProfile, loading, role } = useFirebase();
  const router = useRouter();

  // Protect route: Redirect if not loading, not logged in, or not a student
  useEffect(() => {
    if (!loading) { // Only check after initial context loading is done
      if (!user || role !== 'student') {
        router.push('/auth/login'); // Or show an unauthorized page
      }
    }
  }, [user, role, loading, router]);

  // Calculate profile completion (example logic)
  const getProfileCompletion = () => {
    if (!userProfile) return 0;
    let score = 0;
    const totalFields = 4; // username, bio, skills, portfolioLinks
    if (userProfile.username && userProfile.username !== userProfile.email?.split('@')[0]) score++;
    if (userProfile.bio) score++;
    if (userProfile.skills && userProfile.skills.length > 0) score++;
    if (userProfile.portfolioLinks && userProfile.portfolioLinks.length > 0) score++;
    return Math.round((score / totalFields) * 100);
  };
  const profileCompletion = getProfileCompletion();

  // Show loading state from context
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If context is loaded, but user is not a student (or not logged in), show placeholder.
  // The useEffect above will handle the redirect.
  if (!user || role !== 'student') {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <p className="text-muted-foreground">Verifying access...</p>
      </div>
    );
  }

  // If all checks pass, render dashboard
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
       <h1 className="text-3xl font-bold tracking-tight">Student Dashboard</h1>
       <Button asChild variant="outline">
         <Link href="/student/profile">
           <Edit className="mr-2 h-4 w-4" /> Edit Profile
         </Link>
       </Button>
      </div>

       <Card className="glass-card">
         <CardHeader>
           <CardTitle>Welcome, {userProfile?.username || 'Student'}!</CardTitle>
           <CardDescription>Manage your profile, applications, and earnings here.</CardDescription>
         </CardHeader>
         <CardContent>
            <p>Profile Completion: {profileCompletion}%</p>
            {/* TODO: Add a Progress bar component */}
            {profileCompletion < 100 && (
             <p className="text-sm text-muted-foreground mt-1">
               Complete your profile to attract more clients!{' '}
               <Link href="/student/profile" className="text-primary hover:underline">Update Profile</Link>
             </p>
           )}
         </CardContent>
       </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
         <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Gigs</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div> {/* TODO: Fetch actual count */}
            <p className="text-xs text-muted-foreground">
              Find new opportunities to showcase your skills.
            </p>
            <Button variant="link" size="sm" className="p-0 h-auto mt-2" asChild>
              <Link href="/gigs/browse">Browse Gigs</Link>
            </Button>
          </CardContent>
        </Card>

         <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div> {/* TODO: Fetch actual count */}
            <p className="text-xs text-muted-foreground">
              Track the status of your gig applications.
            </p>
             <Button variant="link" size="sm" className="p-0 h-auto mt-2" asChild>
                 <Link href="/student/applications">View Applications</Link>
             </Button>
          </CardContent>
        </Card>

         <Card className="glass-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$0.00</div> {/* TODO: Fetch actual balance */}
            <p className="text-xs text-muted-foreground">
              Total earnings from completed gigs.
            </p>
             <Button variant="link" size="sm" className="p-0 h-auto mt-2" asChild>
                 <Link href="/student/wallet">View Wallet History</Link>
             </Button>
          </CardContent>
        </Card>
      </div>

       <Card className="glass-card">
         <CardHeader>
           <CardTitle>Recent Messages</CardTitle>
            <CardDescription>Latest updates from clients.</CardDescription>
         </CardHeader>
         <CardContent>
           <p className="text-sm text-muted-foreground">No new messages.</p>
           {/* TODO: Implement recent messages preview */}
         </CardContent>
       </Card>
    </div>
  );
}
