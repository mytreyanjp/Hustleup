
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, collection, query, where, orderBy, Timestamp, getDocs, updateDoc, arrayUnion, arrayRemove, increment, addDoc, serverTimestamp, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Link as LinkIcon, ArrowLeft, GraduationCap, MessageSquare, Grid3X3, Image as ImageIconLucide, Star as StarIcon, Building, Globe, Info, Briefcase, DollarSign, CalendarDays, UserPlus, UserCheck, Users, ShieldAlert, Copy, MoreVertical, UserX, Share2, Ban } from 'lucide-react';
import type { UserProfile } from '@/context/firebase-context';
import { useFirebase } from '@/context/firebase-context';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import Image from 'next/image';
import { StarRating } from '@/components/ui/star-rating';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { NotificationType } from '@/types/notifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


interface StudentPost {
  id: string;
  imageUrl: string;
  caption?: string;
  createdAt: Timestamp;
  studentId: string; // Ensure studentId is part of the post
}

interface ClientGigForProfile { // Renamed to avoid conflict
  id: string;
  title: string;
  budget: number;
  currency: string;
  deadline: Timestamp;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  createdAt: Timestamp;
  clientId: string;
  selectedStudentId?: string;
}

const REPORT_REASONS = [
  "Spam or Misleading",
  "Inappropriate Content or Profile",
  "Harassment or Hate Speech",
  "Scam or Fraudulent Activity",
  "Impersonation",
  "Intellectual Property Violation",
  "Other",
] as const;

type ReportReason = typeof REPORT_REASONS[number];

async function createSystemNotification(
    recipientUserId: string,
    message: string,
    type: NotificationType,
    adminActorId: string,
    adminActorUsername: string,
    relatedGigId?: string,
    relatedGigTitle?: string,
    link?: string,
) {
    if (!db) {
        console.error("Firestore (db) not available for creating system notification.");
        return;
    }
    try {
        await addDoc(collection(db, 'notifications'), {
            recipientUserId,
            message,
            type,
            relatedGigId: relatedGigId || null,
            relatedGigTitle: relatedGigTitle || null,
            isRead: false,
            createdAt: serverTimestamp(),
            adminActorId,
            adminActorUsername,
            link: link || (relatedGigId ? `/gigs/${relatedGigId}` : '/dashboard'),
        });
    } catch (error) {
        console.error("Error creating system notification document:", error);
    }
}


