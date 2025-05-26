
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, Timestamp, setDoc, collection, addDoc, serverTimestamp, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase, type UserProfile } from '@/context/firebase-context'; // Import UserProfile
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea'; // Import Textarea
import { Loader2, UserCircle, CheckCircle, XCircle, CreditCard, MessageSquare, ArrowLeft, Star } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useRazorpay } from '@/hooks/use-razorpay';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getChatId } from '@/lib/utils';
import { StarRating } from '@/components/ui/star-rating'; // Import StarRating

interface ApplicantInfo {
    studentId: string;
    studentUsername: string;
    appliedAt: Timestamp;
    message?: string;
    status?: 'pending' | 'accepted' | 'rejected';
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
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  applicants?: ApplicantInfo[];
  selectedStudentId?: string | null; 
  currency: string; 
  // Fields for storing review directly on the gig for the selected student (alternative to separate reviews collection)
  // reviewForSelectedStudent?: { rating: number; comment?: string; reviewedAt: Timestamp }; 
}

interface Review {
  id: string; // Firestore doc ID
  gigId: string;
  gigTitle: string;
  clientId: string;
  clientUsername: string;
  studentId: string;
  studentUsername: string;
  rating: number; // 1-5
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

  const [rating, setRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [hasBeenReviewed, setHasBeenReviewed] = useState(false);


   const handlePaymentSuccess = async (paymentDetails: { paymentId: string; orderId?: string; signature?: string }) => {
    console.log("Razorpay Success:", paymentDetails);
     if (!payingStudent || !gig || !user || !userProfile) return;

     setIsLoading(true);
     try {
         const transactionData = {
             clientId: user.uid,
             clientUsername: userProfile?.username || user.email?.split('@')[0] || 'Client',
             studentId: payingStudent.studentId,
             studentUsername: payingStudent.studentUsername,
             gigId: gig.id,
             gigTitle: gig.title,
             amount: gig.budget,
             currency: "INR", 
             status: 'succeeded',
             razorpayPaymentId: paymentDetails.paymentId,
             razorpayOrderId: paymentDetails.orderId,
             paidAt: serverTimestamp(),
         };
         await addDoc(collection(db, "transactions"), transactionData);
         console.log("Transaction recorded:", transactionData);

          const gigDocRef = doc(db, 'gigs', gig.id);
          await updateDoc(gigDocRef, {
              status: 'completed',
          });
         setGig(prev => prev ? { ...prev, status: 'completed' } : null);


         toast({
             title: "Payment Successful!",
             description: `Payment of INR ${gig.budget.toFixed(2)} to ${payingStudent.studentUsername} recorded.`,
         });

     } catch (err) {
         console.error("Error recording transaction or updating gig status:", err);
         toast({
             title: "Payment Recorded, Update Failed",
             description: "Payment was successful but updating gig status failed. Please contact support.",
             variant: "destructive",
         });
     } finally {
         setPayingStudent(null);
         setIsLoading(false);
     }
   };

   const handlePaymentError = (error: any) => {
     console.error("Razorpay Error:", error);
     toast({
       title: "Payment Failed",
       description: error.description || error.reason || "An error occurred during payment.",
       variant: "destructive",
     });
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
       amount: gig.budget * 100, // Amount in paise
       currency: "INR", // Explicitly use INR
       name: "HustleUp Gig Payment",
       description: `Payment for: ${gig.title}`,
       prefill: {
         name: userProfile?.username || user?.email?.split('@')[0],
         email: user?.email || '',
       },
       notes: {
         gigId: gig.id,
         studentId: student.studentId,
         clientId: user?.uid,
       },
     });
   };

    const fetchGigAndReviewStatus = useCallback(async () => {
        if (!gigId || !user || !db) return;
        setIsLoading(true);
        setError(null);
        try {
            const gigDocRef = doc(db, 'gigs', gigId);
            const docSnap = await getDoc(gigDocRef);

            if (docSnap.exists()) {
                const fetchedGig = { id: docSnap.id, ...docSnap.data() } as Gig;
                if (fetchedGig.clientId !== user.uid) {
                    setError("You are not authorized to manage this gig.");
                    setGig(null);
                } else {
                    if (!fetchedGig.currency) {
                        fetchedGig.currency = "INR";
                    }
                    setGig(fetchedGig);

                    // Check if review exists for this gig and selected student
                    if (fetchedGig.status === 'completed' && fetchedGig.selectedStudentId) {
                        const reviewsQuery = query(
                            collection(db, 'reviews'),
                            where('gigId', '==', gigId),
                            where('clientId', '==', user.uid),
                            where('studentId', '==', fetchedGig.selectedStudentId)
                        );
                        const reviewsSnapshot = await getDocs(reviewsQuery);
                        if (!reviewsSnapshot.empty) {
                            setHasBeenReviewed(true);
                            const reviewData = reviewsSnapshot.docs[0].data();
                            setRating(reviewData.rating);
                            setReviewComment(reviewData.comment || "");
                        } else {
                            setHasBeenReviewed(false);
                        }
                    }
                }
            } else {
                setError("Gig not found.");
            }
        } catch (err: any) {
            console.error("Error fetching gig or review status:", err);
            setError("Failed to load gig details or review status.");
        } finally {
            setIsLoading(false);
        }
    }, [gigId, user]);


  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') {
        router.push('/auth/login');
      } else {
         fetchGigAndReviewStatus();
      }
    }
  }, [authLoading, user, role, router, fetchGigAndReviewStatus]);


  const sendApplicationStatusNotification = async (
    applicant: ApplicantInfo,
    gigData: Gig,
    status: 'accepted' | 'rejected'
  ) => {
    if (!user || !userProfile || !db) return;

    const chatId = getChatId(user.uid, applicant.studentId);
    const chatDocRef = doc(db, 'chats', chatId);
    const messageText = `Your application for the gig "${gigData.title}" has been ${status}.`;

    try {
      const batch = writeBatch(db);

      const chatSnap = await getDoc(chatDocRef);
      if (!chatSnap.exists()) {
        const newChatData: any = {
          id: chatId,
          participants: [user.uid, applicant.studentId],
          participantUsernames: {
            [user.uid]: userProfile.username || user.email?.split('@')[0] || 'Client',
            [applicant.studentId]: applicant.studentUsername,
          },
          gigId: gigData.id,
          createdAt: serverTimestamp(),
        };
        if (userProfile.profilePictureUrl) {
           newChatData.participantProfilePictures = { [user.uid]: userProfile.profilePictureUrl };
        }
        batch.set(chatDocRef, newChatData);
      }

      const newMessageRef = doc(collection(db, 'chats', chatId, 'messages'));
      batch.set(newMessageRef, {
        senderId: user.uid, 
        text: messageText,
        timestamp: serverTimestamp(),
      });

      batch.update(chatDocRef, {
        lastMessage: messageText,
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(userProfile.profilePictureUrl && {
            [`participantProfilePictures.${user.uid}`]: userProfile.profilePictureUrl,
        }),
      });

      await batch.commit();
      toast({
        title: 'Notification Sent',
        description: `The student ${applicant.studentUsername} has been notified via chat.`,
      });
    } catch (chatError) {
      console.error('Error sending chat notification:', chatError);
      toast({
        title: 'Notification Error',
        description: 'Could not send chat notification to the student.',
        variant: 'destructive',
      });
    }
  };


   const updateApplicantStatus = async (studentId: string, newStatus: 'accepted' | 'rejected') => {
       if (!gig) return;
       const applicant = gig.applicants?.find(app => app.studentId === studentId);
       if (!applicant) {
           toast({ title: "Error", description: "Applicant not found.", variant: "destructive" });
           return;
       }

       setUpdatingApplicantId(studentId);
       try {
           const gigDocRef = doc(db, 'gigs', gig.id);
           const updatedApplicants = gig.applicants?.map(app =>
               app.studentId === studentId ? { ...app, status: newStatus } : app
           ) || [];

           let gigUpdateData: any = { applicants: updatedApplicants };

           if (newStatus === 'accepted') {
               gigUpdateData.status = 'in-progress';
               gigUpdateData.selectedStudentId = studentId;
           }

           await updateDoc(gigDocRef, gigUpdateData);

           setGig(prev => prev ? {
                ...prev,
                status: newStatus === 'accepted' ? 'in-progress' : prev.status,
                selectedStudentId: newStatus === 'accepted' ? studentId : prev.selectedStudentId,
                applicants: updatedApplicants
            } : null);

           toast({ title: `Applicant ${newStatus === 'accepted' ? 'Accepted' : 'Rejected'}`, description: `Status updated successfully.`});

           await sendApplicationStatusNotification(applicant, gig, newStatus);

       } catch (err: any) {
           console.error("Error updating applicant status:", err);
           toast({ title: "Update Failed", description: `Could not update status: ${err.message}`, variant: "destructive" });
       } finally {
           setUpdatingApplicantId(null);
       }
   };

    const handleSubmitReview = async () => {
        if (!gig || !gig.selectedStudentId || !user || !userProfile || !db) return;
        if (rating === 0) {
            toast({ title: "Rating Required", description: "Please select a star rating.", variant: "destructive" });
            return;
        }
        setIsSubmittingReview(true);
        const selectedStudentInfo = gig.applicants?.find(app => app.studentId === gig.selectedStudentId);
        if (!selectedStudentInfo) {
             toast({ title: "Error", description: "Selected student details not found.", variant: "destructive"});
             setIsSubmittingReview(false);
             return;
        }

        try {
            const reviewData: Omit<Review, 'id' | 'createdAt'> & { createdAt: any } = {
                gigId: gig.id,
                gigTitle: gig.title,
                clientId: user.uid,
                clientUsername: userProfile.username || user.email?.split('@')[0] || 'Client',
                studentId: gig.selectedStudentId,
                studentUsername: selectedStudentInfo.studentUsername,
                rating: rating,
                comment: reviewComment.trim() || '',
                createdAt: serverTimestamp(),
            };
            await addDoc(collection(db, "reviews"), reviewData);

            // Client-side aggregation for student's profile (simplified)
            const studentDocRef = doc(db, 'users', gig.selectedStudentId);
            const studentSnap = await getDoc(studentDocRef);
            if (studentSnap.exists()) {
                const studentData = studentSnap.data() as UserProfile;
                const currentTotalRatings = studentData.totalRatings || 0;
                const currentAverageRating = studentData.averageRating || 0;
                
                const newTotalRatings = currentTotalRatings + 1;
                const newAverageRating = ((currentAverageRating * currentTotalRatings) + rating) / newTotalRatings;

                await updateDoc(studentDocRef, {
                    averageRating: newAverageRating,
                    totalRatings: newTotalRatings,
                });
            }

            toast({ title: "Review Submitted", description: "Thank you for your feedback!" });
            setHasBeenReviewed(true); // Hide form after submission
        } catch (err) {
            console.error("Error submitting review:", err);
            toast({ title: "Review Failed", description: "Could not submit your review.", variant: "destructive" });
        } finally {
            setIsSubmittingReview(false);
        }
    };


   const formatDate = (timestamp: Timestamp | undefined): string => {
     if (!timestamp) return 'N/A';
     try {
       return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
     } catch (e) { return 'Invalid date'; }
   };

    const getStatusBadgeVariant = (status: ApplicantInfo['status'] | Gig['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'accepted': return 'default';
           case 'rejected': return 'destructive';
           case 'pending': return 'secondary';
           case 'open': return 'default';
           case 'in-progress': return 'secondary';
           case 'completed': return 'outline'; 
           case 'closed': return 'destructive';
           default: return 'secondary';
       }
   };


  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
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
     return <div className="text-center py-10 text-muted-foreground">Gig details could not be loaded.</div>;
   }

   const selectedStudent = gig.applicants?.find(app => app.studentId === gig.selectedStudentId);


  return (
     <div className="max-w-4xl mx-auto py-8 space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.push('/client/gigs')} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Gigs
        </Button>

       <Card className="glass-card">
         <CardHeader>
           <CardTitle className="text-2xl">{gig.title}</CardTitle>
           <CardDescription>Manage applications and payment for this gig.</CardDescription>
           <div className="flex items-center gap-2 pt-2">
               <span className="text-sm text-muted-foreground">Status:</span>
                <Badge variant={getStatusBadgeVariant(gig.status)} className="capitalize">{gig.status}</Badge>
           </div>
         </CardHeader>
       </Card>


       {/* Hired Student & Payment Section */}
       {gig.status === 'in-progress' && selectedStudent && (
         <Card className="glass-card border-green-500 dark:border-green-400">
           <CardHeader>
             <CardTitle className="text-green-700 dark:text-green-400">Gig In Progress With: {selectedStudent.studentUsername}</CardTitle>
             <CardDescription>You have accepted {selectedStudent.studentUsername}'s application. Initiate payment once the work is completed to your satisfaction.</CardDescription>
           </CardHeader>
           <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-md gap-3 bg-background shadow">
                  <div className="flex items-start gap-3 flex-grow">
                      <UserCircle className="h-10 w-10 text-muted-foreground mt-1 shrink-0" />
                      <div className="flex-grow">
                         <p className="font-semibold text-lg">{selectedStudent.studentUsername}</p>
                         <p className="text-xs text-muted-foreground mb-1">Accepted application {formatDate(selectedStudent.appliedAt)}</p>
                      </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center shrink-0 pt-2 sm:pt-0">
                     {selectedStudent.studentId ? (
                        <Button size="sm" variant="outline" asChild>
                            <Link href={`/profile/${selectedStudent.studentId}`} target="_blank">View Profile</Link>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled>View Profile (ID Missing)</Button>
                      )}
                       <Button size="sm" asChild>
                          <Link href={`/chat?userId=${selectedStudent.studentId}&gigId=${gig.id}`}>
                              <MessageSquare className="mr-1 h-4 w-4" /> Chat with {selectedStudent.studentUsername}
                          </Link>
                       </Button>
                  </div>
              </div>
           </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 border-t pt-4">
                <p className="text-sm text-muted-foreground flex-grow text-center sm:text-left mb-2 sm:mb-0">
                    Ready to pay **INR {gig.budget.toFixed(2)}** for the completed work by {selectedStudent.studentUsername}?
                </p>
                <Button
                   size="lg"
                   onClick={() => initiatePayment(selectedStudent)}
                   disabled={!isRazorpayLoaded || isLoading || payingStudent?.studentId === selectedStudent.studentId}
                   className="w-full sm:w-auto"
                 >
                   {(isLoading && payingStudent?.studentId === selectedStudent.studentId) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                   Pay INR {gig.budget.toFixed(2)}
                 </Button>
            </CardFooter>
         </Card>
       )}

        {/* Completed Gig & Review Section */}
       {gig.status === 'completed' && selectedStudent && (
          <Card className="glass-card border-green-500 dark:border-green-400">
            <CardHeader>
                 <CardTitle className="text-green-700 dark:text-green-400">Gig Completed!</CardTitle>
                 <CardDescription>
                    This gig with {selectedStudent.studentUsername} has been paid. You can now rate your experience.
                 </CardDescription>
            </CardHeader>
            <CardContent>
                {hasBeenReviewed ? (
                    <Alert variant="default" className='border-blue-500'>
                        <CheckCircle className="h-4 w-4 text-blue-600" />
                        <AlertTitle className="text-blue-700 dark:text-blue-300">Review Submitted</AlertTitle>
                        <AlertDescription>
                            You have already rated {selectedStudent.studentUsername} for this gig.
                            <div className="mt-2">
                                <StarRating value={rating} isEditable={false} size={20}/>
                                {reviewComment && <p className="text-sm italic mt-1">Your comment: "{reviewComment}"</p>}
                            </div>
                        </AlertDescription>
                    </Alert>
                ) : (
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium">Rate {selectedStudent.studentUsername}</h3>
                        <div>
                            <StarRating value={rating} onValueChange={setRating} size={28} isEditable={!isSubmittingReview} />
                            {rating === 0 && <p className="text-xs text-muted-foreground mt-1">Select a star rating.</p>}
                        </div>
                        <Textarea
                            placeholder={`Share your experience working with ${selectedStudent.studentUsername} (optional)...`}
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            rows={3}
                            disabled={isSubmittingReview}
                        />
                        <Button onClick={handleSubmitReview} disabled={isSubmittingReview || rating === 0}>
                            {isSubmittingReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit Review
                        </Button>
                    </div>
                )}
            </CardContent>
             <CardFooter>
                <p className="text-xs text-muted-foreground">
                    View payment details in your <Link href="/client/payments" className="underline">Payment History</Link>.
                </p>
             </CardFooter>
          </Card>
       )}
        {gig.status === 'completed' && !selectedStudent && (
             <Alert variant="default" className="border-green-500 dark:border-green-400">
                 <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                 <AlertTitle className="text-green-700 dark:text-green-300">Gig Completed & Paid</AlertTitle>
                 <AlertDescription>
                    This gig has been marked as completed and payment has been processed.
                    (Selected student details for review not available.)
                 </AlertDescription>
             </Alert>
        )}


       {/* Applicants List Section */}
       {gig.status === 'open' && (
           <Card className="glass-card">
             <CardHeader>
               <CardTitle>Applicants ({gig.applicants?.length || 0})</CardTitle>
               <CardDescription>Review students who applied and accept or reject their application.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
               {!gig.applicants || gig.applicants.length === 0 ? (
                 <p className="text-sm text-muted-foreground text-center py-4">No applications received yet.</p>
               ) : (
                 gig.applicants.map((applicant) => (
                   <div key={applicant.studentId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-md gap-3">
                     <div className="flex items-start gap-3 flex-grow">
                        <UserCircle className="h-8 w-8 text-muted-foreground mt-1 shrink-0" />
                        <div className="flex-grow">
                           <p className="font-semibold">{applicant.studentUsername}</p>
                           <p className="text-xs text-muted-foreground mb-1">Applied {formatDate(applicant.appliedAt)}</p>
                           {applicant.message && (
                             <p className="text-sm bg-secondary p-2 rounded-md my-1 italic">"{applicant.message}"</p>
                           )}
                            <Badge variant={getStatusBadgeVariant(applicant.status)} className="capitalize mt-1 inline-block">
                             {applicant.status || 'pending'}
                           </Badge>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center shrink-0">
                         {applicant.studentId ? (
                            <Button size="sm" variant="outline" asChild>
                                <Link href={`/profile/${applicant.studentId}`} target="_blank">View Profile</Link>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled>View Profile (ID Missing)</Button>
                          )}
                          <Button size="sm" asChild>
                             <Link href={`/chat?userId=${applicant.studentId}&gigId=${gig.id}`}>
                                 <MessageSquare className="mr-1 h-4 w-4" /> Chat
                             </Link>
                         </Button>
                         {(applicant.status === 'pending' || !applicant.status) && (
                             <>
                                <Button
                                     size="sm"
                                     variant="default"
                                     onClick={() => updateApplicantStatus(applicant.studentId, 'accepted')}
                                     disabled={updatingApplicantId === applicant.studentId || isLoading}
                                     className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white"
                                 >
                                     {updatingApplicantId === applicant.studentId ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <CheckCircle className="mr-1 h-4 w-4" />}
                                     Accept
                                 </Button>
                                  <Button
                                     size="sm"
                                     variant="destructive"
                                     onClick={() => updateApplicantStatus(applicant.studentId, 'rejected')}
                                     disabled={updatingApplicantId === applicant.studentId || isLoading}
                                 >
                                      {updatingApplicantId === applicant.studentId ? <Loader2 className="mr-1 h-4 w-4 animate-spin"/> : <XCircle className="mr-1 h-4 w-4" />}
                                     Reject
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

        {gig.status === 'closed' && (
             <Alert variant="destructive">
                <XCircle className="h-5 w-5" />
                <AlertTitle>Gig Closed</AlertTitle>
                <AlertDescription>This gig is closed and no further actions can be taken.</AlertDescription>
            </Alert>
        )}

     </div>
   );
}
