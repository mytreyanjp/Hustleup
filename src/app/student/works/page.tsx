
"use client";

import { useState, useEffect, useRef } from 'react';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, MessageSquare, Layers, CalendarDays, DollarSign, Briefcase, UploadCloud, FileText, Paperclip, Edit, Send, X as XIcon } from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import type { ProgressReport, StudentSubmission } from '@/app/client/gigs/[gigId]/manage/page'; // Import from client page

interface WorkGig {
  id: string;
  title: string;
  clientId: string;
  clientUsername?: string;
  clientCompanyName?: string;
  deadline: Timestamp;
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

  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [currentSubmittingGigId, setCurrentSubmittingGigId] = useState<string | null>(null);
  const [currentReportNumber, setCurrentReportNumber] = useState<number | null>(null);
  const [reportText, setReportText] = useState("");
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [reportUploadProgress, setReportUploadProgress] = useState<number | null>(null);
  const reportFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && (!user || role !== 'student')) {
      router.push('/auth/login?redirect=/student/works');
    } else if (user && role === 'student') {
      fetchActiveGigs();
    }
  }, [user, authLoading, role, router]);

  const fetchActiveGigs = async () => {
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
        return {
          id: gigDoc.id, title: gigData.title || "Untitled Gig", clientId: gigData.clientId, clientUsername, clientCompanyName,
          deadline: gigData.deadline, budget: gigData.budget || 0, currency: gigData.currency || "INR",
          numberOfReports: gigData.numberOfReports || 0, status: gigData.status,
          progressReports: gigData.progressReports || [],
        } as WorkGig;
      });
      const resolvedGigs = await Promise.all(fetchedGigsPromises);
      setActiveGigs(resolvedGigs);
    } catch (err: any) { console.error("Error fetching active gigs:", err); setError("Failed to load your active works. This might be due to a missing Firestore index.");
    } finally { setIsLoading(false); }
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
      toast({ title: "Error", description: "Cannot submit report. Missing context.", variant: "destructive" });
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
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setReportUploadProgress(progress);
            },
            (error) => {
              console.error("Report file upload error:", error);
              toast({ title: "Upload Failed", description: `Could not upload file: ${error.message}`, variant: "destructive" });
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
        return; // Exit if file upload fails
      }
    }

    try {
      const gigDocRef = doc(db, 'gigs', currentSubmittingGigId);
      const gigSnap = await getDoc(gigDocRef);
      if (!gigSnap.exists()) throw new Error("Gig not found");

      const currentGigData = gigSnap.data();
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
          ...progressReports[reportIndex],
          studentSubmission,
          clientStatus: 'pending_review',
          clientFeedback: undefined, // Clear previous feedback on resubmission
          reviewedAt: undefined,
        };
      } else {
        progressReports.push({
          reportNumber: currentReportNumber,
          studentSubmission,
          clientStatus: 'pending_review',
        });
      }
      // Sort by reportNumber to maintain order, though pushing should keep it if always adding new
      progressReports.sort((a, b) => a.reportNumber - b.reportNumber);

      await updateDoc(gigDocRef, { progressReports });

      toast({ title: `Report #${currentReportNumber} Submitted`, description: "The client has been notified." });
      setCurrentSubmittingGigId(null); // Close dialog
      fetchActiveGigs(); // Refresh gig list
    } catch (err: any) {
      console.error("Error submitting report:", err);
      toast({ title: "Submission Error", description: `Could not submit report: ${err.message}`, variant: "destructive" });
    } finally {
      setIsSubmittingReport(false);
      setReportUploadProgress(null);
    }
  };

  const formatDeadlineDate = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'N/A';
    try { return format(timestamp.toDate(), "MMM d, yyyy"); } catch (e) { return 'Invalid Date'; }
  };

  const getReportStatusBadgeVariant = (status?: ProgressReport['clientStatus']): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'approved': return 'default';
      case 'rejected': return 'destructive';
      case 'pending_review': return 'secondary';
      default: return 'outline'; // For "Not Submitted Yet"
    }
  };

  if (isLoading || authLoading) return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (error) return <div className="text-center py-10 text-destructive"><p>{error}</p></div>;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Your Works</h1>
        <Button variant="outline" asChild> <Link href="/gigs/browse">Find More Gigs</Link> </Button>
      </div>

      {activeGigs.length === 0 ? (
        <Card className="glass-card text-center py-10">
          <CardHeader> <Briefcase className="mx-auto h-12 w-12 text-muted-foreground mb-4" /> <CardTitle>No Active Works</CardTitle> </CardHeader>
          <CardContent> <p className="text-muted-foreground mb-4">You don't have any gigs currently in progress.</p> <p className="text-sm text-muted-foreground">Once a client accepts your application, the gig will appear here.</p> </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeGigs.map((gig) => {
            let lastApprovedReportNum = 0;
            gig.progressReports?.forEach(r => {
                if (r.clientStatus === 'approved' && r.reportNumber > lastApprovedReportNum) {
                    lastApprovedReportNum = r.reportNumber;
                }
            });

            return (
            <Card key={gig.id} className="glass-card">
              <CardHeader>
                <div className="flex justify-between items-start gap-2"> <Link href={`/gigs/${gig.id}`} className="hover:underline"> <CardTitle className="text-xl">{gig.title}</CardTitle> </Link> <Badge variant="secondary" className="capitalize">{gig.status}</Badge> </div>
                <CardDescription> Client: <Link href={`/profile/${gig.clientId}`} className="text-primary hover:underline">{gig.clientCompanyName || gig.clientUsername}</Link> </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center text-sm"> <DollarSign className="mr-2 h-4 w-4 text-muted-foreground" /> <span className="text-muted-foreground mr-1">Budget:</span> <span className="font-medium">{gig.currency} {gig.budget.toFixed(2)}</span> </div>
                <div className="flex items-center text-sm"> <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" /> <span className="text-muted-foreground mr-1">Deadline:</span> <span className="font-medium">{formatDeadlineDate(gig.deadline)}</span> </div>
                
                {gig.numberOfReports !== undefined && gig.numberOfReports > 0 && (
                  <div className="pt-2 border-t">
                    <h4 className="font-semibold mt-2 mb-2 text-md">Progress Reports ({gig.progressReports?.filter(r => r.studentSubmission).length || 0} / {gig.numberOfReports})</h4>
                    <div className="space-y-3">
                      {Array.from({ length: gig.numberOfReports }, (_, i) => i + 1).map(reportNum => {
                        const report = gig.progressReports?.find(r => r.reportNumber === reportNum);
                        const canSubmitThisReport = reportNum === 1 || (reportNum === lastApprovedReportNum + 1);
                        const isRejected = report?.clientStatus === 'rejected';

                        return (
                          <Card key={reportNum} className="bg-background/50 p-3">
                            <div className="flex justify-between items-center mb-1">
                              <h5 className="font-medium text-sm">Report #{reportNum}</h5>
                              <Badge variant={getReportStatusBadgeVariant(report?.clientStatus)} size="sm" className="capitalize text-xs">
                                {report?.clientStatus ? report.clientStatus.replace('_', ' ') : 'Not Submitted'}
                              </Badge>
                            </div>
                            {report?.studentSubmission && (
                              <div className="text-xs space-y-1">
                                <p className="line-clamp-2"><strong>Your submission:</strong> {report.studentSubmission.text}</p>
                                {report.studentSubmission.fileUrl && (
                                  <Button variant="link" size="xs" asChild className="p-0 h-auto">
                                    <a href={report.studentSubmission.fileUrl} target="_blank" rel="noopener noreferrer"> <Paperclip className="mr-1 h-3 w-3" /> View Attachment ({report.studentSubmission.fileName || 'file'}) </a>
                                  </Button>
                                )}
                                <p className="text-muted-foreground">Submitted: {format(report.studentSubmission.submittedAt.toDate(), "PPp")}</p>
                              </div>
                            )}
                            {report?.clientStatus && report.clientStatus !== 'pending_review' && report.clientFeedback && (
                              <div className="mt-1 pt-1 border-t border-dashed text-xs">
                                <p><span className="font-medium">Client Feedback:</span> {report.clientFeedback}</p>
                                <p className="text-muted-foreground">Reviewed: {report.reviewedAt ? format(report.reviewedAt.toDate(), "PPp") : 'N/A'}</p>
                              </div>
                            )}
                            {(!report?.studentSubmission || isRejected) && canSubmitThisReport && (
                                <Button size="xs" variant="outline" className="mt-2" onClick={() => handleOpenSubmitReportDialog(gig.id, reportNum)}>
                                    <Edit className="mr-1 h-3 w-3" /> {isRejected ? 'Resubmit Report' : 'Submit Report'} #{reportNum}
                                </Button>
                            )}
                            {!canSubmitThisReport && !report?.studentSubmission && (
                                <p className="text-xs text-muted-foreground italic mt-1">Previous report needs approval before submitting this one.</p>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row justify-between items-stretch gap-2 border-t pt-4">
                <Button size="sm" asChild> <Link href={`/chat?userId=${gig.clientId}&gigId=${gig.id}`}> <MessageSquare className="mr-1 h-4 w-4" /> Chat with Client </Link> </Button>
                <Button variant="outline" size="sm" asChild> <Link href={`/gigs/${gig.id}`}> View Gig Details </Link> </Button>
              </CardFooter>
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

    