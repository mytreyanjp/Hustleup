
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, Timestamp, addDoc, collection, serverTimestamp } from 'firebase/firestore'; // Added addDoc, collection, serverTimestamp
import { db, storage } from '@/config/firebase';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CalendarDays, Send, UserCircle, ArrowLeft, Bookmark, BookmarkCheck, Globe, Building, Share2, Layers, Edit, FileText as FileIconLucide, MessageSquare, Hourglass, Ban, IndianRupee, Link as LinkIcon } from 'lucide-react'; // Added IndianRupee, LinkIcon
import { formatDistanceToNow, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { NotificationType } from '@/types/notifications'; 

// Define ProgressReport related interfaces directly here or import if moved to a shared types file
interface StudentSubmission {
  text: string;
  fileUrl?: string;
  fileName?: string;
  submittedAt: Timestamp;
}

interface ProgressReport {
  reportNumber: number;
  deadline?: Timestamp | null;
  studentSubmission?: StudentSubmission | null;
  clientStatus?: 'pending_review' | 'approved' | 'rejected' | null;
  clientFeedback?: string | null;
  reviewedAt?: Timestamp | null;
}

interface Gig {
  id: string;
  title: string;
  description: string;
  budget: number; // This will be the GROSS budget
  currency: string;
  deadline: Timestamp;
  requiredSkills: string[];
  clientId: string;
  clientUsername?: string;
  clientDisplayName?: string;
  clientAvatarUrl?: string;
  createdAt: Timestamp;
  status: 'open' | 'in-progress' | 'completed' | 'closed' | 'awaiting_payout';
  applicants?: { studentId: string; studentUsername: string; message?: string; appliedAt: Timestamp }[];
  selectedStudentId?: string | null;
  numberOfReports?: number;
  progressReports?: ProgressReport[];
  sharedDriveLink?: string; 
}

const COMMISSION_RATE = 0.02; // 2%

// Notification creation helper
const createNotification = async (
    recipientUserId: string,
    message: string,
    type: NotificationType,
    relatedGigId?: string,
    relatedGigTitle?: string,
    link?: string,
    actorUserId?: string,
    actorUsername?: string
) => {
    if (!db) {
        console.error("Firestore (db) not available for creating notification.");
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
            ...(actorUserId && { actorUserId }),
            ...(actorUsername && { actorUsername }),
            link: link || (relatedGigId ? `/gigs/${relatedGigId}` : '/notifications'),
        });
        console.log(`Notification of type ${type} created for ${recipientUserId}: ${message}`);
    } catch (error) {
        console.error("Error creating notification document:", error);
    }
};


