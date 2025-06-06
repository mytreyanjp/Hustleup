
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
// import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; // Media upload disabled
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, MessageSquare, Layers, CalendarDays, DollarSign, Briefcase, UploadCloud, FileText, Paperclip, Edit, Send, X as XIcon, ChevronDown, ChevronUp, Search as SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow, isBefore } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
// import { Progress } from '@/components/ui/progress'; // Media upload disabled
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from '@/lib/utils';

interface StudentSubmission {
  text: string;
  fileUrl?: string;
  fileName?: string;
  submittedAt: Timestamp;
}

export interface ProgressReport { // Exported for use in other files
  reportNumber: number;
  deadline?: Timestamp | null;
  studentSubmission?: StudentSubmission | null;
  clientStatus?: 'pending_review' | 'approved' | 'rejected' | null;
  clientFeedback?: string | null;
  reviewedAt?: Timestamp | null;
}


interface WorkGig {
  id: string;
  title: string;
  clientId: string;
  clientUsername?: string;
  clientCompanyName?: string;
  deadline: Timestamp; // Overall gig deadline
  budget: number;
  currency: string;
  numberOfReports?: number;
  paymentRequestsCount?: number;
  lastPaymentRequestedAt?: Timestamp;
  studentPaymentRequestPending?: boolean;
  status: 'in-progress';
  progressReports?: ProgressReport[];
  // For internal processing
  effectiveStatus?: 'action-required' | 'pending-review' | 'in-progress';
  nextUpcomingDeadline?: Timestamp | null;
}

type EffectiveStatusType = 'action-required' | 'pending-review' | 'in-progress';


// Helper function to determine the effective status of a gig for a student
const getEffectiveGigStatus = (gig: WorkGig): EffectiveStatusType => {
    if (!gig.progressReports || gig.progressReports.length === 0 || (gig.numberOfReports === 0)) {
        return 'in-progress'; // No reports defined, or none submitted yet
    }
    const hasRejected = gig.progressReports.some(r => r.clientStatus === 'rejected');
    if (hasRejected) return 'action-required';

    const hasPendingReview = gig.progressReports.some(r => r.studentSubmission && r.clientStatus === 'pending_review');
    if (hasPendingReview) return 'pending-review';
    
    const allReportsApproved = gig.progressReports.every(r => r.clientStatus === 'approved');
    if (allReportsApproved && gig.progressReports.length === (gig.numberOfReports || 0)) {
        return 'in-progress'; // All reports done and approved, awaiting final gig completion/payment
    }

    return 'in-progress'; // Actively working, or next report due
};

// Helper function to get the next upcoming deadline (report or final gig)
const getNextUpcomingDeadline = (gig: WorkGig): Timestamp | null => {
    let nextDeadline: Timestamp | null = gig.deadline; // Start with overall gig deadline
    const now = Timestamp.now();

    if (gig.progressReports && gig.progressReports.length > 0) {
        const futureReportDeadlines = gig.progressReports
            .filter(r => r.deadline && r.deadline.toMillis() >= now.toMillis() && r.clientStatus !== 'approved' && r.clientStatus !== 'rejected')
            .sort((a, b) => (a.deadline?.toMillis() || Infinity) - (b.deadline?.toMillis() || Infinity));
        
        if (futureReportDeadlines.length > 0 && futureReportDeadlines[0].deadline) {
            if (!nextDeadline || futureReportDeadlines[0].deadline.toMillis() < nextDeadline.toMillis()) {
                nextDeadline = futureReportDeadlines[0].deadline;
            }
        } else {
             const unapprovedUnrejectedFutureReports = gig.progressReports
                .filter(r => r.deadline && r.deadline.toMillis() >= now.toMillis() && r.clientStatus !== 'approved' && r.clientStatus !== 'rejected');
             if (unapprovedUnrejectedFutureReports.length === 0) {
             }
        }
    }
    return nextDeadline;
};


