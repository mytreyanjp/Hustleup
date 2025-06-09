
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, Timestamp, setDoc, collection, addDoc, serverTimestamp, writeBatch, query, where, getDocs, arrayUnion, increment } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, UserCircle, CheckCircle, XCircle, CreditCard, MessageSquare, ArrowLeft, Star, Layers, Edit3, FileText, Check, X, CalendarDays, CircleDollarSign } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useRazorpay } from '@/hooks/use-razorpay';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getChatId } from '@/lib/utils';
import { StarRating } from '@/components/ui/star-rating';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';


interface ApplicantInfo {
    studentId: string;
    studentUsername: string;
    appliedAt: Timestamp;
    message?: string;
    status?: 'pending' | 'accepted' | 'rejected';
}

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
  budget: number;
  deadline: Timestamp;
  requiredSkills: string[];
  clientId: string;
  clientUsername?: string;
  createdAt: Timestamp;
  status: 'open' | 'in-progress' | 'completed' | 'closed' | 'awaiting_payout'; // Added 'awaiting_payout'
  applicants?: ApplicantInfo[];
  applicationRequests?: { studentId: string; studentUsername: string; requestedAt: Timestamp; status: 'pending' | 'approved_to_apply' | 'denied_to_apply' }[];
  selectedStudentId?: string | null;
  currency: "INR";
  numberOfReports?: number;
  progressReports?: ProgressReport[];
}

interface Review {
  id: string;
  gigId: string;
  gigTitle: string;
  clientId: string;
  clientUsername: string;
  studentId: string;
  studentUsername: string;
  rating: number;
  comment?: string;
  createdAt: Timestamp;
}