export default function PublicProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const router = useRouter();
  const { user: viewerUser, userProfile: viewerUserProfile, role: viewerRole, refreshUserProfile } = useFirebase();
  const { toast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<StudentPost[]>([]);
  const [clientOpenGigs, setClientOpenGigs] = useState<ClientGigForProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [isLoadingClientGigs, setIsLoadingClientGigs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isFollowingThisUser, setIsFollowingThisUser] = useState(false);
  const [isFollowProcessing, setIsFollowProcessing] = useState(false);
  const [isBlockedByViewer, setIsBlockedByViewer] = useState(false);
  const [isBlockProcessing, setIsBlockProcessing] = useState(false);


  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [modalUserList, setModalUserList] = useState<UserProfile[]>([]);
  const [isLoadingModalList, setIsLoadingModalList] = useState(false);

  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason | ''>('');
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [showBlockConfirmDialog, setShowBlockConfirmDialog] = useState(false);
  const [showBanConfirmDialog, setShowBanConfirmDialog] = useState(false);
  const [isBanningProcessing, setIsBanningProcessing] = useState(false);


  const fetchProfileData = useCallback(async () => {
    if (!userId) {
      setError("User ID is missing.");
      setIsLoading(false); // Ensure loading is stopped if userId is missing early
      return;
    }
    // No setIsLoading(true) here, it's set in the useEffect or before calling this
    // setError(null); // Reset error at the beginning of a fetch attempt
    // setClientOpenGigs([]); // Reset dependent data

    try {
      const userDocRef = doc(db, 'users', userId);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
         const fetchedProfile = {
             uid: docSnap.id,
             ...docSnap.data(),
             averageRating: docSnap.data().averageRating || 0,
             totalRatings: docSnap.data().totalRatings || 0,
             following: docSnap.data().following || [],
             followersCount: docSnap.data().followersCount || 0,
             blockedUserIds: docSnap.data().blockedUserIds || [],
             isBanned: docSnap.data().isBanned || false,
          } as UserProfile;
         setProfile(fetchedProfile);

         if (viewerUserProfile) {
           setIsFollowingThisUser(viewerUserProfile.following?.includes(fetchedProfile.uid) || false);
           setIsBlockedByViewer(viewerUserProfile.blockedUserIds?.includes(fetchedProfile.uid) || false);
         }


         if (fetchedProfile.role === 'student') {
            setIsLoadingPosts(true);
            const postsQuery = query(
              collection(db, 'student_posts'),
              where('studentId', '==', userId),
              orderBy('createdAt', 'desc')
            );
            const postsSnapshot = await getDocs(postsQuery);
            const fetchedPosts = postsSnapshot.docs.map(postDoc => ({
              id: postDoc.id,
              ...postDoc.data()
            })) as StudentPost[];
            setPosts(fetchedPosts);
            setIsLoadingPosts(false);
         } else if (fetchedProfile.role === 'client') {
            setIsLoadingClientGigs(true);
            const clientGigsQuery = query(
              collection(db, 'gigs'),
              where('clientId', '==', userId),
              where('status', '==', 'open'),
              orderBy('createdAt', 'desc')
            );
            const gigsSnapshot = await getDocs(clientGigsQuery);
            const fetchedClientGigs = gigsSnapshot.docs.map(gigDoc => ({
              id: gigDoc.id,
              ...gigDoc.data()
            })) as ClientGigForProfile[];
            setClientOpenGigs(fetchedClientGigs);
            setIsLoadingClientGigs(false);
         }
      } else {
        setError("Profile not found.");
        setProfile(null);
      }
    } catch (err: any) {
      console.error("Error fetching profile or related data:", err);
      setError("Failed to load profile details. Please try again later. This could be due to a missing Firestore index.");
      setProfile(null); // Ensure profile is null on error
    }
    // No setIsLoading(false) here; it should be handled by the calling useEffect
  }, [userId, toast, viewerUserProfile]); // Added viewerUserProfile as a dependency

  useEffect(() => {
    if (!userId) {
      setError("User ID is missing.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true); // Set loading true at the start of the effect
    setError(null);     // Reset error
    setClientOpenGigs([]); // Reset client gigs
    fetchProfileData().finally(() => setIsLoading(false)); // Call fetch and set loading false in finally
  }, [userId, fetchProfileData]); // fetchProfileData is now stable due to useCallback


  useEffect(() => {
    // This effect only runs when profile or viewerUserProfile changes,
    // to update following/blocked status if viewer logs in/out or profile data loads.
    if (profile && viewerUserProfile) {
      setIsFollowingThisUser(viewerUserProfile.following?.includes(profile.uid) || false);
      setIsBlockedByViewer(viewerUserProfile.blockedUserIds?.includes(profile.uid) || false);
    } else {
      // If there's no viewer profile (e.g., logged out) or no target profile, reset these states
      setIsFollowingThisUser(false);
      setIsBlockedByViewer(false);
    }
  }, [profile, viewerUserProfile]);


   const getInitials = (email: string | null | undefined, username?: string | null, companyName?: string | null) => {
     const nameToUse = profile?.role === 'client' ? companyName : username;
     if (nameToUse && nameToUse.trim() !== '') return nameToUse.substring(0, 2).toUpperCase();
     if (username && username.trim() !== '') return username.substring(0, 2).toUpperCase();
     if (email) return email.substring(0, 2).toUpperCase();
     return '??';
   };

  const formatGigDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) { return 'Invalid date'; }
  };

  const handleFollowToggle = async () => {
    if (!viewerUser || !viewerUserProfile || !profile || !db) {
      toast({ title: "Error", description: "You must be logged in to follow users.", variant: "destructive" });
      return;
    }
    if (viewerUser.uid === profile.uid) {
      toast({ title: "Action Not Allowed", description: "You cannot follow yourself.", variant: "destructive" });
      return;
    }

    setIsFollowProcessing(true);
    const viewerUserDocRef = doc(db, 'users', viewerUser.uid);
    const targetUserDocRef = doc(db, 'users', profile.uid);

    try {
      if (isFollowingThisUser) { 
        await updateDoc(viewerUserDocRef, { following: arrayRemove(profile.uid) });
        await updateDoc(targetUserDocRef, { followersCount: increment(-1) });
        toast({ title: "Unfollowed", description: `You are no longer following ${profile.companyName || profile.username || 'this user'}.` });
        setIsFollowingThisUser(false);
        setProfile(prev => prev ? { ...prev, followersCount: Math.max(0, (prev.followersCount || 1) - 1) } : null);
      } else { 
        await updateDoc(viewerUserDocRef, { following: arrayUnion(profile.uid) });
        await updateDoc(targetUserDocRef, { followersCount: increment(1) });
        toast({ title: "Followed!", description: `You are now following ${profile.companyName || profile.username || 'this user'}.` });
        setIsFollowingThisUser(true);
        setProfile(prev => prev ? { ...prev, followersCount: (prev.followersCount || 0) + 1 } : null);
      }
      if (refreshUserProfile) await refreshUserProfile();
    } catch (err: any) {
      console.error("Error following/unfollowing user:", err);
      toast({ title: "Error", description: `Could not complete action: ${err.message}. For production, consider Cloud Functions for counter updates.`, variant: "destructive" });
    } finally {
      setIsFollowProcessing(false);
    }
  };
  
  const handleShareProfileToChat = () => {
    if (!viewerUser || !profile || viewerRole !== 'admin') { 
        toast({ title: "Action Not Allowed", description: "Only admins can share profiles.", variant: "destructive" });
        return;
    }
    const shareUrl = `/chat?shareUserId=${profile.uid}&shareUsername=${encodeURIComponent(profile.username || 'User')}&shareUserProfilePictureUrl=${encodeURIComponent(profile.profilePictureUrl || '')}&shareUserRole=${profile.role || 'unknown'}`;
    router.push(shareUrl);
  };


  const handleBlockUnblockUser = async () => {
    if (!viewerUser || !viewerUserProfile || !profile || !db) {
        toast({ title: "Error", description: "Action cannot be completed.", variant: "destructive" });
        return;
    }
    setIsBlockProcessing(true);
    const viewerUserDocRef = doc(db, 'users', viewerUser.uid);
    try {
        if (isBlockedByViewer) {
            await updateDoc(viewerUserDocRef, { blockedUserIds: arrayRemove(profile.uid) });
            toast({ title: "User Unblocked", description: `${profile.companyName || profile.username} has been unblocked.` });
            setIsBlockedByViewer(false);
        } else {
            await updateDoc(viewerUserDocRef, { blockedUserIds: arrayUnion(profile.uid) });
            toast({ title: "User Blocked", description: `${profile.companyName || profile.username} has been blocked.` });
            setIsBlockedByViewer(true);
        }
        if (refreshUserProfile) await refreshUserProfile();
    } catch (err: any) {
        console.error("Error blocking/unblocking user:", err);
        toast({ title: "Error", description: `Could not ${isBlockedByViewer ? 'unblock' : 'block'} user: ${err.message}`, variant: "destructive" });
    } finally {
        setIsBlockProcessing(false);
        setShowBlockConfirmDialog(false);
    }
  };

  const handleBanToggle = async () => {
    if (!viewerUser || viewerRole !== 'admin' || !profile || !db || !viewerUserProfile) {
      toast({ title: "Permission Denied", description: "Only admins can ban users.", variant: "destructive" });
      return;
    }
    setIsBanningProcessing(true);
    const targetUserDocRef = doc(db, 'users', profile.uid);
    const batch = writeBatch(db);
    const newBanStatus = !profile.isBanned;

    try {
      batch.update(targetUserDocRef, { isBanned: newBanStatus });
      let cascadingActionsMessage = "";

      if (newBanStatus) { // User is being BANNED
        if (profile.role === 'client') {
          const clientGigsQuery = query(collection(db, 'gigs'), where('clientId', '==', profile.uid), where('status', 'in', ['open', 'in-progress']));
          const clientGigsSnap = await getDocs(clientGigsQuery);
          if (!clientGigsSnap.empty) cascadingActionsMessage += ` ${clientGigsSnap.size} client gig(s) will be closed.`;
          
          for (const gigDoc of clientGigsSnap.docs) {
            batch.update(gigDoc.ref, { status: 'closed' });
            const gigData = gigDoc.data() as ClientGigForProfile;
            if (gigData.selectedStudentId) {
              await createSystemNotification(
                gigData.selectedStudentId,
                `The gig "${gigData.title}" has been closed because the client ${profile.companyName || profile.username}'s account was suspended.`,
                'gig_closed_due_to_ban',
                viewerUser.uid,
                viewerUserProfile.username || 'Admin',
                gigDoc.id,
                gigData.title
              );
            }
          }
        } else if (profile.role === 'student') {
          // Gigs where student is selected
          const assignedGigsQuery = query(collection(db, 'gigs'), where('selectedStudentId', '==', profile.uid), where('status', 'in', ['in-progress', 'awaiting_payout']));
          const assignedGigsSnap = await getDocs(assignedGigsQuery);
          if (!assignedGigsSnap.empty) cascadingActionsMessage += ` Student will be unassigned from ${assignedGigsSnap.size} active gig(s).`;

          for (const gigDoc of assignedGigsSnap.docs) {
            batch.update(gigDoc.ref, { status: 'open', selectedStudentId: null, progressReports: [] }); // Reset progress reports
            const gigData = gigDoc.data() as ClientGigForProfile;
             await createSystemNotification(
                gigData.clientId,
                `The student ${profile.username} working on your gig "${gigData.title}" has had their account suspended. The gig is now open for new applicants.`,
                'student_removed_due_to_ban',
                viewerUser.uid,
                viewerUserProfile.username || 'Admin',
                gigDoc.id,
                gigData.title
            );
          }

          // Remove student from applicants list of open gigs
          const openGigsQuery = query(collection(db, 'gigs'), where('status', '==', 'open'));
          const openGigsSnap = await getDocs(openGigsQuery);
          let applicationsRemovedCount = 0;
          for (const gigDoc of openGigsSnap.docs) {
            const gigData = gigDoc.data() as ClientGigForProfile;
            const currentApplicants = (gigData.applicants || []) as { studentId: string; [key: string]: any }[];
            if (currentApplicants.some(app => app.studentId === profile.uid)) {
              const updatedApplicants = currentApplicants.filter(app => app.studentId !== profile.uid);
              batch.update(gigDoc.ref, { applicants: updatedApplicants });
              applicationsRemovedCount++;
            }
          }
           if (applicationsRemovedCount > 0) cascadingActionsMessage += ` Student removed from ${applicationsRemovedCount} gig application(s).`;


          // Delete student posts
          const studentPostsQuery = query(collection(db, 'student_posts'), where('studentId', '==', profile.uid));
          const studentPostsSnap = await getDocs(studentPostsQuery);
           if (!studentPostsSnap.empty) cascadingActionsMessage += ` ${studentPostsSnap.size} student post(s) will be deleted.`;
          studentPostsSnap.forEach(postDoc => batch.delete(postDoc.ref));
        }
      } else { // User is being UNBANNED
        // Potentially re-open client gigs if they weren't manually closed for other reasons (complex, out of scope for now)
        // Student posts are not automatically restored.
      }

      await batch.commit();
      toast({
        title: newBanStatus ? "User Banned" : "User Unbanned",
        description: `${profile.username || 'User'} has been ${newBanStatus ? 'banned' : 'unbanned'}.${cascadingActionsMessage}`,
        duration: 7000,
      });
      setProfile(prev => prev ? { ...prev, isBanned: newBanStatus } : null);
      
      if (newBanStatus && viewerUserProfile?.blockedUserIds?.includes(profile.uid)) {
        await updateDoc(doc(db, 'users', viewerUser.uid), { blockedUserIds: arrayRemove(profile.uid) });
        setIsBlockedByViewer(false);
        if (refreshUserProfile) await refreshUserProfile();
      }

    } catch (error: any) {
      console.error("Error during ban/unban process:", error);
      toast({ title: "Error", description: `Could not update ban status or perform cascading actions: ${error.message}`, variant: "destructive" });
    } finally {
      setIsBanningProcessing(false);
      setShowBanConfirmDialog(false);
    }
  };


  const handleOpenFollowingModal = async () => {
    if (!profile || !profile.following || profile.following.length === 0) {
        setModalUserList([]);
        setShowFollowingModal(true);
        return;
    }
    if (!db) {
        toast({ title: "Database Error", description: "Could not load following list.", variant: "destructive" });
        return;
    }
    setIsLoadingModalList(true);
    setShowFollowingModal(true);
    try {
        const followingProfilesPromises = profile.following.map(uid => getDoc(doc(db, 'users', uid)));
        const followingSnapshots = await Promise.all(followingProfilesPromises);
        const fetchedProfiles = followingSnapshots
            .filter(snap => snap.exists())
            .map(snap => ({ uid: snap.id, ...snap.data() } as UserProfile));
        setModalUserList(fetchedProfiles);
    } catch (error) {
        console.error("Error fetching following list:", error);
        toast({ title: "Error", description: "Could not load following list.", variant: "destructive" });
        setModalUserList([]);
    } finally {
        setIsLoadingModalList(false);
    }
  };

  const handleOpenFollowersModal = async () => {
    if (!profile || !db) {
        toast({ title: "Error", description: "Profile data not available.", variant: "destructive" });
        return;
    }
    if (profile.followersCount === 0) {
        setModalUserList([]);
        setShowFollowersModal(true);
        return;
    }

    setIsLoadingModalList(true);
    setShowFollowersModal(true);
    try {
        const followersQuery = query(collection(db, 'users'), where('following', 'array-contains', profile.uid));
        const followersSnapshots = await getDocs(followersQuery);
        const fetchedProfiles = followersSnapshots.docs
            .map(snap => ({ uid: snap.id, ...snap.data() } as UserProfile));
        setModalUserList(fetchedProfiles);
    } catch (error: any) {
        console.error("Error fetching followers list:", error);
        toast({ title: "Error", description: `Could not load followers list: ${error.message}. Check for Firestore index requirements.`, variant: "destructive" });
        setModalUserList([]);
    } finally {
        setIsLoadingModalList(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!viewerUser || !viewerUserProfile || !profile || !db) {
      toast({ title: "Error", description: "Cannot submit report. Missing user data or database connection.", variant: "destructive" });
      return;
    }
    if (!reportReason) {
      toast({ title: "Reason Required", description: "Please select a reason for reporting.", variant: "destructive" });
      return;
    }
    setIsSubmittingReport(true);
    try {
      const reportData = {
        reportedUserId: profile.uid,
        reportedUsername: profile.username || profile.email || 'Unknown Profile',
        reporterUserId: viewerUser.uid,
        reporterUsername: viewerUserProfile.username || viewerUser.email?.split('@')[0] || 'Anonymous Reporter',
        reason: reportReason,
        details: reportDetails.trim() || '',
        reportedAt: serverTimestamp(),
        status: 'pending_review',
      };
      await addDoc(collection(db, 'account_reports'), reportData);
      toast({ title: "Report Submitted", description: "Thank you for helping HustleUp safe. Your report has been received." });
      setShowReportDialog(false);
      setReportReason('');
      setReportDetails('');
    } catch (err: any) {
      console.error("Error submitting report:", err);
      toast({ title: "Report Failed", description: `Could not submit report: ${err.message}`, variant: "destructive" });
    } finally {
      setIsSubmittingReport(false);
    }
  };


  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
         <p className="text-destructive mb-4">{error}</p>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
         </Button>
      </div>
    );
  }

  if (!profile) {
    return <div className="text-center py-10 text-muted-foreground">Profile not found.</div>;
  }
  
  if (viewerUserProfile && viewerUserProfile.blockedUserIds?.includes(userId)) {
    return (
      <div className="max-w-xl mx-auto py-8 text-center space-y-4">
         <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-2 self-start absolute top-20 left-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Card className="glass-card p-8">
            <CardHeader>
                <UserX className="mx-auto h-16 w-16 text-destructive mb-3"/>
                <CardTitle>User Blocked</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">You have blocked this user. To see their profile, you need to unblock them.</p>
            </CardContent>
            <CardFooter>
                <Button onClick={() => handleBlockUnblockUser()} disabled={isBlockProcessing} className="w-full">
                    {isBlockProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Unblock User
                </Button>
            </CardFooter>
        </Card>
      </div>
    );
  }

  if (profile.isBanned && viewerRole !== 'admin') {
    return (
      <div className="max-w-xl mx-auto py-8 text-center space-y-4">
         <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-2 self-start absolute top-20 left-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Card className="glass-card p-8 border-destructive">
            <CardHeader>
                <Ban className="mx-auto h-16 w-16 text-destructive mb-3"/>
                <CardTitle className="text-destructive">Account Suspended</CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground">This account is currently suspended and cannot be viewed.</p>
            </CardContent>
        </Card>
      </div>
    );
  }


  const isOwnProfile = viewerUser?.uid === profile.uid;
  const displayName = profile.role === 'client'
    ? (profile.companyName || profile.username || 'Client Profile')
    : (profile.username || 'Student Profile');

  const followingCount = profile.following?.length || 0;


  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-2 self-start">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

      <Card className="glass-card overflow-hidden">
        <CardHeader className="p-4 md:p-6">
           <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
               <Avatar className="h-20 w-20 sm:h-32 sm:w-32 text-4xl border-2 border-background shadow-md">
                  <AvatarImage src={profile.profilePictureUrl} alt={displayName} />
                   <AvatarFallback>{getInitials(profile.email, profile.username, profile.companyName)}</AvatarFallback>
               </Avatar>
               <div className="sm:flex-1 space-y-2 text-center sm:text-left w-full">
                   <div className='flex flex-row items-center justify-between gap-2'>
                        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                            {displayName}
                            {profile.role === 'student' && <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />}
                            {profile.role === 'client' && <Building className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />}
                            {profile.isBanned && viewerRole === 'admin' && (
                               <Badge variant="destructive" className="text-xs sm:text-sm ml-2"><Ban className="mr-1 h-3 w-3"/>BANNED</Badge>
                            )}
                        </h1>
                        {!isOwnProfile && viewerUser && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 data-[state=open]:bg-muted shrink-0">
                                        <MoreVertical className="h-5 w-5" />
                                        <span className="sr-only">Profile Options</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    {viewerRole === 'admin' && ( 
                                      <DropdownMenuItem 
                                        onSelect={handleShareProfileToChat} 
                                        className="cursor-pointer"
                                      >
                                          <Share2 className="mr-2 h-4 w-4" />
                                          <span>Share Profile to Chat</span>
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem 
                                      onSelect={() => { setShowReportDialog(true); }} 
                                      className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                                    >
                                        <ShieldAlert className="mr-2 h-4 w-4" />
                                        <span>Report Account</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onSelect={() => { setShowBlockConfirmDialog(true);}} 
                                      className={cn("cursor-pointer", isBlockedByViewer ? "text-green-600 focus:bg-green-500/10 focus:text-green-700" : "text-destructive focus:bg-destructive/10 focus:text-destructive")}
                                    >
                                        {isBlockedByViewer ? <UserCheck className="mr-2 h-4 w-4" /> : <UserX className="mr-2 h-4 w-4" />}
                                        <span>{isBlockedByViewer ? "Unblock Account" : "Block Account"}</span>
                                    </DropdownMenuItem>
                                    {viewerRole === 'admin' && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onSelect={() => setShowBanConfirmDialog(true)}
                                                className={cn("cursor-pointer", profile.isBanned ? "text-green-600 focus:bg-green-500/10 focus:text-green-700" : "text-destructive focus:bg-destructive/10 focus:text-destructive")}
                                            >
                                                {profile.isBanned ? <UserCheck className="mr-2 h-4 w-4" /> : <Ban className="mr-2 h-4 w-4" />}
                                                <span>{profile.isBanned ? "Unban User" : "Ban User"}</span>
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                   </div>

                    <div className="flex flex-col sm:flex-row items-center sm:justify-start gap-2 pt-1">
                        {isOwnProfile ? (
                            <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
                                <Link href={profile.role === 'student' ? `/student/profile` : `/client/profile/edit`}>
                                    Edit My Profile
                                </Link>
                            </Button>
                        ) : viewerUser && profile.role && (
                            <>
                                <Button size="sm" onClick={handleFollowToggle} disabled={isFollowProcessing} className="w-full sm:w-auto">
                                  {isFollowProcessing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : (isFollowingThisUser ? <UserCheck className="mr-1 h-4 w-4" /> : <UserPlus className="mr-1 h-4 w-4" />)}
                                  {isFollowingThisUser ? 'Unfollow' : 'Follow'}
                                </Button>
                                {viewerRole === 'admin' && profile.role !== 'admin' && !profile.isBanned && ( 
                                  <Button size="sm" variant="default" asChild className="w-full sm:w-auto">
                                      <Link href={`/chat?userId=${profile.uid}`}>
                                          <MessageSquare className="mr-1 h-4 w-4"/>Chat
                                      </Link>
                                  </Button>
                                )}
                                {viewerRole !== 'admin' && profile.role === 'admin' && !profile.isBanned && (
                                  <Button size="sm" variant="default" asChild className="w-full sm:w-auto">
                                    <Link href={`/chat?userId=${profile.uid}`}>
                                      <MessageSquare className="mr-1 h-4 w-4"/>Chat with Admin
                                    </Link>
                                  </Button>
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex items-center justify-center sm:justify-start gap-4 text-xs sm:text-sm text-muted-foreground pt-2">
                        <button onClick={handleOpenFollowersModal} className="flex items-center gap-1 hover:underline focus:outline-none">
                            <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                            <span className="font-semibold text-foreground">{profile.followersCount || 0}</span> Followers
                        </button>
                        <button onClick={handleOpenFollowingModal} className="flex items-center gap-1 hover:underline focus:outline-none">
                           <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                           <span className="font-semibold text-foreground">{followingCount}</span> Following
                        </button>
                    </div>

                   {profile.role === 'client' && profile.username && profile.companyName && profile.companyName !== profile.username && (
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Contact: {profile.username}</p>
                    )}

                   {profile.role === 'student' && profile.bio && (
                        <p className="text-xs sm:text-sm text-foreground/90 mt-1 line-clamp-3">{profile.bio}</p>
                   )}
                   {profile.role === 'student' && profile.averageRating !== undefined && profile.totalRatings !== undefined && (
                        <div className="flex items-center gap-2 mt-1 justify-center sm:justify-start">
                            <StarRating value={profile.averageRating} size={16} isEditable={false} />
                            {profile.totalRatings > 0 ? (
                                <span className="text-xs sm:text-sm text-muted-foreground">
                                    ({profile.averageRating.toFixed(1)} from {profile.totalRatings} rating{profile.totalRatings !== 1 ? 's' : ''})
                                </span>
                            ) : (
                                <span className="text-xs sm:text-sm text-muted-foreground">No ratings yet</span>
                            )}
                        </div>
                    )}
               </div>
           </div>
        </CardHeader>

        <Separator />

        {profile.role === 'client' && (
            <CardContent className="p-4 md:p-6 space-y-3">
                <h3 className="font-semibold text-md sm:text-lg text-foreground mb-2 flex items-center gap-2">
                    <Building className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" /> Company Details
                </h3>

                {profile.companyDescription ? (
                    <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-1" />
                        <div>
                            <p className="text-xs text-muted-foreground">About Company</p>
                            <p className="text-sm whitespace-pre-wrap">{profile.companyDescription}</p>
                        </div>
                    </div>
                ) : (
                     <div className="flex items-center gap-1.5">
                        <Info className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">Company description not provided.</p>
                    </div>
                )}
                {profile.website ? (
                  <div className="flex items-start gap-2 mt-2">
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground mt-1" />
                    <div>
                        <p className="text-xs text-muted-foreground">Website</p>
                        <a
                        href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline break-all"
                        >
                        {profile.website}
                        </a>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Globe className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">Website not provided.</p>
                  </div>
                )}
            </CardContent>
        )}


        {profile.role === 'student' && (
          <>
            <CardContent className="p-4 md:p-6 space-y-4">
               {profile.skills && profile.skills.length > 0 && (
                  <div>
                     <h3 className="font-semibold text-md sm:text-lg mb-2 flex items-center gap-2">
                        <Users className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" /> Skills
                     </h3>
                     <div className="flex flex-wrap gap-1 sm:gap-2">
                       {profile.skills.map((skill, index) => (
                         <Badge key={index} variant="secondary" className="text-xs sm:text-sm px-2 py-0.5 sm:px-3 sm:py-1">{skill}</Badge>
                       ))}
                     </div>
                  </div>
               )}

                {profile.portfolioLinks && profile.portfolioLinks.length > 0 && (
                  <div>
                     <h3 className="font-semibold text-md sm:text-lg mb-2 flex items-center gap-2">
                        <LinkIcon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" /> Portfolio & Links
                     </h3>
                     <ul className="space-y-1 sm:space-y-2">
                       {profile.portfolioLinks.map((link, index) => (
                         <li key={index}>
                           <a
                             href={link.startsWith('http') ? link : `https://${link}`}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="text-xs sm:text-sm text-primary hover:underline flex items-center gap-1 break-all"
                           >
                             <LinkIcon className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                             {link}
                           </a>
                         </li>
                       ))}
                     </ul>
                  </div>
               )}

               {!profile.bio && (!profile.skills || profile.skills.length === 0) && (!profile.portfolioLinks || profile.portfolioLinks.filter(link => link.trim() !== '').length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">This student hasn't added detailed profile information yet.</p>
               )}
            </CardContent>

            <Separator />
            <div className="p-4 md:p-6">
                <h3 className="font-semibold mb-3 sm:mb-4 text-md sm:text-lg flex items-center gap-2">
                    <Grid3X3 className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" /> Posts
                </h3>
                {isLoadingPosts ? (
                    <div className="flex justify-center items-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : posts.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-2 md:gap-4">
                        {posts.map(post => (
                            <div key={post.id} className="aspect-square relative group overflow-hidden rounded-md">
                                {post.imageUrl && post.imageUrl.trim() !== '' ? (
                                    <Image
                                        src={post.imageUrl}
                                        alt={post.caption || `Post by ${profile?.username || 'user'}`}
                                        layout="fill"
                                        objectFit="cover"
                                        className="group-hover:scale-105 transition-transform duration-300"
                                        data-ai-hint="student content"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full w-full bg-muted rounded-md">
                                        <ImageIconLucide className="h-10 w-10 text-muted-foreground" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-8">
                        <ImageIconLucide className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm">This student hasn't made any posts yet.</p>
                        {isOwnProfile && (
                            <Button asChild variant="link" className="mt-2">
                                <Link href="/student/posts/new">Create your first post</Link>
                            </Button>
                        )}
                    </div>
                )}
            </div>
          </>
        )}

        {profile.role === 'client' && (
            <>
                <Separator />
                <div className="p-4 md:p-6">
                    <h3 className="font-semibold mb-3 sm:mb-4 text-md sm:text-lg flex items-center gap-2">
                        <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" /> Open Gigs
                    </h3>
                    {isLoadingClientGigs ? (
                        <div className="flex justify-center items-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : clientOpenGigs.length > 0 ? (
                        <div className="space-y-3 sm:space-y-4">
                            {clientOpenGigs.map(gig => (
                                <Card key={gig.id} className="glass-card">
                                    <CardHeader className="pb-3 p-3 sm:p-4">
                                        <CardTitle className="text-sm sm:text-md">{gig.title}</CardTitle>
                                        <CardDescription className="text-xs">Posted {formatGigDate(gig.createdAt)}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-1 pb-3 p-3 sm:p-4 pt-0">
                                        <p className="text-xs sm:text-sm flex items-center gap-1">
                                            <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                                            Payment: {gig.currency} {gig.budget.toFixed(2)}
                                        </p>
                                        <p className="text-xs sm:text-sm flex items-center gap-1">
                                            <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                                            Deadline: {gig.deadline.toDate().toLocaleDateString()}
                                        </p>
                                    </CardContent>
                                    <CardFooter className="p-3 sm:p-4 pt-0">
                                        <Button asChild size="sm" className="w-full text-xs sm:text-sm">
                                            <Link href={`/gigs/${gig.id}`}>View Details</Link>
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            <Briefcase className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-2 text-gray-400" />
                            <p className="text-sm">This client has no open gigs currently.</p>
                            {isOwnProfile && (
                                <Button asChild variant="link" className="mt-2">
                                    <Link href="/client/gigs/new">Post a Gig</Link>
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </>
        )}
      </Card>

      <AlertDialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Report {displayName}</AlertDialogTitle>
            <AlertDialogDescription>
                Help us keep HustleUp safe. If this user is violating our community guidelines, please let us know.
            </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-4 py-2">
                <div>
                    <Label htmlFor="reportReason" className="text-sm font-medium">Reason for reporting</Label>
                    <Select value={reportReason} onValueChange={(value) => setReportReason(value as ReportReason)}>
                        <SelectTrigger id="reportReason" className="w-full mt-1">
                            <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                        <SelectContent>
                            {REPORT_REASONS.map(reason => (
                                <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label htmlFor="reportDetails" className="text-sm font-medium">Additional Details (Optional)</Label>
                    <Textarea
                        id="reportDetails"
                        placeholder="Provide more information about the issue..."
                        value={reportDetails}
                        onChange={(e) => setReportDetails(e.target.value)}
                        rows={3}
                        className="mt-1"
                    />
                </div>
            </div>
            <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingReport}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitReport} disabled={isSubmittingReport || !reportReason}>
                {isSubmittingReport && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Report
            </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        <AlertDialog open={showBlockConfirmDialog} onOpenChange={setShowBlockConfirmDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {isBlockedByViewer
                            ? `Unblocking ${displayName} will allow you to see their content and interact with them again.`
                            : `Blocking ${displayName} will prevent you from seeing their gigs, posts, and interacting with them. They will not be notified.`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setShowBlockConfirmDialog(false)} disabled={isBlockProcessing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleBlockUnblockUser}
                        disabled={isBlockProcessing}
                        className={cn(isBlockedByViewer ? "" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                    >
                        {isBlockProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isBlockedByViewer ? "Unblock" : "Block"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

      {viewerRole === 'admin' && (
        <AlertDialog open={showBanConfirmDialog} onOpenChange={setShowBanConfirmDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm {profile?.isBanned ? "Unban" : "Ban"} User</AlertDialogTitle>
                    <AlertDialogDescription>
                        {profile?.isBanned
                            ? `Unbanning ${displayName} will restore their access to platform features.`
                            : `Banning ${displayName} will restrict their ability to post gigs, apply for work, and use other platform features. Their active work and posts may be affected. They will be notified of this action.`}
                        Are you sure?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setShowBanConfirmDialog(false)} disabled={isBanningProcessing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleBanToggle}
                        disabled={isBanningProcessing}
                        className={cn(profile?.isBanned ? "" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground")}
                    >
                        {isBanningProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {profile?.isBanned ? "Yes, Unban User" : "Yes, Ban User"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}

      <Dialog open={showFollowersModal} onOpenChange={setShowFollowersModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Followers</DialogTitle>
            <DialogDescription>Users who follow {displayName}.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px] py-4">
            {isLoadingModalList ? (
              <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : modalUserList.length > 0 ? (
              <ul className="space-y-3">
                {modalUserList.map(userItem => (
                  <li key={userItem.uid} className="flex items-center justify-between">
                    <Link href={`/profile/${userItem.uid}`} className="flex items-center gap-3 hover:underline" onClick={() => setShowFollowersModal(false)}>
                      <Avatar className="h-8 w-8"><AvatarImage src={userItem.profilePictureUrl} alt={userItem.username} /><AvatarFallback>{getInitials(userItem.email, userItem.username, userItem.companyName)}</AvatarFallback></Avatar>
                      <span className="text-sm font-medium">{userItem.companyName || userItem.username || 'User'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (<p className="text-sm text-muted-foreground text-center">This user has no followers yet.</p>)}
          </ScrollArea>
          <DialogFooter><DialogClose asChild><Button type="button" variant="secondary">Close</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFollowingModal} onOpenChange={setShowFollowingModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Following</DialogTitle>
            <DialogDescription>Users {displayName} is following.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px] py-4">
            {isLoadingModalList ? (
              <div className="flex justify-center items-center h-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : modalUserList.length > 0 ? (
              <ul className="space-y-3">
                {modalUserList.map((followedUser) => (
                  <li key={followedUser.uid} className="flex items-center justify-between">
                    <Link href={`/profile/${followedUser.uid}`} className="flex items-center gap-3 hover:underline" onClick={() => setShowFollowingModal(false)}>
                      <Avatar className="h-8 w-8"><AvatarImage src={followedUser.profilePictureUrl} alt={followedUser.username} /><AvatarFallback>{getInitials(followedUser.email, followedUser.username, followedUser.companyName)}</AvatarFallback></Avatar>
                      <span className="text-sm font-medium">{followedUser.companyName || followedUser.username || 'User'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (<p className="text-sm text-muted-foreground text-center">Not following anyone yet.</p>)}
          </ScrollArea>
          <DialogFooter><DialogClose asChild><Button type="button" variant="secondary">Close</Button></DialogClose></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


