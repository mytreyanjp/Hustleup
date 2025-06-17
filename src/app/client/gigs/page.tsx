
"use client";

import { useState, useEffect, useMemo } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle, Edit, Users, Trash2, CheckCircle, XCircle, Eye, Settings2, Hourglass, MessageSquare, FileText, DollarSign, IndianRupee, Layers } from 'lucide-react'; // Added Layers
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import type { ProgressReport } from '@/app/student/works/page';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import type { NotificationType } from '@/types/notifications';


interface ClientGig {
  id: string;
  title: string;
  status: 'open' | 'in-progress' | 'completed' | 'closed' | 'awaiting_payout';
  createdAt: Timestamp;
  deadline: Timestamp;
  budget: number;
  currency: string;
  selectedStudentId?: string;
  clientDisplayName?: string;
  clientAvatarUrl?: string;
  numberOfReports?: number;
  progressReports?: ProgressReport[];
  applicants?: { studentId: string; studentUsername: string; status?: 'pending' | 'accepted' | 'rejected' }[];
  studentPaymentRequestPending?: boolean;
  pendingApplicantCount: number;
  pendingReportsCount: number;
  isPaymentRequestedByStudent: boolean;
}

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


export default function ClientGigsPage() {
  const { user, userProfile, loading, role } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [allGigs, setAllGigs] = useState<ClientGig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gigToDelete, setGigToDelete] = useState<ClientGig | null>(null);
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);


  useEffect(() => {
    if (!loading && (!user || role !== 'client')) {
      router.push('/auth/login');
    } else if (user && role === 'client') {
      fetchGigs();
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, role, router]);

  const fetchGigs = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const gigsRef = collection(db, "gigs");
      const q = query(
        gigsRef,
        where("clientId", "==", user.uid),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);

      const fetchedGigs = querySnapshot.docs.map(doc => {
        const data = doc.data();
        let pendingApplicants = 0;
        if (data.status === 'open' && data.applicants) {
          pendingApplicants = (data.applicants as any[]).filter(app => !app.status || app.status === 'pending').length;
        }

        let pendingReports = 0;
        if (data.status === 'in-progress' && data.progressReports) {
          pendingReports = (data.progressReports as ProgressReport[]).filter(
            report => report.studentSubmission && report.clientStatus === 'pending_review'
          ).length;
        }
        
        const paymentRequested = data.status === 'in-progress' && data.studentPaymentRequestPending === true;

        return {
          id: doc.id,
          title: data.title || "Untitled Gig",
          status: data.status || 'open',
          createdAt: data.createdAt,
          deadline: data.deadline,
          budget: data.budget || 0,
          currency: data.currency || "INR",
          selectedStudentId: data.selectedStudentId || null,
          clientDisplayName: data.clientDisplayName || userProfile?.companyName || userProfile?.username || 'Me',
          clientAvatarUrl: data.clientAvatarUrl || userProfile?.profilePictureUrl || '',
          numberOfReports: data.numberOfReports || 0,
          progressReports: data.progressReports || [],
          applicants: data.applicants || [],
          studentPaymentRequestPending: data.studentPaymentRequestPending || false,
          pendingApplicantCount: pendingApplicants,
          pendingReportsCount: pendingReports,
          isPaymentRequestedByStudent: paymentRequested,
        } as ClientGig;
      });

      setAllGigs(fetchedGigs);
    } catch (err: any) {
      console.error("Error fetching client gigs:", err);
      setError("Failed to load your gigs. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const categorizedGigs = useMemo(() => {
    return {
      open: allGigs.filter(gig => gig.status === 'open'),
      inProgress: allGigs.filter(gig => gig.status === 'in-progress'),
      awaitingPayout: allGigs.filter(gig => gig.status === 'awaiting_payout'),
      completed: allGigs.filter(gig => gig.status === 'completed'),
      closed: allGigs.filter(gig => gig.status === 'closed'),
    };
  }, [allGigs]);

   const formatDeadline = (timestamp: Timestamp | undefined): string => {
     if (!timestamp) return 'N/A';
     try {
       return format(timestamp.toDate(), "MMM d, yyyy");
     } catch (e) {
       return 'Invalid Date';
     }
   };
   
  const formatDateDistance = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try {
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) {
      return 'Invalid date';
    }
  };

   const getStatusBadgeVariant = (status: ClientGig['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'open': return 'default';
           case 'in-progress': return 'secondary';
           case 'awaiting_payout': return 'secondary'; 
           case 'completed': return 'outline';
           case 'closed': return 'destructive';
           default: return 'secondary';
       }
   };

   const handleConfirmDelete = async () => {
    if (!gigToDelete || !user || !userProfile) return;
    setIsProcessingDelete(true);
    try {
        const gigDocRef = doc(db, 'gigs', gigToDelete.id);
        await deleteDoc(gigDocRef);

        // Notify applicants
        if (gigToDelete.applicants && gigToDelete.applicants.length > 0) {
            for (const applicant of gigToDelete.applicants) {
                await createNotification(
                    applicant.studentId,
                    `The gig "${gigToDelete.title}" you applied to has been deleted by the client.`,
                    'gig_status_update', // Or a more specific type like 'gig_deleted_by_client'
                    gigToDelete.id,
                    gigToDelete.title,
                    undefined, // No specific link for a deleted gig
                    user.uid,
                    userProfile.username || 'The Client'
                );
            }
        }

        setAllGigs(prevGigs => prevGigs.filter(g => g.id !== gigToDelete.id));
        toast({ title: "Gig Deleted", description: `"${gigToDelete.title}" has been successfully deleted.` });
    } catch (err: any) {
        console.error("Error deleting gig:", err);
        toast({ title: "Deletion Failed", description: `Could not delete gig: ${err.message}`, variant: "destructive" });
    } finally {
        setIsProcessingDelete(false);
        setGigToDelete(null);
    }
   };

  if (isLoading || loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10 text-destructive">
        <p>{error}</p>
      </div>
    );
  }

  const GigCard = ({ gig }: { gig: ClientGig }) => {
    let notificationCount = 0;
    let notificationTooltip = "";

    if (gig.status === 'open' && gig.pendingApplicantCount > 0) {
      notificationCount = gig.pendingApplicantCount;
      notificationTooltip = `${gig.pendingApplicantCount} new applicant(s)`;
    } else if (gig.status === 'in-progress') {
      if (gig.pendingReportsCount > 0 && gig.isPaymentRequestedByStudent) {
        notificationCount = gig.pendingReportsCount + 1;
        notificationTooltip = `${gig.pendingReportsCount} report(s) to review & payment requested`;
      } else if (gig.pendingReportsCount > 0) {
        notificationCount = gig.pendingReportsCount;
        notificationTooltip = `${gig.pendingReportsCount} report(s) to review`;
      } else if (gig.isPaymentRequestedByStudent) {
        notificationCount = 1;
        notificationTooltip = `Payment requested by student`;
      }
    }

    return (
    <Card key={gig.id} className="glass-card flex flex-col relative">
      {notificationCount > 0 && (
        <div 
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center shadow-lg border-2 border-background"
            title={notificationTooltip}
        >
            {notificationCount > 9 ? '9+' : notificationCount}
        </div>
      )}
      <CardHeader className="p-4 sm:p-6">
        <div className="flex justify-between items-start gap-2">
           <Link href={`/gigs/${gig.id}`} className="hover:underline flex-grow">
               <CardTitle className="text-lg line-clamp-2">{gig.title}</CardTitle>
           </Link>
           <Badge variant={getStatusBadgeVariant(gig.status)} className="capitalize shrink-0 text-xs">
               {gig.status === 'awaiting_payout' ? 'Payment Processing' : gig.status}
           </Badge>
        </div>
        <CardDescription className="text-xs">
          Created {formatDateDistance(gig.createdAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow p-4 sm:p-6 pt-0">
         <div className="text-xs sm:text-sm text-muted-foreground">
            Deadline: {formatDeadline(gig.deadline)}
         </div>
         <div className="text-xs sm:text-sm text-muted-foreground">
            Payment: ₹{gig.budget.toFixed(2)}
         </div>
         <div className="flex items-center text-xs sm:text-sm text-muted-foreground mt-2">
            <Users className="mr-1 h-4 w-4" /> {(gig.applicants || []).length} Applicant(s)
            {gig.status === 'open' && gig.pendingApplicantCount > 0 && <span className="ml-1 text-destructive text-xs">({gig.pendingApplicantCount} pending)</span>}
         </div>
          {gig.status === 'in-progress' && (
            <>
              {gig.pendingReportsCount > 0 && (
                <div className="flex items-center text-xs sm:text-sm text-amber-600 dark:text-amber-400 mt-1">
                  <FileText className="mr-1 h-4 w-4" /> {gig.pendingReportsCount} Report(s) to Review
                </div>
              )}
              {gig.isPaymentRequestedByStudent && (
                 <div className="flex items-center text-xs sm:text-sm text-green-600 dark:text-green-400 mt-1">
                    <IndianRupee className="mr-1 h-4 w-4" /> Student Requested Payment
                 </div>
              )}
              {gig.numberOfReports > 0 && (
                  <div className="flex items-center text-xs sm:text-sm text-muted-foreground mt-1">
                      <Layers className="mr-1 h-4 w-4" /> Requires {gig.numberOfReports} progress report{gig.numberOfReports > 1 ? 's' : ''}
                  </div>
              )}
            </>
          )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row sm:flex-wrap justify-end gap-2 border-t p-4 pt-4 sm:p-6 sm:pt-4">
        {gig.status === 'open' && (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/client/gigs/${gig.id}/manage`}>
                <Users className="mr-1 h-4 w-4" /> View Applicants
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/client/gigs/${gig.id}/edit`}>
                <Edit className="mr-1 h-4 w-4" /> Edit Gig
              </Link>
            </Button>
             <Button variant="destructive" size="sm" onClick={() => setGigToDelete(gig)} disabled={isProcessingDelete}>
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
          </>
        )}
        {(gig.status === 'in-progress' || gig.status === 'awaiting_payout') && (
          <Button variant="default" size="sm" asChild>
            <Link href={`/client/gigs/${gig.id}/manage`}>
              {gig.status === 'awaiting_payout' ? <Hourglass className="mr-1 h-4 w-4" /> : <Settings2 className="mr-1 h-4 w-4" />} 
              {gig.status === 'awaiting_payout' ? 'Track Payout' : 'Manage & Pay'}
            </Link>
          </Button>
        )}
        {(gig.status === 'completed' || gig.status === 'closed') && (
           <Button variant="outline" size="sm" asChild>
            <Link href={`/gigs/${gig.id}`}>
              <Eye className="mr-1 h-4 w-4" /> View Details
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  )};

  const renderGigSection = (title: string, gigsToRender: ClientGig[], icon: React.ReactNode) => {
    if (gigsToRender.length === 0 && title !== "Open Gigs") return null; 

    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight">{title} ({gigsToRender.length})</h2>
        </div>
        {gigsToRender.length === 0 ? (
          <p className="text-muted-foreground ml-8 text-sm">No gigs in this category.</p>
        ) : (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            {gigsToRender.map((gig) => <GigCard gig={gig} key={gig.id} />)}
          </div>
        )}
      </section>
    );
  };


  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Gigs</h1>
        <Button asChild size="sm" className="sm:text-sm">
          <Link href="/client/gigs/new">
            <PlusCircle className="mr-2 h-4 w-4" /> Post a New Gig
          </Link>
        </Button>
      </div>

      {allGigs.length === 0 && !isLoading ? (
        <Card className="glass-card text-center py-10">
          <CardHeader className="p-4 sm:p-6">
              <CardTitle>No Gigs Found</CardTitle>
              <CardDescription>You haven't posted any gigs yet.</CardDescription>
          </CardHeader>
           <CardContent className="p-4 sm:p-6 pt-0">
             <Button asChild>
                <Link href="/client/gigs/new">Post Your First Gig</Link>
             </Button>
           </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {renderGigSection("In-Progress Gigs", categorizedGigs.inProgress, <Settings2 className="h-5 w-5 sm:h-6 sm:w-6 text-secondary-foreground" />)}
          {renderGigSection("Awaiting Payout", categorizedGigs.awaitingPayout, <Hourglass className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500" />)}
          {renderGigSection("Open Gigs", categorizedGigs.open, <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />)}
          {renderGigSection("Completed Gigs", categorizedGigs.completed, <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-green-500" />)}
          {renderGigSection("Closed Gigs", categorizedGigs.closed, <XCircle className="h-5 w-5 sm:h-6 sm:w-6 text-destructive" />)}
        </div>
      )}
      {gigToDelete && (
        <AlertDialog open={!!gigToDelete} onOpenChange={(open) => !open && setGigToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to delete this gig?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. Deleting "{gigToDelete.title}" will remove it permanently.
                        {gigToDelete.applicants && gigToDelete.applicants.length > 0 && ` Any applicants will be notified.`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setGigToDelete(null)} disabled={isProcessingDelete}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmDelete} disabled={isProcessingDelete} className="bg-destructive hover:bg-destructive/90">
                        {isProcessingDelete ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Yes, Delete Gig
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