export default function ManageGigPage() {
  const params = useParams();
  const gigId = params.gigId as string;
  const router = useRouter();
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const { toast } = useToast();

  const [gig, setGig] = useState<Gig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingApplicantId, setUpdatingApplicantId] = useState<string | null>(null);
  const [payingStudent, setPayingStudent] = useState<ApplicantInfo | null>(null);
  const [updatingRequestStudentId, setUpdatingRequestStudentId] = useState<string | null>(null);

  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [hasBeenReviewed, setHasBeenReviewed] = useState(false);

  const [currentReviewingReportNumber, setCurrentReviewingReportNumber] = useState<number | null>(null);
  const [clientFeedbackText, setClientFeedbackText] = useState("");


   const handlePaymentSuccess = async (paymentDetails: { paymentId: string; orderId?: string; signature?: string }) => {
     if (!payingStudent || !gig || !user || !userProfile) return;
     setIsLoading(true);
     try {
         const transactionData = {
             clientId: user.uid,
             clientUsername: userProfile?.username || user.email?.split('@')[0] || 'Client',
             studentId: payingStudent.studentId, // Intended recipient
             studentUsername: payingStudent.studentUsername, // Intended recipient
             gigId: gig.id,
             gigTitle: gig.title,
             amount: gig.budget,
             currency: "INR" as "INR",
             status: 'pending_release_to_student' as 'pending_release_to_student' | 'succeeded' | 'failed' | 'pending',
             razorpayPaymentId: paymentDetails.paymentId,
             razorpayOrderId: paymentDetails.orderId,
             paidAt: serverTimestamp(),
         };
         await addDoc(collection(db, "transactions"), transactionData);

          const gigDocRef = doc(db, 'gigs', gig.id);
          await updateDoc(gigDocRef, { status: 'awaiting_payout' }); // New status: payment made, awaiting admin release
         setGig(prev => prev ? { ...prev, status: 'awaiting_payout' } : null);

         toast({
             title: "Payment Successful!",
             description: `Payment of INR ${gig.budget.toFixed(2)} received. Funds will be released to ${payingStudent.studentUsername} after admin review.`,
         });
         // Trigger fetching review status again as the gig is now completed
         fetchGigAndReviewStatus();


     } catch (err) {
         console.error("Error recording transaction or updating gig status:", err);
         toast({ title: "Payment Recorded, Update Failed", description: "Payment was successful but updating gig status failed. Please contact support.", variant: "destructive" });
     } finally {
         setPayingStudent(null);
         setIsLoading(false);
     }
   };

   const handlePaymentError = (errorData: any) => {
     console.error("Razorpay Error:", errorData);
     toast({ title: "Payment Failed", description: errorData.description || errorData.reason || "An error occurred during payment.", variant: "destructive" });
     setPayingStudent(null);
   };

   const { openCheckout, isLoaded: isRazorpayLoaded } = useRazorpay({
     keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
     onPaymentSuccess: handlePaymentSuccess,
     onPaymentError: handlePaymentError,
   });

   const initiatePayment = (student: ApplicantInfo) => {
     if (!gig || !userProfile || !isRazorpayLoaded || !user) {
         toast({ title: "Cannot Initiate Payment", description: "Payment gateway or user details missing.", variant: "destructive"});
         return;
     };
     setPayingStudent(student);
     openCheckout({
       amount: gig.budget * 100, 
       currency: "INR",
       name: "HustleUp Gig Payment",
       description: `Payment for Gig: ${gig.title}. To HustleUp Platform.`, // Clarify payment is to platform first
       prefill: { name: userProfile?.username || user?.email?.split('@')[0], email: user?.email || '' },
       notes: { gigId: gig.id, studentId: student.studentId, clientId: user?.uid },
     });
   };

    const fetchGigAndReviewStatus = useCallback(async () => {
        if (!gigId || !user || !db) return;
        setIsLoading(true); setError(null);
        try {
            const gigDocRef = doc(db, 'gigs', gigId);
            const docSnap = await getDoc(gigDocRef);
            if (docSnap.exists()) {
                const fetchedGig = { id: docSnap.id, ...docSnap.data(), progressReports: docSnap.data().progressReports || [] } as Gig;
                if (fetchedGig.clientId !== user.uid) {
                    setError("You are not authorized to manage this gig."); setGig(null);
                } else {
                    if (!fetchedGig.currency) fetchedGig.currency = "INR";
                    // Ensure progressReports have all fields, even if null from DB
                    const numReports = fetchedGig.numberOfReports || 0;
                    const completeProgressReports: ProgressReport[] = [];
                    for (let i = 0; i < numReports; i++) {
                        const existingReport = fetchedGig.progressReports?.find(pr => pr.reportNumber === i + 1);
                        completeProgressReports.push({
                            reportNumber: i + 1,
                            deadline: existingReport?.deadline || null,
                            studentSubmission: existingReport?.studentSubmission || null,
                            clientStatus: existingReport?.clientStatus || null,
                            clientFeedback: existingReport?.clientFeedback || null,
                            reviewedAt: existingReport?.reviewedAt || null,
                        });
                    }
                    fetchedGig.progressReports = completeProgressReports;
                    setGig(fetchedGig);

                    // Allow review if gig is 'awaiting_payout' or 'completed'
                    if ((fetchedGig.status === 'completed' || fetchedGig.status === 'awaiting_payout') && fetchedGig.selectedStudentId) {
                        const reviewsQuery = query( collection(db, 'reviews'), where('gigId', '==', gigId), where('clientId', '==', user.uid), where('studentId', '==', fetchedGig.selectedStudentId) );
                        const reviewsSnapshot = await getDocs(reviewsQuery);
                        if (!reviewsSnapshot.empty) {
                            setHasBeenReviewed(true); const reviewData = reviewsSnapshot.docs[0].data();
                            setRating(reviewData.rating); setReviewComment(reviewData.comment || "");
                        } else { setHasBeenReviewed(false); }
                    }
                }
            } else { setError("Gig not found."); }
        } catch (err: any) { console.error("Error fetching gig or review status:", err); setError("Failed to load gig details or review status.");
        } finally { setIsLoading(false); }
    }, [gigId, user]);


  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') router.push('/auth/login');
      else fetchGigAndReviewStatus();
    }
  }, [authLoading, user, role, router, fetchGigAndReviewStatus]);


  const updateApplicationRequestStatus = async (studentId: string, newStatus: 'approved_to_apply' | 'denied_to_apply') => {
    if (!gig || !db) return;
    const request = gig.applicationRequests?.find(req => req.studentId === studentId);
    if (!request) { toast({ title: "Error", description: "Application request not found.", variant: "destructive" }); return; }
    setUpdatingRequestStudentId(studentId);
    try {
        const gigDocRef = doc(db, 'gigs', gig.id);
        const updatedRequests = gig.applicationRequests?.map(req =>
            req.studentId === studentId ? { ...req, status: newStatus } : req
        ) || [];
        await updateDoc(gigDocRef, { applicationRequests: updatedRequests });
        setGig(prev => prev ? { ...prev, applicationRequests: updatedRequests } : null);
        toast({ title: `Request ${newStatus === 'approved_to_apply' ? 'Approved' : 'Denied'}`, description: `Student can ${newStatus === 'approved_to_apply' ? 'now apply' : 'no longer apply'}.` });
    } catch (err: any) {
        console.error("Error updating application request status:", err);
        toast({ title: "Update Failed", description: `Could not update request status: ${err.message}`, variant: "destructive" });
    } finally {
        setUpdatingRequestStudentId(null);
    }
  };


   const updateApplicantStatus = async (studentId: string, newStatus: 'accepted' | 'rejected') => {
       if (!gig) return;
       const applicant = gig.applicants?.find(app => app.studentId === studentId);
       if (!applicant) { toast({ title: "Error", description: "Applicant not found.", variant: "destructive" }); return; }
       setUpdatingApplicantId(studentId);
       try {
           const gigDocRef = doc(db, 'gigs', gig.id);
           const updatedApplicants = gig.applicants?.map(app => app.studentId === studentId ? { ...app, status: newStatus } : app ) || [];
           
           let gigUpdateData: any = { applicants: updatedApplicants };
           if (newStatus === 'accepted') { 
             gigUpdateData.status = 'in-progress'; 
             gigUpdateData.selectedStudentId = studentId; 
             if (gig.numberOfReports && gig.numberOfReports > 0 && (!gig.progressReports || gig.progressReports.length !== gig.numberOfReports)) {
                 const currentProgressReports = gig.progressReports || [];
                 const newProgressReportsArray : Partial<ProgressReport>[] = [];
                 for (let i = 0; i < gig.numberOfReports; i++) {
                     const existingReport = currentProgressReports.find(r => r.reportNumber === i + 1);
                     newProgressReportsArray.push({
                         reportNumber: i + 1,
                         deadline: existingReport?.deadline || null, 
                         studentSubmission: existingReport?.studentSubmission || null,
                         clientStatus: existingReport?.clientStatus || null,
                         clientFeedback: existingReport?.clientFeedback || null,
                         reviewedAt: existingReport?.reviewedAt || null,
                     });
                 }
                 gigUpdateData.progressReports = newProgressReportsArray;
             }
           }
           await updateDoc(gigDocRef, gigUpdateData);

           setGig(prev => {
                if (!prev) return null;
                const updatedGig = {
                    ...prev,
                    status: newStatus === 'accepted' ? 'in-progress' : prev.status,
                    selectedStudentId: newStatus === 'accepted' ? studentId : prev.selectedStudentId,
                    applicants: updatedApplicants,
                };
                if (newStatus === 'accepted' && updatedGig.numberOfReports && updatedGig.numberOfReports > 0 && (!updatedGig.progressReports || updatedGig.progressReports.length !== updatedGig.numberOfReports)) {
                    const currentProgressReports = updatedGig.progressReports || [];
                    const newProgressReportsArray : ProgressReport[] = [];
                     for (let i = 0; i < updatedGig.numberOfReports; i++) {
                        const existingReport = currentProgressReports.find(r => r.reportNumber === i + 1);
                        newProgressReportsArray.push({
                            reportNumber: i + 1,
                            deadline: existingReport?.deadline || null,
                            studentSubmission: existingReport?.studentSubmission || null,
                            clientStatus: existingReport?.clientStatus || null,
                            clientFeedback: existingReport?.clientFeedback || null,
                            reviewedAt: existingReport?.reviewedAt || null,
                        });
                    }
                    updatedGig.progressReports = newProgressReportsArray;
                }
                return updatedGig;
            });


           toast({ title: `Applicant ${newStatus === 'accepted' ? 'Accepted' : 'Rejected'}`, description: `Status updated successfully.`});
       } catch (err: any) { console.error("Error updating applicant status:", err); toast({ title: "Update Failed", description: `Could not update status: ${err.message}`, variant: "destructive" });
       } finally { setUpdatingApplicantId(null); }
   };

    const handleSubmitReview = async () => {
        if (!gig || !gig.selectedStudentId || !user || !userProfile || !db) return;
        if (rating === 0) { toast({ title: "Rating Required", description: "Please select a star rating.", variant: "destructive" }); return; }
        setIsSubmittingReview(true);
        const selectedStudentInfo = gig.applicants?.find(app => app.studentId === gig.selectedStudentId);
        if (!selectedStudentInfo) { toast({ title: "Error", description: "Selected student details not found.", variant: "destructive"}); setIsSubmittingReview(false); return; }
        try {
            const reviewData: Omit<Review, 'id' | 'createdAt'> & { createdAt: any } = { gigId: gig.id, gigTitle: gig.title, clientId: user.uid, clientUsername: userProfile.username || user.email?.split('@')[0] || 'Client', studentId: gig.selectedStudentId, studentUsername: selectedStudentInfo.studentUsername, rating: rating, comment: reviewComment.trim() || '', createdAt: serverTimestamp(), };
            await addDoc(collection(db, "reviews"), reviewData);
            const studentDocRef = doc(db, 'users', gig.selectedStudentId);
            const studentSnap = await getDoc(studentDocRef);
            if (studentSnap.exists()) {
                const studentData = studentSnap.data() as UserProfile;
                const currentTotalRatings = studentData.totalRatings || 0; const currentAverageRating = studentData.averageRating || 0;
                const newTotalRatings = currentTotalRatings + 1; const newAverageRating = ((currentAverageRating * currentTotalRatings) + rating) / newTotalRatings;
                await updateDoc(studentDocRef, { averageRating: newAverageRating, totalRatings: newTotalRatings, });
            }
            toast({ title: "Review Submitted", description: "Thank you for your feedback!" });
            setHasBeenReviewed(true);
        } catch (err: any) { console.error("Error submitting review:", err); toast({ title: "Review Failed", description: `Could not submit your review: ${err.message}`, variant: "destructive" });
        } finally { setIsSubmittingReview(false); }
    };

  const handleReportReview = async (reportNumber: number, newStatus: 'approved' | 'rejected') => {
    if (!gig || !db) return;
    if (newStatus === 'rejected' && !clientFeedbackText.trim()){
        toast({title: "Feedback Required", description: "Please provide feedback when rejecting a report.", variant: "destructive"});
        return;
    }
    setIsLoading(true); 
    try {
      const gigDocRef = doc(db, 'gigs', gig.id);
      const currentGigSnap = await getDoc(gigDocRef);
      if (!currentGigSnap.exists()) throw new Error("Gig not found");
      const currentGigData = currentGigSnap.data() as Gig;
      
      const updatedProgressReports = (currentGigData.progressReports || []).map(report => {
        if (report.reportNumber === reportNumber) {
          return {
            ...report,
            clientStatus: newStatus,
            clientFeedback: clientFeedbackText.trim() || (newStatus === 'approved' ? 'Approved' : ''), 
            reviewedAt: Timestamp.now(),
          };
        }
        return report;
      });

      await updateDoc(gigDocRef, { progressReports: updatedProgressReports });
      setGig(prev => prev ? { ...prev, progressReports: updatedProgressReports } : null);
      toast({ title: `Report #${reportNumber} ${newStatus}`, description: "Feedback saved." });
      setCurrentReviewingReportNumber(null);
      setClientFeedbackText("");
    } catch (err: any) {
      console.error(`Error updating report ${reportNumber} status:`, err);
      toast({ title: "Update Failed", description: `Could not update report: ${err.message}`, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };


   const formatDate = (timestamp: Timestamp | undefined | null): string => {
     if (!timestamp) return 'N/A';
     try { return formatDistanceToNow(timestamp.toDate(), { addSuffix: true }); } catch (e) { return 'Invalid date'; }
   };
   
   const formatSpecificDate = (timestamp: Timestamp | undefined | null): string => {
     if (!timestamp) return 'Not set';
     try { return format(timestamp.toDate(), "PPp"); } 
     catch (e) { return 'Invalid date'; }
   };


    const getStatusBadgeVariant = (status: ApplicantInfo['status'] | Gig['status'] | ProgressReport['clientStatus'] | Gig['applicationRequests'] extends (infer R)[] ? R['status'] : never): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'accepted': case 'open': case 'approved': case 'approved_to_apply': return 'default';
           case 'rejected': case 'closed': case 'denied_to_apply': return 'destructive';
           case 'pending': case 'in-progress': case 'pending_review': return 'secondary';
           case 'completed': case 'awaiting_payout': return 'outline'; // Use outline for these too
           default: return 'secondary'; 
       }
   };

  if (isLoading || authLoading) return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (error) return ( <div className="text-center py-10"> <p className="text-destructive mb-4">{error}</p> <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" />Go Back</Button> </div> );
  if (!gig) return <div className="text-center py-10 text-muted-foreground">Gig details could not be loaded.</div>;

  const selectedStudent = gig.applicants?.find(app => app.studentId === gig.selectedStudentId);
  const allReportsApproved = gig.numberOfReports && gig.numberOfReports > 0 
    ? (gig.progressReports?.filter(r => r.clientStatus === 'approved').length === gig.numberOfReports)
    : true; 


  return (
     <div className="max-w-4xl mx-auto py-8 space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.push('/client/gigs')} className="mb-4"><ArrowLeft className="mr-2 h-4 w-4" />Back to My Gigs</Button>
       <Card className="glass-card">
         <CardHeader>
           <CardTitle className="text-2xl">{gig.title}</CardTitle>
           <CardDescription>Manage applications, progress reports, and payment for this gig.</CardDescription>
           <div className="flex items-center gap-2 pt-2"> <span className="text-sm text-muted-foreground">Status:</span> <Badge variant={getStatusBadgeVariant(gig.status)} className="capitalize">{gig.status === 'awaiting_payout' ? 'Payment Processing' : gig.status}</Badge> </div>
           {gig.numberOfReports !== undefined && gig.numberOfReports > 0 && ( <div className="flex items-center gap-2 pt-1 text-sm text-muted-foreground"> <Layers className="h-4 w-4" /> <span>Requires {gig.numberOfReports} progress report(s).</span> </div> )}
           {gig.status === 'open' && (
             <Button variant="outline" size="sm" asChild className="mt-2 w-fit">
               <Link href={`/client/gigs/${gig.id}/edit`}><Edit3 className="mr-2 h-4 w-4" /> Edit Gig Details</Link>
             </Button>
           )}
         </CardHeader>
       </Card>

        {/* Application Requests Section */}
        {gig.status === 'open' && gig.applicationRequests && gig.applicationRequests.length > 0 && (
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle>Application Requests ({gig.applicationRequests.filter(req => req.status === 'pending').length} pending)</CardTitle>
                    <CardDescription>Review students who want to apply for this gig.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {gig.applicationRequests.map(request => (
                        <div key={request.studentId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-md gap-3">
                            <div className="flex items-start gap-3 flex-grow">
                                <UserCircle className="h-8 w-8 text-muted-foreground mt-1 shrink-0" />
                                <div>
                                    <p className="font-semibold">{request.studentUsername}</p>
                                    <p className="text-xs text-muted-foreground mb-1">Requested {formatDate(request.requestedAt)}</p>
                                    <Badge variant={getStatusBadgeVariant(request.status)} className="capitalize text-xs">{request.status.replace('_', ' ')}</Badge>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center shrink-0 pt-2 sm:pt-0">
                                <Button size="sm" variant="outline" asChild><Link href={`/profile/${request.studentId}`} target="_blank">View Profile</Link></Button>
                                {request.status === 'pending' && (
                                    <>
                                        <Button size="sm" variant="default" onClick={() => updateApplicationRequestStatus(request.studentId, 'approved_to_apply')} disabled={updatingRequestStudentId === request.studentId}>
                                            {updatingRequestStudentId === request.studentId ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />} Approve Request
                                        </Button>
                                        <Button size="sm" variant="destructive" onClick={() => updateApplicationRequestStatus(request.studentId, 'denied_to_apply')} disabled={updatingRequestStudentId === request.studentId}>
                                            {updatingRequestStudentId === request.studentId ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <XCircle className="mr-1 h-4 w-4" />} Deny Request
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        )}


       {gig.status === 'in-progress' && selectedStudent && (
         <Card className="glass-card border-green-500 dark:border-green-400">
           <CardHeader> <CardTitle className="text-green-700 dark:text-green-400">Gig In Progress With: {selectedStudent.studentUsername}</CardTitle> <CardDescription>You have accepted {selectedStudent.studentUsername}'s application. Review progress reports and initiate payment once the work is completed.</CardDescription> </CardHeader>
           <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-md gap-3 bg-background shadow">
                  <div className="flex items-start gap-3 flex-grow"> <UserCircle className="h-10 w-10 text-muted-foreground mt-1 shrink-0" /> <div className="flex-grow"> <p className="font-semibold text-lg">{selectedStudent.studentUsername}</p> <p className="text-xs text-muted-foreground mb-1">Accepted application {formatDate(selectedStudent.appliedAt)}</p> </div> </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center shrink-0 pt-2 sm:pt-0">
                     {selectedStudent.studentId ? ( <Button size="sm" variant="outline" asChild><Link href={`/profile/${selectedStudent.studentId}`} target="_blank">View Profile</Link></Button> ) : ( <Button size="sm" variant="outline" disabled>View Profile (ID Missing)</Button> )}
                  </div>
              </div>
              {gig.numberOfReports !== undefined && gig.numberOfReports > 0 && (
                <div className="mt-4 p-3 border rounded-md">
                    <h4 className="font-semibold mb-3 text-lg">Progress Reports</h4>
                    <div className="space-y-4">
                        {gig.progressReports?.map(report => (
                            <Card key={report.reportNumber} className="bg-muted/30">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-md flex justify-between items-center">
                                        Report #{report.reportNumber}
                                        <Badge variant={getStatusBadgeVariant(report.clientStatus)} className="capitalize text-xs">{report.clientStatus ? report.clientStatus.replace('_', ' ') : 'Awaiting Submission'}</Badge>
                                    </CardTitle>
                                    {report.deadline && <p className="text-xs text-muted-foreground"><CalendarDays className="inline h-3 w-3 mr-1" />Deadline: {formatSpecificDate(report.deadline)}</p>}
                                </CardHeader>
                                <CardContent>
                                    {!report.studentSubmission ? (
                                        <p className="text-sm text-muted-foreground italic">Not yet submitted by student.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            <p className="text-sm"><span className="font-medium">Student Submission:</span> {report.studentSubmission.text}</p>
                                            {report.studentSubmission.fileUrl && (
                                                <Button variant="link" size="sm" asChild className="p-0 h-auto">
                                                    <a href={report.studentSubmission.fileUrl} target="_blank" rel="noopener noreferrer">
                                                        <FileText className="mr-1 h-4 w-4" /> View Attachment ({report.studentSubmission.fileName || 'file'})
                                                    </a>
                                                </Button>
                                            )}
                                            <p className="text-xs text-muted-foreground">Submitted: {format(report.studentSubmission.submittedAt.toDate(), "PPp")}</p>

                                            {report.clientStatus === 'pending_review' && (
                                                <div className="pt-2 border-t mt-2">
                                                    <Textarea
                                                        placeholder="Provide feedback (optional for approval, required for rejection)..."
                                                        defaultValue={report.clientFeedback || ""}
                                                        onChange={(e) => setClientFeedbackText(e.target.value)}
                                                        className="mb-2 text-sm"
                                                        rows={2}
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button size="xs" variant="default" onClick={() => handleReportReview(report.reportNumber, 'approved')} disabled={isLoading}>
                                                            <Check className="mr-1 h-3 w-3" /> Approve
                                                        </Button>
                                                        <Button size="xs" variant="destructive" onClick={() => handleReportReview(report.reportNumber, 'rejected')} disabled={isLoading}>
                                                            <X className="mr-1 h-3 w-3" /> Reject
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                            {report.clientStatus && report.clientStatus !== 'pending_review' && report.clientFeedback && (
                                                <div className="mt-2 pt-2 border-t border-dashed">
                                                   <p className="text-sm"><span className="font-medium">Your Feedback:</span> {report.clientFeedback}</p>
                                                   <p className="text-xs text-muted-foreground">Reviewed: {report.reviewedAt ? format(report.reviewedAt.toDate(), "PPp") : 'N/A'}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
              )}
           </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 border-t pt-4">
                <p className="text-sm text-muted-foreground flex-grow text-center sm:text-left mb-2 sm:mb-0"> Ready to pay **INR {gig.budget.toFixed(2)}** for the completed work by {selectedStudent.studentUsername}? </p>
                <Button size="lg" onClick={() => initiatePayment(selectedStudent)} disabled={!isRazorpayLoaded || isLoading || payingStudent?.studentId === selectedStudent.studentId || !allReportsApproved} className="w-full sm:w-auto">
                   {(isLoading && payingStudent?.studentId === selectedStudent.studentId) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                   Pay INR {gig.budget.toFixed(2)}
                 </Button>
            </CardFooter>
             {!allReportsApproved && gig.numberOfReports && gig.numberOfReports > 0 && (
                <p className="text-xs text-destructive text-center w-full p-3 border-t">Payment button is disabled until all {gig.numberOfReports} required reports are approved.</p>
             )}
         </Card>
       )}

      {gig.status === 'awaiting_payout' && selectedStudent && (
         <Card className="glass-card border-blue-500 dark:border-blue-400">
           <CardHeader>
             <CardTitle className="text-blue-700 dark:text-blue-400 flex items-center gap-2">
               <CircleDollarSign className="h-6 w-6" /> Payment Processing for: {selectedStudent.studentUsername}
             </CardTitle>
             <CardDescription>
               Your payment of INR {gig.budget.toFixed(2)} has been successfully processed by HustleUp.
               It is now pending review by our admin team before being released to {selectedStudent.studentUsername}.
             </CardDescription>
           </CardHeader>
           <CardContent>
             <p className="text-sm text-muted-foreground">
               You will be notified once the payment is released to the student. You can now leave a review for the student.
             </p>
           </CardContent>
           {/* Review section can still be shown here */}
           <CardFooter className="border-t pt-4">
               {!hasBeenReviewed ? (
                <form onSubmit={(e) => { e.preventDefault(); handleSubmitReview(); }} className="space-y-4 w-full">
                    <div>
                        <label htmlFor="rating" className="block text-sm font-medium mb-1">Your Rating for {selectedStudent.studentUsername}:</label>
                        <StarRating value={rating} onValueChange={setRating} size={28} isEditable={true} />
                    </div>
                    <div>
                        <label htmlFor="reviewComment" className="block text-sm font-medium mb-1">Your Review (Optional):</label>
                        <Textarea id="reviewComment" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Share your experience working with this student..." rows={4} />
                    </div>
                    <Button type="submit" disabled={isSubmittingReview || rating === 0}>
                        {isSubmittingReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit Review
                    </Button>
                </form>
               ) : (
                 <div className="w-full">
                    <p className="text-lg font-semibold text-green-600">Review Submitted!</p>
                    <p className="text-sm text-muted-foreground">You rated {selectedStudent.studentUsername} {rating} star(s).</p>
                    {reviewComment && <p className="text-sm mt-1 italic">"{reviewComment}"</p>}
                 </div>
               )}
           </CardFooter>
         </Card>
       )}


       {gig.status === 'completed' && selectedStudent && (
         <Card className="glass-card border-green-500 dark:border-green-400">
            <CardHeader>
              <CardTitle className="text-green-700 dark:text-green-400">Gig Completed & Paid: {selectedStudent.studentUsername}</CardTitle>
              <CardDescription>This gig has been successfully completed and payment released to the student. You can leave or view your review.</CardDescription>
            </CardHeader>
            <CardContent>
               {!hasBeenReviewed ? (
                <form onSubmit={(e) => { e.preventDefault(); handleSubmitReview(); }} className="space-y-4">
                    <div>
                        <label htmlFor="rating" className="block text-sm font-medium mb-1">Your Rating:</label>
                        <StarRating value={rating} onValueChange={setRating} size={28} isEditable={true} />
                    </div>
                    <div>
                        <label htmlFor="reviewComment" className="block text-sm font-medium mb-1">Your Review (Optional):</label>
                        <Textarea id="reviewComment" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Share your experience working with this student..." rows={4} />
                    </div>
                    <Button type="submit" disabled={isSubmittingReview || rating === 0}>
                        {isSubmittingReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit Review
                    </Button>
                </form>
               ) : (
                 <div>
                    <p className="text-lg font-semibold text-green-600">Review Submitted!</p>
                    <p className="text-sm text-muted-foreground">You rated {selectedStudent.studentUsername} {rating} star(s).</p>
                    {reviewComment && <p className="text-sm mt-1 italic">"{reviewComment}"</p>}
                 </div>
               )}
            </CardContent>
         </Card>
       )}

        {gig.status === 'open' && (
         <Card className="glass-card">
            <CardHeader>
              <CardTitle>Applicants ({gig.applicants?.filter(app => app.status === 'pending').length || 0} pending)</CardTitle>
              <CardDescription>Review students who have submitted full applications for this gig.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
               {(!gig.applicants || gig.applicants.length === 0) ? (
                <p className="text-sm text-muted-foreground">No full applications received yet.</p>
               ) : (
                 gig.applicants.map(applicant => (
                    <div key={applicant.studentId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-md gap-3">
                        <div className="flex items-start gap-3 flex-grow">
                           <UserCircle className="h-8 w-8 text-muted-foreground mt-1 shrink-0" />
                            <div className="flex-grow">
                                <p className="font-semibold">{applicant.studentUsername}</p>
                                <p className="text-xs text-muted-foreground mb-1">Applied {formatDate(applicant.appliedAt)}</p>
                                {applicant.message && <p className="text-sm mt-1 italic line-clamp-2">"{applicant.message}"</p>}
                                <Badge variant={getStatusBadgeVariant(applicant.status)} className="capitalize mt-2 text-xs">{applicant.status || 'pending'}</Badge>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center shrink-0 pt-2 sm:pt-0">
                           {applicant.studentId ? (<Button size="sm" variant="outline" asChild><Link href={`/profile/${applicant.studentId}`} target="_blank">View Profile</Link></Button>) : (<Button size="sm" variant="outline" disabled>View Profile</Button>)}
                           {applicant.status === 'pending' && (
                            <>
                                <Button size="sm" variant="default" onClick={() => updateApplicantStatus(applicant.studentId, 'accepted')} disabled={updatingApplicantId === applicant.studentId}>
                                  {updatingApplicantId === applicant.studentId ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-1 h-4 w-4" />} Accept
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => updateApplicantStatus(applicant.studentId, 'rejected')} disabled={updatingApplicantId === applicant.studentId}>
                                  {updatingApplicantId === applicant.studentId ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <XCircle className="mr-1 h-4 w-4" />} Reject
                                </Button>
                            </>
                           )}
                        </div>
                    </div>
                 ))
               )}
            </CardContent>
         </Card>
        )}
        
        {gig.status === 'closed' && ( <Alert variant="destructive"> <XCircle className="h-5 w-5" /> <AlertTitle>Gig Closed</AlertTitle> <AlertDescription>This gig is closed and no further actions can be taken.</AlertDescription> </Alert> )}
     </div>
   );
}

    