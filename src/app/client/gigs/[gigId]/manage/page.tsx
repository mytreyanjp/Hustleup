"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, Timestamp, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, UserCircle, CheckCircle, XCircle, CreditCard, MessageSquare, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useRazorpay } from '@/hooks/use-razorpay'; // Import the Razorpay hook
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"


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
  selectedStudentId?: string | null; // Track hired student
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
  const [payingStudent, setPayingStudent] = useState<ApplicantInfo | null>(null); // Student being paid

  // --- Razorpay Integration ---
   const handlePaymentSuccess = async (paymentDetails: { paymentId: string; orderId?: string; signature?: string }) => {
    console.log("Razorpay Success:", paymentDetails);
     if (!payingStudent || !gig || !user) return;

     setIsLoading(true); // Show loading indicator during Firestore update
     try {
         // 1. Record the transaction in Firestore
         const transactionData = {
             clientId: user.uid,
             clientUsername: userProfile?.username || user.email?.split('@')[0],
             studentId: payingStudent.studentId,
             studentUsername: payingStudent.studentUsername,
             gigId: gig.id,
             gigTitle: gig.title,
             amount: gig.budget, // Use the gig's budget
             currency: 'INR', // Assuming INR for Razorpay
             status: 'succeeded',
             razorpayPaymentId: paymentDetails.paymentId,
             razorpayOrderId: paymentDetails.orderId, // Optional
             paidAt: serverTimestamp(),
         };
         await addDoc(collection(db, "transactions"), transactionData);
         console.log("Transaction recorded:", transactionData);


          // 2. Update Gig Status to 'completed' (or handle partial payments differently)
          const gigDocRef = doc(db, 'gigs', gig.id);
          await updateDoc(gigDocRef, {
              status: 'completed',
          });
         setGig(prev => prev ? { ...prev, status: 'completed' } : null); // Update local state


         toast({
             title: "Payment Successful!",
             description: `Payment of $${gig.budget.toFixed(2)} to ${payingStudent.studentUsername} recorded.`,
         });

     } catch (err) {
         console.error("Error recording transaction or updating gig status:", err);
         toast({
             title: "Payment Recorded, Update Failed",
             description: "Payment was successful but updating gig status failed. Please contact support.",
             variant: "destructive",
         });
     } finally {
         setPayingStudent(null); // Clear paying state
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
     setPayingStudent(null); // Clear paying state
   };

   const { openCheckout, isLoaded: isRazorpayLoaded } = useRazorpay({
     keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, // Get Key ID from env
     onPaymentSuccess: handlePaymentSuccess,
     onPaymentError: handlePaymentError,
   });

   const initiatePayment = (student: ApplicantInfo) => {
     if (!gig || !userProfile || !isRazorpayLoaded) {
         toast({ title: "Cannot Initiate Payment", description: "Payment gateway or user details missing.", variant: "destructive"});
         return;
     };
     setPayingStudent(student); // Mark which student is being paid

     openCheckout({
       amount: gig.budget * 100, // Amount in paise
       currency: "INR", // Or your desired currency
       name: "HustleUp Gig Payment",
       description: `Payment for: ${gig.title}`,
       prefill: {
         name: userProfile?.username || user?.email?.split('@')[0],
         email: user?.email || '',
         // contact: userProfile?.phone // If you collect phone numbers
       },
       notes: {
         gigId: gig.id,
         studentId: student.studentId,
         clientId: user?.uid,
       },
       // theme: { color: '#1A202C' } // Already handled in the hook
     });
   };
  // --- End Razorpay Integration ---


   const fetchGigData = useCallback(async () => {
       if (!gigId || !user) return; // Ensure gigId and user are available
       setIsLoading(true);
       setError(null);
       try {
         const gigDocRef = doc(db, 'gigs', gigId);
         const docSnap = await getDoc(gigDocRef);

         if (docSnap.exists()) {
           const fetchedGig = { id: docSnap.id, ...docSnap.data() } as Gig;
           // Ensure the current user is the client owner
           if (fetchedGig.clientId !== user.uid) {
             setError("You are not authorized to manage this gig.");
              setGig(null);
           } else {
              setGig(fetchedGig);
           }
         } else {
           setError("Gig not found.");
         }
       } catch (err: any) {
         console.error("Error fetching gig:", err);
         setError("Failed to load gig details.");
       } finally {
         setIsLoading(false);
       }
   }, [gigId, user]);


  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') {
        router.push('/auth/login');
      } else {
         fetchGigData(); // Fetch data only after auth check passes
      }
    }
  }, [authLoading, user, role, router, fetchGigData]);


   // Function to update applicant status within the gig document
   const updateApplicantStatus = async (studentId: string, newStatus: 'accepted' | 'rejected') => {
       if (!gig) return;
       setUpdatingApplicantId(studentId);
       try {
           const gigDocRef = doc(db, 'gigs', gig.id);
            // Create the updated applicants array
           const updatedApplicants = gig.applicants?.map(app =>
               app.studentId === studentId ? { ...app, status: newStatus } : app
           ) || [];

           let gigUpdateData: any = { applicants: updatedApplicants };

           // If accepting, update the main gig status and selected student
           if (newStatus === 'accepted') {
               gigUpdateData.status = 'in-progress';
               gigUpdateData.selectedStudentId = studentId;
                // Optionally reject all other pending applicants
               // updatedApplicants = updatedApplicants.map(app =>
               //    (app.studentId !== studentId && app.status === 'pending') ? { ...app, status: 'rejected' } : app
               // );
               // gigUpdateData.applicants = updatedApplicants;
           }

           await updateDoc(gigDocRef, gigUpdateData);

            // Update local state to reflect changes immediately
           setGig(prev => prev ? {
                ...prev,
                status: newStatus === 'accepted' ? 'in-progress' : prev.status,
                selectedStudentId: newStatus === 'accepted' ? studentId : prev.selectedStudentId,
                applicants: updatedApplicants
            } : null);


           toast({ title: `Applicant ${newStatus === 'accepted' ? 'Accepted' : 'Rejected'}`, description: `Status updated successfully.`});

       } catch (err: any) {
           console.error("Error updating applicant status:", err);
           toast({ title: "Update Failed", description: `Could not update status: ${err.message}`, variant: "destructive" });
       } finally {
           setUpdatingApplicantId(null);
       }
   };


   const formatDate = (timestamp: Timestamp | undefined): string => {
     if (!timestamp) return 'N/A';
     try {
       return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
     } catch (e) { return 'Invalid date'; }
   };

    const getStatusBadgeVariant = (status: ApplicantInfo['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'accepted': return 'default';
           case 'rejected': return 'destructive';
           case 'pending':
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
                <Badge variant={getStatusBadgeVariant(gig.status as any)} className="capitalize">{gig.status}</Badge>
           </div>
         </CardHeader>
          {/* Optionally add brief gig details here if needed */}
       </Card>


       {/* Hired Student & Payment Section */}
       {gig.status === 'in-progress' && selectedStudent && (
         <Card className="glass-card border-green-500 dark:border-green-400">
           <CardHeader>
             <CardTitle className="text-green-600 dark:text-green-400">Gig In Progress</CardTitle>
             <CardDescription>You have accepted an applicant. You can initiate payment once the work is complete.</CardDescription>
           </CardHeader>
           <CardContent>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-md gap-3 bg-background">
                  <div className="flex items-start gap-3 flex-grow">
                      <UserCircle className="h-8 w-8 text-muted-foreground mt-1 shrink-0" />
                      <div className="flex-grow">
                         <p className="font-semibold">{selectedStudent.studentUsername}</p>
                         <p className="text-xs text-muted-foreground mb-1">Accepted {formatDate(selectedStudent.appliedAt)}</p>
                      </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center shrink-0">
                     <Button size="sm" variant="outline" asChild>
                          <Link href={`/profile/${selectedStudent.studentId}`} target="_blank">View Profile</Link>
                      </Button>
                       <Button size="sm" asChild>
                          <Link href={`/chat?userId=${selectedStudent.studentId}&gigId=${gig.id}`}>
                              <MessageSquare className="mr-1 h-4 w-4" /> Chat
                          </Link>
                      </Button>
                  </div>
              </div>
           </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 border-t pt-4">
                <p className="text-sm text-muted-foreground flex-grow text-center sm:text-left mb-2 sm:mb-0">Ready to pay ${gig.budget.toFixed(2)} for the completed work?</p>
                <Button
                   size="lg"
                   onClick={() => initiatePayment(selectedStudent)}
                   disabled={!isRazorpayLoaded || isLoading || payingStudent?.studentId === selectedStudent.studentId}
                   className="w-full sm:w-auto"
                 >
                   {(isLoading && payingStudent?.studentId === selectedStudent.studentId) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                   Pay ${gig.budget.toFixed(2)} via Razorpay
                 </Button>
            </CardFooter>
         </Card>
       )}

        {/* Completed Gig Section */}
       {gig.status === 'completed' && (
          <Alert variant="default" className="border-green-500 dark:border-green-400">
             <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
             <AlertTitle className="text-green-700 dark:text-green-300">Gig Completed & Paid</AlertTitle>
             <AlertDescription>
                This gig has been marked as completed and payment has been processed. View transaction details in your{' '}
                 <Link href="/client/payments" className="font-medium underline">Payment History</Link>.
                 {selectedStudent && ` Student: ${selectedStudent.studentUsername}.`}
             </AlertDescription>
         </Alert>
       )}


       {/* Applicants List Section (Only if gig is open or no one is selected yet) */}
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
                     {/* Applicant Info */}
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

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:items-center shrink-0">
                         <Button size="sm" variant="outline" asChild>
                             <Link href={`/profile/${applicant.studentId}`} target="_blank">View Profile</Link>
                         </Button>
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
                                     className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
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

        {/* Message for closed/rejected gigs */}
        {gig.status === 'closed' && (
             <Alert variant="destructive">
                <XCircle className="h-5 w-5" />
                <AlertTitle>Gig Closed</AlertTitle>
                <AlertDescription>This gig is closed and no further actions can be taken.</AlertDescription>
            </Alert>
        )}
         {/* Add similar alerts for rejected status if needed */}


     </div>
   );
}