export default function GigDetailPage() {
  const params = useParams();
  const gigId = params.gigId as string;
  const router = useRouter();
  const { user: viewerUser, userProfile: viewerUserProfile, loading: authLoading, role: viewerRole, refreshUserProfile } = useFirebase();
  const { toast } = useToast();

  const [gig, setGig] = useState<Gig | null>(null);
  const [clientProfileDetails, setClientProfileDetails] = useState<UserProfile | null>(null);
  const [isLoadingGig, setIsLoadingGig] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isTogglingBookmark, setIsTogglingBookmark] = useState(false);

  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [currentSubmittingReportNumber, setCurrentSubmittingReportNumber] = useState<number | null>(null);
  const [reportText, setReportText] = useState("");


  const fetchGigData = useCallback(async () => {
    if (!gigId) {
      setError("Gig ID is missing.");
      setIsLoadingGig(false);
      return;
    }
    setIsLoadingGig(true);
    setError(null);
    setClientProfileDetails(null);
    try {
      const gigDocRef = doc(db, 'gigs', gigId);
      const docSnap = await getDoc(gigDocRef);

      if (docSnap.exists()) {
        const fetchedGigData = docSnap.data();
        const fetchedGig = {
          id: docSnap.id,
          ...fetchedGigData,
          currency: fetchedGigData.currency || "INR",
          progressReports: fetchedGigData.numberOfReports && fetchedGigData.numberOfReports > 0
                           ? Array.from({ length: fetchedGigData.numberOfReports }, (_, i) => {
                               const existingReport = (fetchedGigData.progressReports as ProgressReport[])?.find(pr => pr.reportNumber === i + 1);
                               return {
                                 reportNumber: i + 1,
                                 deadline: existingReport?.deadline || null,
                                 studentSubmission: existingReport?.studentSubmission || null,
                                 clientStatus: existingReport?.clientStatus || null,
                                 clientFeedback: existingReport?.clientFeedback || null,
                                 reviewedAt: existingReport?.reviewedAt || null,
                               };
                             })
                           : [],
        } as Gig;

        setGig(fetchedGig);

        if (fetchedGig.clientId && db) {
          try {
            const clientDocRef = doc(db, 'users', fetchedGig.clientId);
            const clientDocSnap = await getDoc(clientDocRef);
            if (clientDocSnap.exists()) {
              const clientData = { uid: clientDocSnap.id, ...clientDocSnap.data() } as UserProfile;
              setClientProfileDetails(clientData);
              if (clientData.isBanned) {
                  setError("This gig is currently unavailable.");
                  setGig(null);
              }
            } else {
              console.warn(`Client profile not found for clientId: ${fetchedGig.clientId}`);
               setError("This gig is currently unavailable as the client profile could not be loaded.");
               setGig(null);
            }
          } catch (clientProfileError) {
            console.error("Error fetching client profile for gig:", clientProfileError);
            setError("Error loading client details. Gig may be unavailable.");
            setGig(null);
          }
        }

      } else {
        setError("Gig not found.");
        setGig(null);
      }
    } catch (err: any) {
      console.error("Error fetching gig:", err);
      setError("Failed to load gig details. Please try again later.");
      setGig(null);
    } finally {
      setIsLoadingGig(false);
    }
  }, [gigId]);

  useEffect(() => {
    fetchGigData();
  }, [fetchGigData]);

  useEffect(() => {
    if (gig && viewerUser && viewerRole === 'student' && viewerUserProfile) {
      setHasApplied(gig.applicants?.some(app => app.studentId === viewerUser.uid) || false);
      setIsBookmarked(viewerUserProfile.bookmarkedGigIds?.includes(gig.id) || false);
    } else {
      setHasApplied(false);
      setIsBookmarked(false);
    }
  }, [gig, viewerUser, viewerRole, viewerUserProfile]);


  const handleApply = async () => {
    if (!viewerUser || !viewerUserProfile || viewerRole !== 'student' || !gig || hasApplied || gig.status !== 'open') return;
    if (viewerUserProfile.isBanned) {
        toast({ title: "Account Suspended", description: "Your account is suspended, you cannot apply for gigs.", variant: "destructive", duration: 7000 });
        return;
    }

    setIsApplying(true);
    try {
      const gigDocRef = doc(db, 'gigs', gigId);
      const newApplicant = {
        studentId: viewerUser.uid,
        studentUsername: viewerUserProfile.username || viewerUser.email?.split('@')[0] || 'Unknown Student',
        message: applicationMessage.trim() || '',
        appliedAt: Timestamp.now(),
        status: 'pending',
      };

      await updateDoc(gigDocRef, {
        applicants: arrayUnion(newApplicant),
      });

      // Create notification for the client
      await createNotification(
        gig.clientId,
        `"${viewerUserProfile.username || 'A student'}" has applied to your gig "${gig.title}".`,
        'new_applicant',
        gig.id,
        gig.title,
        `/client/gigs/${gig.id}/manage`,
        viewerUser.uid,
        viewerUserProfile.username || 'A student'
      );

      setHasApplied(true);
      setGig(prevGig => prevGig ? { ...prevGig, applicants: [...(prevGig.applicants || []), newApplicant] } : null);
      toast({
        title: 'Application Sent!',
        description: 'Your application has been submitted to the client.',
      });
      setApplicationMessage('');

    } catch (err: any) {
      console.error("Error applying to gig:", err);
      toast({
        title: 'Application Failed',
        description: `Could not submit application: ${err.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleToggleBookmark = async () => {
    if (!viewerUser || !viewerUserProfile || viewerRole !== 'student' || !gig) return;
    if (viewerUserProfile.isBanned) {
        toast({ title: "Account Suspended", description: "Your account is suspended. Bookmarking is disabled.", variant: "destructive", duration: 7000 });
        return;
    }
    if (!db) {
        toast({ title: "Database Error", description: "Cannot update bookmark.", variant: "destructive" });
        return;
    }

    setIsTogglingBookmark(true);
    const userDocRef = doc(db, 'users', viewerUser.uid);
    try {
      if (isBookmarked) {
        await updateDoc(userDocRef, {
          bookmarkedGigIds: arrayRemove(gig.id)
        });
        toast({ title: "Bookmark Removed", description: `"${gig.title}" removed from your bookmarks.` });
      } else {
        await updateDoc(userDocRef, {
          bookmarkedGigIds: arrayUnion(gig.id)
        });
        toast({ title: "Gig Bookmarked!", description: `"${gig.title}" added to your bookmarks.` });
      }
      setIsBookmarked(!isBookmarked);
      if(refreshUserProfile) await refreshUserProfile();
    } catch (err: any) {
      console.error("Error toggling bookmark:", err);
      toast({ title: "Bookmark Error", description: `Could not update bookmark: ${err.message}`, variant: "destructive" });
    } finally {
      setIsTogglingBookmark(false);
    }
  };

  const handleShareToChat = () => {
    if (!viewerUser || !gig) {
        toast({ title: "Login Required", description: "Please log in to share gigs.", variant: "destructive" });
        return;
    }
    if (viewerRole !== 'admin') {
      toast({ title: "Feature Disabled", description: "Only admins can share gigs to chat.", variant: "default"});
      return;
    }
    router.push(`/chat?shareGigId=${gig.id}&shareGigTitle=${encodeURIComponent(gig.title)}`);
  };

  const formatDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) { return 'Invalid date'; }
  };

  const formatDeadline = (timestamp: Timestamp | undefined | null): string => {
    if (!timestamp) return 'N/A';
    try {
      return timestamp.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) { return 'Invalid date'; }
  };

  const formatSpecificDate = (timestamp: Timestamp | undefined | null): string => {
     if (!timestamp) return 'Not set';
     try { return format(timestamp.toDate(), "PPp"); }
     catch (e) { return 'Invalid date'; }
   };

  const getReportStatusBadgeVariant = (status?: ProgressReport['clientStatus']): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'approved': return 'default';
      case 'rejected': return 'destructive';
      case 'pending_review': return 'secondary';
      default: return 'outline';
    }
  };

  const handleOpenSubmitReportDialog = (reportNumber: number) => {
    setCurrentSubmittingReportNumber(reportNumber);
    const existingSubmission = gig?.progressReports?.find(r => r.reportNumber === reportNumber)?.studentSubmission;
    setReportText(existingSubmission?.text || "");
  };

  const handleSubmitReport = async () => {
    if (!currentSubmittingReportNumber || !gig || !viewerUser || !db) {
      toast({ title: "Error", description: "Cannot submit report. Missing context.", variant: "destructive" });
      return;
    }
    if (!reportText.trim()) {
      toast({ title: "Description Required", description: "Please provide a description for your report.", variant: "destructive" });
      return;
    }
    if (viewerUserProfile?.isBanned) {
        toast({ title: "Account Suspended", description: "Your account is suspended, you cannot submit reports.", variant: "destructive", duration: 7000 });
        return;
    }
    setIsSubmittingReport(true);

    try {
      const gigDocRef = doc(db, 'gigs', gig.id);
      const gigSnap = await getDoc(gigDocRef);
      if (!gigSnap.exists()) throw new Error("Gig not found for report submission.");
      const currentGigData = gigSnap.data() as Gig;

      let progressReports: ProgressReport[] = currentGigData.progressReports || [];
      const reportIndex = progressReports.findIndex(r => r.reportNumber === currentSubmittingReportNumber);

      const studentSubmission: StudentSubmission = {
        text: reportText.trim(),
        submittedAt: Timestamp.now(),
      };

      if (reportIndex > -1) {
        progressReports[reportIndex] = {
          ...progressReports[reportIndex],
          studentSubmission,
          clientStatus: 'pending_review',
          clientFeedback: null,
          reviewedAt: null,
        };
      } else {
        progressReports.push({
          reportNumber: currentSubmittingReportNumber,
          deadline: null,
          studentSubmission,
          clientStatus: 'pending_review',
        });
      }
      progressReports.sort((a, b) => a.reportNumber - b.reportNumber);

      await updateDoc(gigDocRef, { progressReports });

      toast({ title: `Report #${currentSubmittingReportNumber} Submitted`, description: "The client has been notified." });
      setCurrentSubmittingReportNumber(null);
      setReportText("");
      fetchGigData();
    } catch (err: any) {
      console.error("Error submitting report:", err);
      toast({ title: "Submission Error", description: `Could not submit report: ${err.message}`, variant: "destructive" });
    } finally {
      setIsSubmittingReport(false);
    }
  };


  if (isLoadingGig || authLoading) {
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

  if (!gig) {
     return (
       <div className="text-center py-10 text-muted-foreground">
         Gig details could not be loaded or the gig was not found.
       </div>
     );
   }

   const isClientOwner = viewerUser && viewerRole === 'client' && viewerUser.uid === gig.clientId;
   const isSelectedStudent = viewerUser && viewerRole === 'student' && gig.selectedStudentId === viewerUser.uid;
   const isGigInProgressForCurrentUser = isSelectedStudent && gig.status === 'in-progress';
   const clientDisplayName = clientProfileDetails?.companyName || clientProfileDetails?.username || gig.clientUsername || 'Client';
   
   const netPayment = gig.budget * (1 - COMMISSION_RATE);


  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-2 self-start">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
       </Button>

       <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
            <CardTitle className="text-2xl md:text-3xl flex-grow">{gig.title}</CardTitle>
            <div className="flex items-center gap-2 shrink-0">
                {viewerUser && viewerRole === 'admin' && (
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleShareToChat}
                        disabled={authLoading || isLoadingGig}
                        title="Share Gig to Chat"
                        className="shrink-0"
                    >
                        <Share2 className="h-5 w-5" />
                    </Button>
                )}
                {viewerRole === 'student' && gig.status === 'open' && (
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleToggleBookmark}
                        disabled={isTogglingBookmark || authLoading || isLoadingGig || viewerUserProfile?.isBanned}
                        title={isBookmarked ? "Remove Bookmark" : "Bookmark Gig"}
                        className="shrink-0"
                    >
                        {isTogglingBookmark ? <Loader2 className="h-5 w-5 animate-spin" /> : (isBookmarked ? <BookmarkCheck className="h-5 w-5 text-primary" /> : <Bookmark className="h-5 w-5" />)}
                    </Button>
                )}
            </div>
          </div>
          <CardDescription className="text-sm text-muted-foreground flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-x-4 gap-y-1 pt-1">
             <span>
                Posted by: <Link href={`/profile/${gig.clientId}`} className="font-medium text-foreground hover:underline">{clientDisplayName}</Link>
             </span>
             <span>{formatDate(gig.createdAt)}</span>
             <Badge
                variant={gig.status === 'open' ? 'default' : (gig.status === 'in-progress' || gig.status === 'awaiting_payout') ? 'secondary' : 'outline'}
                className="capitalize"
              >
                {gig.status === 'awaiting_payout' ? 'Payment Processing' : gig.status}
              </Badge>
          </CardDescription>
          {clientProfileDetails && (
            <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
              {clientProfileDetails.companyName && clientProfileDetails.username && clientProfileDetails.companyName !== clientProfileDetails.username && (
                <div className="flex items-center gap-1.5">
                    <UserCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Contact: {clientProfileDetails.username}</span>
                </div>
              )}
              {clientProfileDetails.website && (
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <a
                    href={clientProfileDetails.website.startsWith('http') ? clientProfileDetails.website : `https://${clientProfileDetails.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-primary"
                  >
                    {clientProfileDetails.website}
                  </a>
                </div>
              )}
            </div>
          )}
          {viewerUser && viewerRole === 'student' && gig.clientId !== viewerUser.uid && gig.status === 'open' && clientProfileDetails && !clientProfileDetails.isBanned && clientProfileDetails.role === 'admin' && (
            <div className="mt-3">
              <Button asChild variant="outline" size="sm">
                  <Link href={`/chat?userId=${gig.clientId}&gigId=${gig.id}`}>
                      <MessageSquare className="mr-2 h-4 w-4" /> Chat with Admin
                  </Link>
              </Button>
            </div>
          )}
           {gig.numberOfReports && gig.numberOfReports > 0 && (
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 shrink-0" />
              <span>Requires {gig.numberOfReports} progress report{gig.numberOfReports > 1 ? 's' : ''}.</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
           <div>
             <h3 className="font-semibold mb-2">Description</h3>
             <p className="text-sm whitespace-pre-wrap">{gig.description}</p>
           </div>
           <div>
             <h3 className="font-semibold mb-2">Required Skills</h3>
             <div className="flex flex-wrap gap-2">
               {gig.requiredSkills?.map((skill, index) => (
                 <Badge key={index} variant="secondary">{skill}</Badge>
               ))}
             </div>
           </div>
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex items-center text-sm">
                  <IndianRupee className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground mr-1">Payment:</span> 
                  <span className="font-medium">₹{netPayment.toFixed(2)} (Student Payout)</span>
              </div>
              <div className="flex items-center text-sm">
                  <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                   <span className="text-muted-foreground mr-1">Deadline:</span> <span className="font-medium">{formatDeadline(gig.deadline)}</span>
              </div>
           </div>
            {isGigInProgressForCurrentUser && gig.sharedDriveLink && (
                <div className="pt-3 border-t">
                    <h3 className="font-semibold mb-1 text-md flex items-center gap-2"><LinkIcon className="h-4 w-4 text-muted-foreground" /> Shared Resources by Client</h3>
                    <a href={gig.sharedDriveLink} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all block">
                        {gig.sharedDriveLink}
                    </a>
                </div>
            )}
        </CardContent>
        {!isGigInProgressForCurrentUser && viewerRole !== 'admin' && (
            <CardFooter>
            {(() => {
                if (isLoadingGig || authLoading) {
                    return <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />;
                }

                if (gig.status !== 'open') {
                    let statusText = gig.status;
                    if (gig.status === 'awaiting_payout') statusText = 'payment processing';
                    return <p className="text-sm text-muted-foreground w-full text-center">This gig is currently {statusText} and not accepting new applications.</p>;
                }

                if (!viewerUser) {
                    return (
                    <Button asChild className="w-full sm:w-auto">
                        <Link href={`/auth/login?redirect=/gigs/${gigId}`}>Login or Sign Up to Apply</Link>
                    </Button>
                    );
                }

                if (viewerUser && !viewerRole && !authLoading && viewerUserProfile === null) {
                    return <p className="text-sm text-muted-foreground w-full text-center">Verifying account type...</p>;
                }

                if (viewerUserProfile?.isBanned) {
                   return <p className="text-sm text-destructive font-medium text-center w-full flex items-center justify-center gap-2"><Ban className="h-4 w-4"/>Your account is suspended. You cannot apply for gigs.</p>;
                }

                if (viewerRole === 'student') {
                    if (hasApplied) {
                    return <p className="text-sm text-green-600 font-medium text-center w-full">✅ You have already applied to this gig.</p>;
                    } else {
                    return (
                        <div className="w-full space-y-4">
                        <h3 className="font-semibold">Apply for this Gig</h3>
                        <Textarea
                            placeholder="Include a brief message introducing yourself and why you're a good fit (optional)..."
                            value={applicationMessage}
                            onChange={(e) => setApplicationMessage(e.target.value)}
                            rows={3}
                            disabled={isApplying || viewerUserProfile?.isBanned}
                        />
                        <Button
                            onClick={handleApply}
                            disabled={isApplying || hasApplied || viewerUserProfile?.isBanned}
                            className="w-full sm:w-auto"
                        >
                            {isApplying ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                            <Send className="mr-2 h-4 w-4" />
                            )}
                            Submit Application
                        </Button>
                        </div>
                    );
                    }
                } else if (viewerRole === 'client') {
                    if (isClientOwner) {
                    return (
                        <Button asChild variant="secondary" className="w-full sm:w-auto">
                        <Link href={`/client/gigs/${gigId}/manage`}>Manage Gig & Applicants</Link>
                        </Button>
                    );
                    } else {
                    return <p className="text-sm text-muted-foreground w-full text-center">You are viewing this as a client. Only students can apply.</p>;
                    }
                }

                return <p className="text-sm text-muted-foreground w-full text-center">Application status unavailable.</p>;
            })()}
            </CardFooter>
        )}
        {isClientOwner && viewerRole === 'client' && (
             <CardFooter>
                 <Button asChild variant="secondary" className="w-full sm:w-auto">
                    <Link href={`/client/gigs/${gigId}/manage`}>Manage This Gig</Link>
                 </Button>
             </CardFooter>
        )}
         {viewerRole === 'admin' && (
             <CardFooter>
                 <Button asChild variant="secondary" className="w-full sm:w-auto">
                    <Link href={`/admin/manage-gigs/${gigId}`}>Admin: Manage This Gig</Link>
                 </Button>
             </CardFooter>
        )}
      </Card>

      {isGigInProgressForCurrentUser && gig.numberOfReports !== undefined && (
        <Card className="mt-6 glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> Your Progress Reports</CardTitle>
              <CardDescription>Submit and view the status of your progress reports for this gig.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {gig.progressReports?.length === 0 && gig.numberOfReports > 0 && <p className="text-muted-foreground text-sm">No progress reports defined for this gig yet by the client.</p>}
              {gig.progressReports?.map(report => {
                 const previousReport = gig.progressReports?.find(r => r.reportNumber === report.reportNumber - 1);
                 const canSubmitThisReport = report.reportNumber === 1 || (previousReport?.clientStatus === 'approved');
                 const isRejected = report.clientStatus === 'rejected';

                return (
                  <Card key={report.reportNumber} className="bg-muted/30 p-3">
                    <div className="flex justify-between items-center mb-1">
                      <h5 className="font-medium text-sm">Report #{report.reportNumber}</h5>
                      <Badge variant={getReportStatusBadgeVariant(report.clientStatus)} size="sm" className="capitalize text-xs">
                        {report.clientStatus ? report.clientStatus.replace('_', ' ') : 'Awaiting Submission'}
                      </Badge>
                    </div>
                    {report.deadline && <p className="text-xs text-muted-foreground mb-1"><CalendarDays className="inline h-3 w-3 mr-0.5" />Report Deadline: {formatSpecificDate(report.deadline)}</p>}
                    {report.studentSubmission ? (
                      <div className="text-xs space-y-1">
                        <p className="line-clamp-3"><strong>Your submission:</strong> {report.studentSubmission.text}</p>
                        <p className="text-muted-foreground">Submitted: {format(report.studentSubmission.submittedAt.toDate(), "PPp")}</p>
                      </div>
                    ): (
                      <p className="text-xs text-muted-foreground italic">Not submitted yet.</p>
                    )}
                    {report.clientStatus && report.clientStatus !== 'pending_review' && report.clientFeedback && (
                      <div className="mt-1 pt-1 border-t border-dashed text-xs">
                         <p><span className="font-medium">Client Feedback:</span> {report.clientFeedback}</p>
                         <p className="text-muted-foreground">Reviewed: {report.reviewedAt ? format(report.reviewedAt.toDate(), "PPp") : 'N/A'}</p>
                      </div>
                    )}
                    {(!report.studentSubmission || isRejected) && canSubmitThisReport && (
                        <Button size="xs" variant="outline" className="mt-2 text-xs h-7 px-2" onClick={() => handleOpenSubmitReportDialog(report.reportNumber)} disabled={viewerUserProfile?.isBanned}>
                            <Edit className="mr-1 h-3 w-3" /> {isRejected ? 'Resubmit Report' : 'Submit Report'} #{report.reportNumber}
                        </Button>
                    )}
                     {!canSubmitThisReport && !report.studentSubmission && report.reportNumber > (gig.progressReports?.filter(r => r.studentSubmission && r.clientStatus !== 'rejected').length || 0) && (
                        <p className="text-xs text-muted-foreground italic mt-1">Previous report needs approval before submitting this one.</p>
                    )}
                  </Card>
                );
              })}
            </CardContent>
        </Card>
      )}

       {isClientOwner && gig.status !== 'open' && gig.applicants && gig.applicants.length > 0 && (
         <Card className="mt-6 glass-card">
           <CardHeader>
             <CardTitle>Applicants ({gig.applicants.length})</CardTitle>
           </CardHeader>
           <CardContent>
             <ul className="space-y-3">
               {gig.applicants.slice(0,3).map((applicant) => (
                 <li key={applicant.studentId} className="flex items-center justify-between p-3 border rounded-md">
                   <div className="flex items-center gap-3">
                     <UserCircle className="h-6 w-6 text-muted-foreground" />
                     <div>
                       <p className="font-medium">{applicant.studentUsername}</p>
                       <p className="text-xs text-muted-foreground">Applied {formatDate(applicant.appliedAt)}</p>
                        {applicant.message && <p className="text-sm mt-1 italic line-clamp-2">"{applicant.message}"</p>}
                     </div>
                   </div>
                    <Button size="sm" variant="outline" asChild>
                       <Link href={`/profile/${applicant.studentId}`} target="_blank">View Profile</Link>
                     </Button>
                 </li>
               ))}
                {gig.applicants.length > 3 && <p className="text-sm text-muted-foreground mt-2 text-center">And {gig.applicants.length - 3} more...</p>}
             </ul>
           </CardContent>
         </Card>
       )}

      <Dialog open={!!currentSubmittingReportNumber} onOpenChange={(isOpen) => !isOpen && setCurrentSubmittingReportNumber(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Report #{currentSubmittingReportNumber} for Gig: {gig.title}</DialogTitle>
            <DialogDescription>Provide details about your progress. File uploads are currently disabled.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea placeholder="Describe your progress, challenges, and next steps..." value={reportText} onChange={(e) => setReportText(e.target.value)} rows={5} disabled={isSubmittingReport} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {setCurrentSubmittingReportNumber(null); setReportText("");}} disabled={isSubmittingReport}>Cancel</Button>
            <Button onClick={handleSubmitReport} disabled={isSubmittingReport || !reportText.trim()}>
              {isSubmittingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