export default function StudentWorksPage() {
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [activeGigs, setActiveGigs] = useState<WorkGig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedGigs, setCollapsedGigs] = useState<Set<string>>(new Set());

  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [currentSubmittingGigId, setCurrentSubmittingGigId] = useState<string | null>(null);
  const [currentReportNumber, setCurrentReportNumber] = useState<number | null>(null);
  const [reportText, setReportText] = useState("");

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<EffectiveStatusType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'deadlineAsc' | 'deadlineDesc'>('default');

  const [showPaymentRequestDialog, setShowPaymentRequestDialog] = useState(false);
  const [paymentRequestGig, setPaymentRequestGig] = useState<WorkGig | null>(null);
  const [isRequestingPayment, setIsRequestingPayment] = useState(false);


  const fetchActiveGigs = useCallback(async (currentUserId: string) => {
    if (!currentUserId || !db) return; // Added check for currentUserId
    setIsLoading(true); setError(null);
    try {
      const gigsRef = collection(db, "gigs");
      const q = query( gigsRef, where("selectedStudentId", "==", currentUserId), where("status", "==", "in-progress"), orderBy("createdAt", "desc") );
      const querySnapshot = await getDocs(q);
      const fetchedGigsPromises = querySnapshot.docs.map(async (gigDoc) => {
        const gigData = gigDoc.data();
        let clientUsername = gigData.clientUsername || 'Client';
        let clientCompanyName: string | undefined = undefined;
        if (gigData.clientId && db) {
          try {
            const clientDocRef = doc(db, 'users', gigData.clientId);
            const clientDocSnap = await getDoc(clientDocRef);
            if (clientDocSnap.exists()) {
              const clientProfile = clientDocSnap.data() as UserProfile;
              clientUsername = clientProfile.username || clientUsername;
              clientCompanyName = clientProfile.companyName;
            }
          } catch (clientProfileError) { console.error("Error fetching client profile:", clientProfileError); }
        }

        const numReports = gigData.numberOfReports || 0;
        const completeProgressReports: ProgressReport[] = [];
        if (numReports > 0) {
            for (let i = 0; i < numReports; i++) {
                const existingReport = (gigData.progressReports as ProgressReport[])?.find(pr => pr.reportNumber === i + 1);
                completeProgressReports.push({
                    reportNumber: i + 1,
                    deadline: existingReport?.deadline || null,
                    studentSubmission: existingReport?.studentSubmission || null,
                    clientStatus: existingReport?.clientStatus || null,
                    clientFeedback: existingReport?.clientFeedback || null,
                    reviewedAt: existingReport?.reviewedAt || null,
                });
            }
        }

        return {
          id: gigDoc.id, title: gigData.title || "Untitled Gig", clientId: gigData.clientId, clientUsername, clientCompanyName,
          deadline: gigData.deadline, budget: gigData.budget || 0, currency: gigData.currency || "INR",
          numberOfReports: numReports, status: gigData.status,
          paymentRequestsCount: gigData.paymentRequestsCount || 0,
          lastPaymentRequestedAt: gigData.lastPaymentRequestedAt || null,
          studentPaymentRequestPending: gigData.studentPaymentRequestPending || false,
          progressReports: completeProgressReports,
        } as WorkGig;
      });
      const resolvedGigs = await Promise.all(fetchedGigsPromises);
      const gigsWithEffectiveStatus = resolvedGigs.map(gig => ({
          ...gig,
          effectiveStatus: getEffectiveGigStatus(gig),
          nextUpcomingDeadline: getNextUpcomingDeadline(gig)
      }));
      setActiveGigs(gigsWithEffectiveStatus);
      // Initialize collapsed state based on initial effective status
      setCollapsedGigs(new Set(gigsWithEffectiveStatus.filter(g => g.effectiveStatus === 'in-progress').map(gig => gig.id)));

    } catch (err: any) { console.error("Error fetching active gigs:", err); setError("Failed to load your active works. This might be due to a missing Firestore index.");
    } finally { setIsLoading(false); }
  }, []); // Removed db from dependencies as it's stable

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'student') {
        router.push('/auth/login?redirect=/student/works');
      } else if (user && role === 'student') { // Ensure user is available
        fetchActiveGigs(user.uid); // Pass user.uid directly
      }
    }
  }, [user, authLoading, role, router, fetchActiveGigs]);

  const processedGigs = useMemo(() => {
    if (!activeGigs) return [];
    let gigsToProcess = [...activeGigs]; 

    // Re-calculate effectiveStatus and nextUpcomingDeadline if not already on the object
    // or if it needs to be fresh based on some other criteria (not strictly needed here if fetchActiveGigs sets it)
    gigsToProcess = gigsToProcess.map(gig => ({
        ...gig,
        effectiveStatus: gig.effectiveStatus || getEffectiveGigStatus(gig),
        nextUpcomingDeadline: gig.nextUpcomingDeadline || getNextUpcomingDeadline(gig)
    }));


    if (searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      gigsToProcess = gigsToProcess.filter(gig =>
        gig.title.toLowerCase().includes(lowerSearchTerm) ||
        (gig.clientCompanyName && gig.clientCompanyName.toLowerCase().includes(lowerSearchTerm)) ||
        (gig.clientUsername && gig.clientUsername.toLowerCase().includes(lowerSearchTerm))
      );
    }

    if (filterStatus !== 'all') {
      gigsToProcess = gigsToProcess.filter(gig => gig.effectiveStatus === filterStatus);
    }

    gigsToProcess.sort((a, b) => {
      const statusOrder: Record<EffectiveStatusType, number> = {
        'action-required': 1,
        'pending-review': 2,
        'in-progress': 3,
      };
      const statusA = statusOrder[a.effectiveStatus!];
      const statusB = statusOrder[b.effectiveStatus!];
      if (statusA !== statusB) return statusA - statusB;

      const deadlineA = a.nextUpcomingDeadline?.toMillis() || Infinity;
      const deadlineB = b.nextUpcomingDeadline?.toMillis() || Infinity;

      if (sortBy === 'deadlineAsc') {
        return deadlineA - deadlineB;
      } else if (sortBy === 'deadlineDesc') {
        return deadlineB - deadlineA;
      }
      // Default sort by deadline ascending if statuses are the same
      return deadlineA - deadlineB;
    });

    return gigsToProcess;
  }, [activeGigs, searchTerm, filterStatus, sortBy]);


  const toggleGigCollapse = (gigId: string) => {
    setCollapsedGigs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(gigId)) {
        newSet.delete(gigId);
      } else {
        newSet.add(gigId);
      }
      return newSet;
    });
  };

  const handleOpenSubmitReportDialog = (gigId: string, reportNumber: number) => {
    setCurrentSubmittingGigId(gigId);
    setCurrentReportNumber(reportNumber);
    setReportText("");
  };


  const handleSubmitReport = async () => {
    if (!currentSubmittingGigId || !currentReportNumber || !user || !db) { 
      toast({ title: "Error", description: "Cannot submit report. Missing context or Firebase not ready.", variant: "destructive" });
      return;
    }
    if (!reportText.trim()) {
      toast({ title: "Description Required", description: "Please provide a description for your report.", variant: "destructive" });
      return;
    }
    setIsSubmittingReport(true);
    try {
      const gigDocRef = doc(db, 'gigs', currentSubmittingGigId);
      const gigSnap = await getDoc(gigDocRef);
      if (!gigSnap.exists()) throw new Error("Gig not found");

      const currentGigData = gigSnap.data() as WorkGig;
      let progressReports: ProgressReport[] = currentGigData.progressReports || [];

      const reportIndex = progressReports.findIndex(r => r.reportNumber === currentReportNumber);
      const studentSubmission: StudentSubmission = {
        text: reportText.trim(),
        submittedAt: Timestamp.now(),
      };

      if (reportIndex > -1) {
        progressReports[reportIndex] = {
          ...progressReports[reportIndex],
          studentSubmission,
          clientStatus: 'pending_review',
          clientFeedback: null, // Reset client feedback on new submission
          reviewedAt: null,    // Reset reviewedAt
        };
      } else {
        // This case should ideally not happen if reports are pre-initialized for the gig
        progressReports.push({
          reportNumber: currentReportNumber as number,
          deadline: null, // Or fetch actual deadline if available
          studentSubmission,
          clientStatus: 'pending_review',
          clientFeedback: null,
          reviewedAt: null,
        });
      }
      progressReports.sort((a, b) => a.reportNumber - b.reportNumber);

      await updateDoc(gigDocRef, { progressReports });

      toast({ title: `Report #${currentReportNumber} Submitted`, description: "The client has been notified." });
      setCurrentSubmittingGigId(null);
      if(user) fetchActiveGigs(user.uid); // Re-fetch gigs for the current user
    } catch (err: any) {
      console.error("Error submitting report:", err);
      toast({ title: "Submission Error", description: `Could not submit report: ${err.message}`, variant: "destructive" });
    } finally {
      setIsSubmittingReport(false);
    }
  };
  
  const handleRequestPayment = async () => {
    if (!paymentRequestGig || !user || !db) {
        toast({title: "Error", description: "Cannot request payment. Missing gig info or user session.", variant: "destructive"});
        return;
    }
    setIsRequestingPayment(true);
    try {
        const gigDocRef = doc(db, 'gigs', paymentRequestGig.id);
        await updateDoc(gigDocRef, {
            paymentRequestsCount: (paymentRequestGig.paymentRequestsCount || 0) + 1,
            lastPaymentRequestedAt: serverTimestamp(),
            studentPaymentRequestPending: true,
        });
        toast({ title: "Payment Requested!", description: "The client has been notified of your payment request."});
        setShowPaymentRequestDialog(false);
        setPaymentRequestGig(null);
        if(user) fetchActiveGigs(user.uid); // Re-fetch to update UI
    } catch (error: any) {
        console.error("Error requesting payment:", error);
        toast({ title: "Error", description: `Could not request payment: ${error.message}`, variant: "destructive"});
    } finally {
        setIsRequestingPayment(false);
    }
  };

  const formatDeadlineDate = (timestamp: Timestamp | undefined | null): string => {
    if (!timestamp) return 'N/A';
    try { return format(timestamp.toDate(), "MMM d, yyyy"); } catch (e) { return 'Invalid Date'; }
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

  const getEffectiveStatusBadgeVariant = (status?: EffectiveStatusType): "default" | "secondary" | "destructive" | "outline" => {
     switch (status) {
      case 'action-required': return 'destructive';
      case 'pending-review': return 'secondary';
      case 'in-progress':
      default: return 'default';
    }
  };

  const getEffectiveStatusLabel = (status?: EffectiveStatusType): string => {
     switch (status) {
      case 'action-required': return 'Action Required';
      case 'pending-review': return 'Pending Client Review';
      case 'in-progress':
      default: return 'In Progress';
    }
  }


  if (isLoading || authLoading) return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (error) return <div className="text-center py-10 text-destructive"><p>{error}</p></div>;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Your Works</h1>
        <Button variant="outline" asChild size="sm" className="sm:text-sm"><Link href="/gigs/browse">Find More Gigs</Link></Button>
      </div>

      <Card className="glass-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-1">
            <label htmlFor="search-works" className="text-xs font-medium text-muted-foreground block mb-1">Search Gigs</label>
            <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    id="search-works"
                    type="search"
                    placeholder="Gig title or client name..."
                    className="pl-8 h-9 text-sm"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
          </div>
          <div>
            <label htmlFor="filter-status-works" className="text-xs font-medium text-muted-foreground block mb-1">Filter by Status</label>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as EffectiveStatusType | 'all')}>
              <SelectTrigger id="filter-status-works" className="h-9 text-sm">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Active Works</SelectItem>
                <SelectItem value="action-required">Action Required</SelectItem>
                <SelectItem value="pending-review">Pending Client Review</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="sort-by-works" className="text-xs font-medium text-muted-foreground block mb-1">Sort by Deadline</label>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as 'default' | 'deadlineAsc' | 'deadlineDesc')}>
              <SelectTrigger id="sort-by-works" className="h-9 text-sm">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default (Priority First)</SelectItem>
                <SelectItem value="deadlineAsc">Deadline: Nearest First</SelectItem>
                <SelectItem value="deadlineDesc">Deadline: Furthest First</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {processedGigs.length === 0 && !isLoading ? (
        <Card className="glass-card text-center py-10">
          <CardHeader className="p-4 sm:p-6"> <Briefcase className="mx-auto h-12 w-12 text-muted-foreground mb-4" /> <CardTitle>No Active Works Found</CardTitle> </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {searchTerm || filterStatus !== 'all' ? (
                <p className="text-muted-foreground mb-4">No active works match your current search or filters.</p>
            ) : (
                <>
                    <p className="text-muted-foreground mb-4">You don't have any gigs currently in progress.</p>
                    <p className="text-sm text-muted-foreground">Once a client accepts your application, the gig will appear here.</p>
                </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {processedGigs.map((gig) => {
            const isCollapsed = collapsedGigs.has(gig.id);
            const effectiveStatusLabel = getEffectiveStatusLabel(gig.effectiveStatus);
            const effectiveStatusVariant = getEffectiveStatusBadgeVariant(gig.effectiveStatus);
            const allReportsApproved = gig.numberOfReports && gig.numberOfReports > 0 ? (gig.progressReports?.filter(r => r.clientStatus === 'approved').length === gig.numberOfReports) : true;
            const requestsUsed = gig.paymentRequestsCount || 0;
            const canRequestPayment = allReportsApproved && requestsUsed < 5 && !gig.studentPaymentRequestPending;

            return (
            <Card key={gig.id} className="glass-card">
              <CardHeader className="flex flex-col sm:flex-row justify-between items-start p-4 sm:p-6 gap-2">
                <div className="flex-grow">
                  <Link href={`/gigs/${gig.id}`} className="hover:underline">
                      <CardTitle className="text-lg sm:text-xl">{gig.title}</CardTitle>
                  </Link>
                  <CardDescription className="text-xs sm:text-sm"> Client: <Link href={`/profile/${gig.clientId}`} className="text-primary hover:underline">{gig.clientCompanyName || gig.clientUsername}</Link></CardDescription>
                  <div className="mt-1">
                     <Badge variant={effectiveStatusVariant} size="sm" className="capitalize text-xs">{effectiveStatusLabel}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                    <Button variant="ghost" size="icon" onClick={() => toggleGigCollapse(gig.id)} className="h-8 w-8">
                        {isCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                        <span className="sr-only">{isCollapsed ? 'Expand' : 'Collapse'}</span>
                    </Button>
                </div>
              </CardHeader>
              <div
                className={cn(
                  "transition-all duration-300 ease-in-out overflow-hidden",
                  isCollapsed ? "max-h-0 opacity-0" : "max-h-[1500px] opacity-100" 
                )}
              >
                <CardContent className="space-y-3 pt-3 p-4 sm:p-6">
                  <div className="flex items-center text-xs sm:text-sm"> <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" /> <span className="text-muted-foreground mr-1">Budget:</span> <span className="font-medium">{gig.currency} {gig.budget.toFixed(2)}</span> </div>
                  <div className="flex items-center text-xs sm:text-sm"> <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" /> <span className="text-muted-foreground mr-1">Gig Deadline:</span> <span className="font-medium">{formatDeadlineDate(gig.deadline)}</span> </div>
                  {gig.nextUpcomingDeadline && gig.nextUpcomingDeadline.toMillis() !== gig.deadline.toMillis() && (
                       <div className="flex items-center text-xs sm:text-sm text-amber-600 dark:text-amber-400"> <CalendarDays className="mr-2 h-4 w-4" /> <span className="font-semibold mr-1">Next Report Due:</span> <span className="font-medium">{formatDeadlineDate(gig.nextUpcomingDeadline)}</span> </div>
                  )}

                  {gig.numberOfReports !== undefined && gig.numberOfReports > 0 && (
                    <div className="pt-2 border-t">
                      <h4 className="font-semibold mt-2 mb-2 text-sm sm:text-md">Progress Reports ({gig.progressReports?.filter(r => r.studentSubmission).length || 0} / {gig.numberOfReports})</h4>
                      <div className="space-y-3">
                        {gig.progressReports?.map(report => {
                          const previousReport = gig.progressReports?.find(r => r.reportNumber === report.reportNumber - 1);
                          const canSubmitThisReport = report.reportNumber === 1 || (previousReport?.clientStatus === 'approved');
                          const isRejected = report.clientStatus === 'rejected';

                          return (
                            <Card key={report.reportNumber} className="bg-background/50 p-2 sm:p-3">
                              <div className="flex justify-between items-center mb-1">
                                <h5 className="font-medium text-xs sm:text-sm">Report #{report.reportNumber}</h5>
                                <Badge variant={getReportStatusBadgeVariant(report.clientStatus)} size="sm" className="capitalize text-xs">
                                  {report.clientStatus ? report.clientStatus.replace('_', ' ') : 'Awaiting Submission'}
                                </Badge>
                              </div>
                               {report.deadline && <p className="text-xs text-muted-foreground mb-1"><CalendarDays className="inline h-3 w-3 mr-0.5" />Report Deadline: {formatSpecificDate(report.deadline)}</p>}
                              {report.studentSubmission ? (
                                <div className="text-xs space-y-1">
                                  <p className="line-clamp-2"><strong>Your submission:</strong> {report.studentSubmission.text}</p>
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
                                  <Button size="xs" variant="outline" className="mt-2 text-xs h-7 px-2" onClick={() => handleOpenSubmitReportDialog(gig.id, report.reportNumber)}>
                                      <Edit className="mr-1 h-3 w-3" /> {isRejected ? 'Resubmit Report' : 'Submit Report'} #{report.reportNumber}
                                  </Button>
                              )}
                               {!canSubmitThisReport && !report.studentSubmission && report.reportNumber > (gig.progressReports?.filter(r => r.studentSubmission && r.clientStatus !== 'rejected').length || 0) && (
                                  <p className="text-xs text-muted-foreground italic mt-1">Previous report needs approval before submitting this one.</p>
                              )}
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row items-start sm:items-stretch gap-2 border-t p-4 pt-4 sm:p-6 sm:pt-4">
                    <div className="flex-grow space-y-2 sm:space-y-0 sm:flex sm:gap-2">
                        <Button size="sm" asChild className="w-full sm:w-auto"><Link href={`/chat?userId=${gig.clientId}&gigId=${gig.id}`}><MessageSquare className="mr-1 h-4 w-4" />Chat with Client</Link></Button>
                        <Button variant="outline" size="sm" asChild className="w-full sm:w-auto"><Link href={`/gigs/${gig.id}`}>View Gig Details</Link></Button>
                    </div>
                    {gig.studentPaymentRequestPending ? (
                        <Button size="sm" variant="secondary" disabled className="w-full sm:w-auto mt-2 sm:mt-0">
                            Payment Requested ({formatDistanceToNow(gig.lastPaymentRequestedAt!.toDate(), { addSuffix: true })})
                        </Button>
                    ) : canRequestPayment ? (
                        <Button
                            size="sm"
                            variant="default"
                            onClick={() => {setPaymentRequestGig(gig); setShowPaymentRequestDialog(true);}}
                            className="w-full sm:w-auto mt-2 sm:mt-0"
                        >
                            Request Payment ({requestsUsed}/5 left)
                        </Button>
                    ) : (
                         <Button size="sm" variant="outline" disabled className="w-full sm:w-auto mt-2 sm:mt-0" title={!allReportsApproved ? "All reports must be approved first" : (requestsUsed >=5 ? "Max payment requests reached" : "Payment request criteria not met")}>
                            Request Payment {requestsUsed >= 5 ? '(Limit Reached)' : `(${requestsUsed}/5 left)`}
                        </Button>
                    )}
                </CardFooter>
              </div>
            </Card>
          )})}
        </div>
      )}

      <Dialog open={!!currentSubmittingGigId} onOpenChange={(isOpen) => !isOpen && setCurrentSubmittingGigId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Report #{currentReportNumber} for Gig: {activeGigs.find(g => g.id === currentSubmittingGigId)?.title}</DialogTitle>
            <DialogDescription>Provide details about your progress.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea placeholder="Describe your progress, challenges, and next steps..." value={reportText} onChange={(e) => setReportText(e.target.value)} rows={5} disabled={isSubmittingReport} />
            <div>
                <p className="text-xs text-muted-foreground mt-1">File attachments are currently disabled.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCurrentSubmittingGigId(null)} disabled={isSubmittingReport}>Cancel</Button>
            <Button onClick={handleSubmitReport} disabled={isSubmittingReport || !reportText.trim()}>
              {isSubmittingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentRequestDialog} onOpenChange={setShowPaymentRequestDialog}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Confirm Payment Request</DialogTitle>
                <DialogDescription>
                    You are about to request payment for the gig: "{paymentRequestGig?.title}".
                    You have used {paymentRequestGig?.paymentRequestsCount || 0} of 5 available requests for this gig.
                    The client will be notified.
                </DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="ghost" onClick={() => setShowPaymentRequestDialog(false)} disabled={isRequestingPayment}>Cancel</Button>
                <Button onClick={handleRequestPayment} disabled={isRequestingPayment}>
                    {isRequestingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Confirm Request
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

