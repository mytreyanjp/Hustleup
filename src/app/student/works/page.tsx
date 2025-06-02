
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, MessageSquare, Layers, CalendarDays, DollarSign, Briefcase, UploadCloud, FileText, Paperclip, Edit, Send, X as XIcon, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
  status: 'in-progress';
  progressReports?: ProgressReport[];
}

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
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [reportUploadProgress, setReportUploadProgress] = useState<number | null>(null);
  const reportFileInputRef = useRef<HTMLInputElement>(null);

  const fetchActiveGigs = useCallback(async () => {
    if (!user || !db) return;
    setIsLoading(true); setError(null);
    try {
      const gigsRef = collection(db, "gigs");
      const q = query( gigsRef, where("selectedStudentId", "==", user.uid), where("status", "==", "in-progress"), orderBy("createdAt", "desc") );
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
        
        // Ensure progressReports are initialized correctly
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
          progressReports: completeProgressReports,
        } as WorkGig;
      });
      const resolvedGigs = await Promise.all(fetchedGigsPromises);
      setActiveGigs(resolvedGigs);
      setCollapsedGigs(new Set(resolvedGigs.map(gig => gig.id)));
    } catch (err: any) { console.error("Error fetching active gigs:", err); setError("Failed to load your active works. This might be due to a missing Firestore index.");
    } finally { setIsLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!authLoading && (!user || role !== 'student')) {
      router.push('/auth/login?redirect=/student/works');
    } else if (user && role === 'student') {
      fetchActiveGigs();
    }
  }, [user, authLoading, role, router, fetchActiveGigs]);


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
    setReportFile(null);
    setReportUploadProgress(null);
    if(reportFileInputRef.current) reportFileInputRef.current.value = "";
  };

  const handleReportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({ title: "File Too Large", description: "Please select a file smaller than 10MB.", variant: "destructive" });
        if (reportFileInputRef.current) reportFileInputRef.current.value = "";
        return;
      }
      setReportFile(file);
    } else {
      setReportFile(null);
    }
  };

  const handleSubmitReport = async () => {
    if (!currentSubmittingGigId || !currentReportNumber || !user || !db || !storage) {
      toast({ title: "Error", description: "Cannot submit report. Missing context or Firebase not ready.", variant: "destructive" });
      return;
    }
    if (!reportText.trim()) {
      toast({ title: "Description Required", description: "Please provide a description for your report.", variant: "destructive" });
      return;
    }
    setIsSubmittingReport(true);
    setReportUploadProgress(reportFile ? 0 : null);

    let fileUrl: string | undefined = undefined;
    let fileName: string | undefined = undefined;

    if (reportFile) {
      try {
        const filePath = `gig_reports/${currentSubmittingGigId}/${user.uid}/report_${currentReportNumber}/${Date.now()}_${reportFile.name}`;
        const fileRef = storageRefFn(storage, filePath);
        const uploadTask = uploadBytesResumable(fileRef, reportFile);

        fileName = reportFile.name;

        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              setReportUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            },
            (error: any) => {
              console.error("Firebase Storage Upload Error (Report File):", error);
              let detailedErrorMessage = `Could not upload file. Code: ${error.code || 'UNKNOWN'}. Message: ${error.message || 'No message'}.`;
              let toastTitle = "Upload Failed";
              let duration = 15000;

              switch (error.code) {
                case 'storage/unauthorized':
                  detailedErrorMessage = "Upload failed: Permission denied. CRITICAL: Check Firebase Storage rules for 'gig_reports/...'. Also, check login. If on Spark plan and cannot access Rules tab, you may need to upgrade to Blaze plan.";
                  break;
                case 'storage/canceled': detailedErrorMessage = "Upload canceled."; break;
                // Add other specific cases as needed, mirroring other upload handlers
                default:
                  if (error.message && (error.message.toLowerCase().includes('network request failed') || error.message.toLowerCase().includes('net::err_failed')) || error.code === 'storage/unknown' || !error.code) {
                    toastTitle = "Network Error During Upload";
                    detailedErrorMessage = `Upload failed (network issue). Check internet, browser Network tab, CORS for Storage bucket. Ensure Storage is enabled and rules are set. Error: ${error.message || 'Unknown network error'}`;
                    duration = 20000;
                  } else {
                    detailedErrorMessage = `An unknown error occurred (Code: ${error.code || 'N/A'}). Check network, Storage rules, project plan. Server response: ${error.serverResponse || 'N/A'}`;
                  }
                  break;
              }
              toast({
                id: `report-upload-failed-${currentReportNumber}-${error.code || 'unknown'}`,
                title: toastTitle,
                description: detailedErrorMessage,
                variant: "destructive",
                duration: duration
              });
              reject(error);
            },
            async () => {
              fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve();
            }
          );
        });
      } catch (uploadError) {
        setIsSubmittingReport(false);
        setReportUploadProgress(null);
        return; 
      }
    }

    try {
      const gigDocRef = doc(db, 'gigs', currentSubmittingGigId);
      const gigSnap = await getDoc(gigDocRef);
      if (!gigSnap.exists()) throw new Error("Gig not found");

      const currentGigData = gigSnap.data() as WorkGig; // Use WorkGig here
      let progressReports: ProgressReport[] = currentGigData.progressReports || [];
      
      const reportIndex = progressReports.findIndex(r => r.reportNumber === currentReportNumber);
      const studentSubmission: StudentSubmission = {
        text: reportText.trim(),
        submittedAt: Timestamp.now(),
        ...(fileUrl && { fileUrl }),
        ...(fileName && { fileName }),
      };

      if (reportIndex > -1) {
        progressReports[reportIndex] = {
          ...progressReports[reportIndex], // Preserve deadline and other fields
          studentSubmission,
          clientStatus: 'pending_review',
          clientFeedback: null, 
          reviewedAt: null,   
        };
      } else {
        // This case should ideally not happen if reports are pre-initialized
        progressReports.push({
          reportNumber: currentReportNumber as number,
          deadline: null, // If not pre-initialized, deadline might be missing
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
      fetchActiveGigs(); 
    } catch (err: any) {
      console.error("Error submitting report:", err);
      toast({ title: "Submission Error", description: `Could not submit report: ${err.message}`, variant: "destructive" });
    } finally {
      setIsSubmittingReport(false);
      setReportUploadProgress(null);
    }
  };

  const formatDeadlineDate = (timestamp: Timestamp | undefined | null): string => {
    if (!timestamp) return 'N/A';
    try { return format(timestamp.toDate(), "MMM d, yyyy"); } catch (e) { return 'Invalid Date'; }
  };
  
  const formatSpecificDate = (timestamp: Timestamp | undefined | null): string => {
     if (!timestamp) return 'Not set';
     try { return format(timestamp.toDate(), "PPp"); } // e.g. Jan 1st, 2023, 2:30 PM
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

  if (isLoading || authLoading) return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (error) return <div className="text-center py-10 text-destructive"><p>{error}</p></div>;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Your Works</h1>
        <Button variant="outline" asChild size="sm" className="sm:text-sm"><Link href="/gigs/browse">Find More Gigs</Link></Button>
      </div>

      {activeGigs.length === 0 ? (
        <Card className="glass-card text-center py-10">
          <CardHeader className="p-4 sm:p-6"> <Briefcase className="mx-auto h-12 w-12 text-muted-foreground mb-4" /> <CardTitle>No Active Works</CardTitle> </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0"> <p className="text-muted-foreground mb-4">You don't have any gigs currently in progress.</p> <p className="text-sm text-muted-foreground">Once a client accepts your application, the gig will appear here.</p> </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeGigs.map((gig) => {
            const isCollapsed = collapsedGigs.has(gig.id);

            return (
            <Card key={gig.id} className="glass-card">
              <CardHeader className="flex flex-row justify-between items-start p-4 sm:p-6">
                <div className="flex-grow">
                  <Link href={`/gigs/${gig.id}`} className="hover:underline">
                      <CardTitle className="text-lg sm:text-xl">{gig.title}</CardTitle>
                  </Link>
                  <CardDescription className="text-xs sm:text-sm"> Client: <Link href={`/profile/${gig.clientId}`} className="text-primary hover:underline">{gig.clientCompanyName || gig.clientUsername}</Link></CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize text-xs">{gig.status}</Badge>
                    <Button variant="ghost" size="icon" onClick={() => toggleGigCollapse(gig.id)} className="h-8 w-8">
                        {isCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                        <span className="sr-only">{isCollapsed ? 'Expand' : 'Collapse'}</span>
                    </Button>
                </div>
              </CardHeader>
              <div
                className={cn(
                  "transition-all duration-500 ease-in-out overflow-hidden",
                  isCollapsed ? "max-h-0 opacity-0" : "max-h-[1000px] opacity-100" 
                )}
              >
                <CardContent className="space-y-3 pt-3 p-4 sm:p-6">
                  <div className="flex items-center text-xs sm:text-sm"> <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" /> <span className="text-muted-foreground mr-1">Budget:</span> <span className="font-medium">{gig.currency} {gig.budget.toFixed(2)}</span> </div>
                  <div className="flex items-center text-xs sm:text-sm"> <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" /> <span className="text-muted-foreground mr-1">Gig Deadline:</span> <span className="font-medium">{formatDeadlineDate(gig.deadline)}</span> </div>
                  
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
                                  {report.studentSubmission.fileUrl && (
                                    <Button variant="link" size="xs" asChild className="p-0 h-auto">
                                      <a href={report.studentSubmission.fileUrl} target="_blank" rel="noopener noreferrer"><Paperclip className="mr-1 h-3 w-3" />View Attachment ({report.studentSubmission.fileName || 'file'})</a>
                                    </Button>
                                  )}
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
                                  <Button size="xs" variant="outline" className="mt-2" onClick={() => handleOpenSubmitReportDialog(gig.id, report.reportNumber)}>
                                      <Edit className="mr-1 h-3 w-3" /> {isRejected ? 'Resubmit Report' : 'Submit Report'} #{report.reportNumber}
                                  </Button>
                              )}
                               {!canSubmitThisReport && !report.studentSubmission && report.reportNumber > (gig.progressReports?.filter(r => r.studentSubmission).length || 0) && (
                                  <p className="text-xs text-muted-foreground italic mt-1">Previous report needs approval before submitting this one.</p>
                              )}
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row justify-between items-stretch gap-2 border-t p-4 pt-4 sm:p-6 sm:pt-4">
                  <Button size="sm" asChild><Link href={`/chat?userId=${gig.clientId}&gigId=${gig.id}`}><MessageSquare className="mr-1 h-4 w-4" />Chat with Client</Link></Button>
                  <Button variant="outline" size="sm" asChild><Link href={`/gigs/${gig.id}`}>View Gig Details</Link></Button>
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
            <DialogDescription>Provide details about your progress. You can optionally attach a file.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea placeholder="Describe your progress, challenges, and next steps..." value={reportText} onChange={(e) => setReportText(e.target.value)} rows={5} disabled={isSubmittingReport} />
            <div>
                <label htmlFor="reportFile" className="text-sm font-medium">Attach File (Optional, max 10MB)</label>
                <Input id="reportFile" type="file" ref={reportFileInputRef} onChange={handleReportFileChange} className="mt-1" disabled={isSubmittingReport} />
                {reportFile && <p className="text-xs text-muted-foreground mt-1">Selected: {reportFile.name}</p>}
            </div>
            {reportUploadProgress !== null && (
                <div className="mt-2 space-y-1">
                    <Progress value={reportUploadProgress} className="w-full h-2" />
                    <p className="text-xs text-muted-foreground text-center">Uploading: {reportUploadProgress.toFixed(0)}%</p>
                </div>
            )}
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

    </div>
  );
}

    
