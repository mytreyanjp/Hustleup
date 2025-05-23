
"use client";

import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Search, Wallet, UserCircle, Edit, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Skill } from '@/lib/constants';

interface Gig {
  id: string;
  title: string;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  requiredSkills: Skill[];
  applicants?: { studentId: string; status?: 'pending' | 'accepted' | 'rejected' }[];
  // other gig properties
}

export default function StudentDashboardPage() {
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const router = useRouter();

  const [availableGigsCount, setAvailableGigsCount] = useState<number | null>(null);
  const [activeApplicationsCount, setActiveApplicationsCount] = useState<number | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Protect route
  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'student') {
        router.push('/auth/login?redirect=/student/dashboard');
      }
    }
  }, [user, role, authLoading, router]);

  // Fetch dashboard stats
  useEffect(() => {
    if (user && userProfile && role === 'student') {
      const fetchStudentDashboardStats = async () => {
        setIsLoadingStats(true);
        try {
          // 1. Fetch available gigs based on student skills
          const gigsCollectionRef = collection(db, 'gigs');
          const openGigsQuery = query(gigsCollectionRef, where('status', '==', 'open'));
          const openGigsSnapshot = await getDocs(openGigsQuery);
          const allOpenGigs = openGigsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Gig));

          let matchingGigs = 0;
          if (userProfile.skills && userProfile.skills.length > 0) {
            const studentSkillsLower = (userProfile.skills as Skill[]).map(s => s.toLowerCase());
            matchingGigs = allOpenGigs.filter(gig =>
              gig.requiredSkills.some(reqSkill => {
                const reqSkillLower = reqSkill.toLowerCase();
                return studentSkillsLower.some(studentSkillLower =>
                  studentSkillLower.includes(reqSkillLower) || reqSkillLower.includes(studentSkillLower)
                );
              })
            ).length;
          } else {
            // If student has no skills, they technically can't match any skill-based gigs by this logic.
            // Or, show all open gigs and prompt to add skills. For now, strict matching.
            matchingGigs = 0;
          }
          setAvailableGigsCount(matchingGigs);

          // 2. Fetch active applications
          // This requires fetching all gigs and checking the applicants array.
          // This is not perfectly scalable. A dedicated 'applications' collection would be better.
          const allGigsSnapshot = await getDocs(collection(db, 'gigs'));
          let currentActiveApplications = 0;
          allGigsSnapshot.forEach(doc => {
            const gig = doc.data() as Gig;
            if (gig.applicants) {
              const studentApplication = gig.applicants.find(app => app.studentId === user.uid);
              if (studentApplication && (studentApplication.status === 'pending' || studentApplication.status === 'accepted')) {
                currentActiveApplications++;
              }
            }
          });
          setActiveApplicationsCount(currentActiveApplications);

        } catch (error) {
          console.error("Error fetching student dashboard stats:", error);
          setAvailableGigsCount(0); // Fallback on error
          setActiveApplicationsCount(0); // Fallback on error
        } finally {
          setIsLoadingStats(false);
        }
      };
      fetchStudentDashboardStats();
    } else if (!authLoading && userProfile === null && user && role === 'student') {
      // Profile might still be loading or is genuinely null (e.g. new user, Firestore doc not created yet)
      // Set stats to 0 or a loading indicator until profile is confirmed
      setIsLoadingStats(false);
      setAvailableGigsCount(0);
      setActiveApplicationsCount(0);
    }
  }, [user, userProfile, role, authLoading]);


  const getProfileCompletion = () => {
    if (!userProfile) return 0;
    let score = 0;
    const totalFields = 4; // Consider username, bio, skills, portfolioLinks
    
    // Check if username is set and different from a default (e.g., email prefix)
    if (userProfile.username && user?.email && userProfile.username !== user.email.split('@')[0]) {
      score++;
    } else if (userProfile.username && !user?.email) { // Username exists, no email to compare (less likely)
      score++;
    }

    if (userProfile.bio && userProfile.bio.trim() !== '') score++;
    if (userProfile.skills && userProfile.skills.length > 0) score++;
    if (userProfile.portfolioLinks && userProfile.portfolioLinks.filter(link => link.trim() !== '').length > 0) score++;
    
    return Math.round((score / totalFields) * 100);
  };
  const profileCompletion = getProfileCompletion();

  if (authLoading || (isLoadingStats && user && role === 'student' && userProfile)) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || role !== 'student') {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <p className="text-muted-foreground">Verifying access...</p>
      </div>
    );
  }

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
           <CardTitle>Welcome, {userProfile?.username || user.email?.split('@')[0] || 'Student'}!</CardTitle>
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
            <div className="text-2xl font-bold">
                {isLoadingStats && availableGigsCount === null ? <Loader2 className="h-6 w-6 animate-spin" /> : availableGigsCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Opportunities matching your skills.
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
            <div className="text-2xl font-bold">
                {isLoadingStats && activeApplicationsCount === null ? <Loader2 className="h-6 w-6 animate-spin" /> : activeApplicationsCount}
            </div>
            <p className="text-xs text-muted-foreground">
              Applications that are pending or accepted.
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
           {/* TODO: Implement recent messages preview from chat data */}
         </CardContent>
       </Card>
    </div>
  );
}


    