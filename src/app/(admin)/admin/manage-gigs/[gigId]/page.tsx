
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, Timestamp, updateDoc, deleteDoc, collection, addDoc, serverTimestamp, query, where, getDocs, arrayRemove } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowLeft, UserCircle, Briefcase, DollarSign, CalendarDays, FileText, MessageSquare, Users, Layers, Star, Trash2, ShieldAlert, Edit, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';


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

interface ApplicantInfo {
  studentId: string;
  studentUsername: string;
  appliedAt: Timestamp;
  message?: string;
  status?: 'pending' | 'accepted' | 'rejected';
}

interface GigTransaction {
    id: string;
    clientId: string;
    clientUsername: string;
    studentId: string;
    studentUsername: string;
    gigId: string;
    gigTitle: string;
    amount: number;
    currency: string;
    status: 'succeeded' | 'failed' | 'pending';
    razorpayPaymentId: string;
    paidAt: Timestamp;
}

interface Gig {
  id: string;
  title: string;
  description: string;
  budget: number;
  currency: string;
  deadline: Timestamp;
  requiredSkills: string[];
  clientId: string;
  clientUsername?: string;
  clientDisplayName?: string;
  clientAvatarUrl?: string;
  createdAt: Timestamp;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  applicants?: ApplicantInfo[];
  selectedStudentId?: string | null;
  numberOfReports?: number;
  progressReports?: ProgressReport[];
}


export default function AdminGigDetailPage() {
  const params = useParams();
  const gigId = params.gigId as string;
  const router = useRouter();
  const { user: adminUser, userProfile: adminProfile, role: adminRole, loading: adminLoading } = useFirebase();
  const { toast } = useToast();

  const [gig, setGig] = useState<Gig | null>(null);
  const [clientProfile, setClientProfile] = useState<UserProfile | null>(null);
  const [selectedStudentProfile, setSelectedStudentProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showDeleteGigDialog, setShowDeleteGigDialog] = useState(false);
  const [isDeletingGig, setIsDeletingGig] = useState(false);

  const [showDeleteApplicantDialog, setShowDeleteApplicantDialog] = useState(false);
  const [applicantToDelete, setApplicantToDelete] = useState<ApplicantInfo | null>(null);
  const [isDeletingApplicant, setIsDeletingApplicant] = useState(false);

  const [showWarnUserDialog, setShowWarnUserDialog] = useState(false);
  const [userToWarn, setUserToWarn] = useState<{ id: string; name: string; role: 'client' | 'student' } | null>(null);
  const [warningReason, setWarningReason] = useState('');
  const [isSubmittingWarning, setIsSubmittingWarning] = useState(false);

  const [showDeleteReportDialog, setShowDeleteReportDialog] = useState(false);
  const [reportToDeleteNumber, setReportToDeleteNumber] = useState<number | null>(null);
  const [isDeletingReport, setIsDeletingReport] = useState(false);

  const [gigTransactions, setGigTransactions] = useState<GigTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);

  const fetchGigAndRelatedData = useCallback(async () => {
    if (!gigId || !db) return;
    setIsLoading(true);
    setError(null);

    try {
      const gigDocRef = doc(db, 'gigs', gigId);
      const gigSnap = await getDoc(gigDocRef);

      if (!gigSnap.exists()) {
        setError("Gig not found.");
        toast({ title: "Error", description: "Gig not found.", variant: "destructive" });
        setIsLoading(false);
        return;
      }
      const fetchedGig = { id: gigSnap.id, ...gigSnap.data() } as Gig;
      if (!fetchedGig.currency) fetchedGig.currency = "INR";
      setGig(fetchedGig);

      const clientDocRef = doc(db, 'users', fetchedGig.clientId);
      const clientSnap = await getDoc(clientDocRef);
      if (clientSnap.exists()) {
        setClientProfile({ uid: clientSnap.id, ...clientSnap.data() } as UserProfile);
      } else {
        console.warn(`Client profile not found for clientId: ${fetchedGig.clientId}`);
        toast({ title: "Warning", description: `Client profile for ID ${fetchedGig.clientId} not found.`, variant: "default" });
      }

      if (fetchedGig.selectedStudentId) {
        const studentDocRef = doc(db, 'users', fetchedGig.selectedStudentId);
        const studentSnap = await getDoc(studentDocRef);
        if (studentSnap.exists()) {
          setSelectedStudentProfile({ uid: studentSnap.id, ...studentSnap.data() } as UserProfile);
        } else {
           console.warn(`Selected student profile not found for studentId: ${fetchedGig.selectedStudentId}`);
           toast({ title: "Warning", description: `Student profile for ID ${fetchedGig.selectedStudentId} not found.`, variant: "default" });
        }
      }
      // Fetch transactions related to this gig
      setIsLoadingTransactions(true);
      const transQuery = query(collection(db, 'transactions'), where('gigId', '==', gigId));
      const transSnap = await getDocs(transQuery);
      setGigTransactions(transSnap.docs.map(d => ({id: d.id, ...d.data()}) as GigTransaction));
      setIsLoadingTransactions(false);

    } catch (err: any) {
      console.error("Error fetching gig details for admin:", err);
      setError("Failed to load gig details. Please try again.");
      toast({ title: "Loading Error", description: err.message || "Could not load gig details.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [gigId, toast]);

  useEffect(() => {
    if (!adminLoading && adminRole === 'admin') {
      fetchGigAndRelatedData();
    } else if (!adminLoading && adminRole !== 'admin') {
      router.push('/');
    }
  }, [adminLoading, adminRole, fetchGigAndRelatedData, router]);

  const handleDeleteGig = async () => {
    if (!gigId || !db) return;
    setIsDeletingGig(true);
    try {
      await deleteDoc(doc(db, 'gigs', gigId));
      toast({ title: "Gig Deleted", description: "The gig has been successfully deleted." });
      router.push('/admin/manage-gigs');
    } catch (error: any) {
      console.error("Error deleting gig:", error);
      toast({ title: "Error", description: "Could not delete gig.", variant: "destructive" });
      setIsDeletingGig(false);
    }
  };

  const confirmDeleteApplicant = async () => {
    if (!gig || !applicantToDelete || !db) return;
    setIsDeletingApplicant(true);
    try {
      const updatedApplicants = gig.applicants?.filter(app => app.studentId !== applicantToDelete.studentId) || [];
      await updateDoc(doc(db, 'gigs', gig.id), { applicants: updatedApplicants });
      setGig(prev => prev ? { ...prev, applicants: updatedApplicants } : null);
      toast({ title: "Applicant Removed", description: `${applicantToDelete.studentUsername} has been removed from applicants.` });
      setShowDeleteApplicantDialog(false);
      setApplicantToDelete(null);
    } catch (error: any) {
      console.error("Error deleting applicant:", error);
      toast({ title: "Error", description: "Could not remove applicant.", variant: "destructive" });
    } finally {
      setIsDeletingApplicant(false);
    }
  };

  const handleOpenWarnDialog = (userId: string, name: string, role: 'client' | 'student') => {
    setUserToWarn({ id: userId, name, role });
    setWarningReason('');
    setShowWarnUserDialog(true);
  };

  const submitWarning = async () => {
    if (!userToWarn || !warningReason.trim() || !adminUser || !db) return;
    setIsSubmittingWarning(true);
    try {
      await addDoc(collection(db, 'user_warnings'), {
        warnedUserId: userToWarn.id,
        warnedUserName: userToWarn.name,
        warnedUserRole: userToWarn.role,
        adminId: adminUser.uid,
        adminUsername: adminProfile?.username || 'Admin',
        reason: warningReason.trim(),
        gigId: gig?.id || null,
        gigTitle: gig?.title || null,
        timestamp: serverTimestamp(),
      });
      toast({ title: "Warning Logged", description: `A warning has been logged for ${userToWarn.name}.` });
      setShowWarnUserDialog(false);
      setUserToWarn(null);
    } catch (error: any) {
      console.error("Error submitting warning:", error);
      toast({ title: "Error", description: "Could not log warning.", variant: "destructive" });
    } finally {
      setIsSubmittingWarning(false);
    }
  };

  const confirmDeleteReport = async () => {
    if (!gig || reportToDeleteNumber === null || !db) return;
    setIsDeletingReport(true);
    try {
      const updatedProgressReports = gig.progressReports?.filter(report => report.reportNumber !== reportToDeleteNumber) || [];
      await updateDoc(doc(db, 'gigs', gig.id), { progressReports: updatedProgressReports });
      setGig(prev => prev ? { ...prev, progressReports: updatedProgressReports } : null);
      toast({ title: "Progress Report Deleted", description: `Report #${reportToDeleteNumber} has been removed. Client and Student would be notified.` });
      setShowDeleteReportDialog(false);
      setReportToDeleteNumber(null);
    } catch (error: any) {
      console.error("Error deleting progress report:", error);
      toast({ title: "Error", description: "Could not delete progress report.", variant: "destructive" });
    } finally {
      setIsDeletingReport(false);
    }
  };

  const formatDate = (timestamp: Timestamp | undefined | null, specific: boolean = false): string => {
    if (!timestamp) return 'N/A';
    try {
      return specific ? format(timestamp.toDate(), "PPp") : formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
    } catch (e) { return 'Invalid date'; }
  };

  const getInitials = (name?: string | null, fallbackEmail?: string | null) => {
    if (name && name.trim() !== '') return name.substring(0, 2).toUpperCase();
    if (fallbackEmail) return fallbackEmail.substring(0, 2).toUpperCase();
    return '??';
  };

  const getStatusBadgeVariant = (status: Gig['status'] | ApplicantInfo['status'] | ProgressReport['clientStatus'] | GigTransaction['status']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'open': case 'accepted': case 'approved': case 'succeeded': return 'default';
           case 'in-progress': case 'pending': case 'pending_review': return 'secondary';
           case 'completed': return 'outline';
           case 'closed': case 'rejected': case 'failed': return 'destructive';
           default: return 'secondary';
       }
   };

  if (isLoading || adminLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <div className="text-center py-10 p-4 sm:p-0">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={() => router.push('/admin/manage-gigs')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Manage Gigs
        </Button>
      </div>
    );
  }

  if (!gig) {
    return <div className="text-center py-10 text-muted-foreground p-4 sm:p-0">Gig details could not be loaded.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6 p-4 sm:p-0">
      <Button variant="outline" size="sm" onClick={() => router.push('/admin/manage-gigs')} className="w-full sm:w-auto">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to All Gigs
      </Button>

      <Card className="glass-card">
        <CardHeader className="border-b">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
            <CardTitle className="text-xl sm:text-2xl md:text-3xl">{gig.title}</CardTitle>
            <AlertDialog open={showDeleteGigDialog} onOpenChange={setShowDeleteGigDialog}>
                <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="w-full sm:w-auto">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Gig
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to delete this gig?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the gig "{gig.title}" and all its associated data.
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeletingGig}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteGig} disabled={isDeletingGig} className="bg-destructive hover:bg-destructive/90">
                        {isDeletingGig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Yes, Delete Gig
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
          </div>
          <CardDescription className="text-xs sm:text-sm">
            Created: {formatDate(gig.createdAt)} &bull; Deadline: {formatDate(gig.deadline, true)}
          </CardDescription>
          <div className="flex items-center gap-2 pt-2">
            <span className="text-sm font-medium">Status:</span>
            <Badge variant={getStatusBadgeVariant(gig.status)} className="capitalize text-xs">{gig.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h3 className="font-semibold text-md sm:text-lg mb-1">Description</h3>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{gig.description}</p>
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-sm mb-1">Budget</h4>
              <p className="text-sm text-muted-foreground flex items-center"><DollarSign className="mr-1.5 h-4 w-4" /> {gig.currency} {gig.budget.toFixed(2)}</p>
            </div>
            <div>
              <h4 className="font-medium text-sm mb-1">Required Skills</h4>
              <div className="flex flex-wrap gap-1">
                {gig.requiredSkills?.map((skill, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">{skill}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {clientProfile && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><UserCircle className="h-5 w-5" /> Client Information</div>
                <div className="flex gap-2">
                    <Button variant="outline" size="xs" onClick={() => handleOpenWarnDialog(clientProfile.uid, clientProfile.username || 'Client', 'client')}><ShieldAlert className="mr-1 h-3 w-3"/> Warn</Button>
                    {/* Chat button removed as per instructions */}
                </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={clientProfile.profilePictureUrl} alt={clientProfile.username || clientProfile.email || 'Client'}/>
                <AvatarFallback>{getInitials(clientProfile.username, clientProfile.email)}</AvatarFallback>
              </Avatar>
              <div>
                 <p><strong>Username:</strong> <Link href={`/profile/${clientProfile.uid}`} className="text-primary hover:underline" target="_blank">{clientProfile.username || 'N/A'}</Link></p>
                 <p><strong>Email:</strong> {clientProfile.email}</p>
              </div>
            </div>
            {clientProfile.companyName && <p><strong>Company:</strong> {clientProfile.companyName}</p>}
            {clientProfile.website && <p><strong>Website:</strong> <a href={clientProfile.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{clientProfile.website}</a></p>}
          </CardContent>
        </Card>
      )}

      {gig.selectedStudentId && selectedStudentProfile && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Briefcase className="h-5 w-5" /> Selected Student</div>
                 <div className="flex gap-2">
                    <Button variant="outline" size="xs" onClick={() => handleOpenWarnDialog(selectedStudentProfile.uid, selectedStudentProfile.username || 'Student', 'student')}><ShieldAlert className="mr-1 h-3 w-3"/> Warn</Button>
                    {/* Chat button removed as per instructions */}
                </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
             <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={selectedStudentProfile.profilePictureUrl} alt={selectedStudentProfile.username || selectedStudentProfile.email || 'Student'}/>
                <AvatarFallback>{getInitials(selectedStudentProfile.username, selectedStudentProfile.email)}</AvatarFallback>
              </Avatar>
              <div>
                <p><strong>Username:</strong> <Link href={`/profile/${selectedStudentProfile.uid}`} className="text-primary hover:underline" target="_blank">{selectedStudentProfile.username || 'N/A'}</Link></p>
                <p><strong>Email:</strong> {selectedStudentProfile.email}</p>
              </div>
            </div>
            {selectedStudentProfile.skills && selectedStudentProfile.skills.length > 0 && (
              <div><strong>Skills:</strong> {selectedStudentProfile.skills.join(', ')}</div>
            )}
          </CardContent>
        </Card>
      )}

      {gig.applicants && gig.applicants.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl flex items-center gap-2"><Users className="h-5 w-5" /> Applicants ({gig.applicants.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[120px] text-xs sm:text-sm">Student</TableHead>
                  <TableHead className="min-w-[150px] text-xs sm:text-sm">Applied At</TableHead>
                  <TableHead className="min-w-[150px] text-xs sm:text-sm">Message</TableHead>
                  <TableHead className="min-w-[100px] text-xs sm:text-sm">Status</TableHead>
                  <TableHead className="text-right min-w-[180px] text-xs sm:text-sm">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gig.applicants.map(applicant => (
                  <TableRow key={applicant.studentId}>
                    <TableCell className="text-xs sm:text-sm">{applicant.studentUsername}</TableCell>
                    <TableCell className="text-xs sm:text-sm">{formatDate(applicant.appliedAt)}</TableCell>
                    <TableCell className="max-w-[150px] sm:max-w-xs truncate text-xs sm:text-sm">{applicant.message || 'N/A'}</TableCell>
                    <TableCell><Badge variant={getStatusBadgeVariant(applicant.status || 'pending')} className="capitalize text-xs">{applicant.status || 'pending'}</Badge></TableCell>
                    <TableCell className="text-right">
                       <div className="flex flex-col sm:flex-row gap-1.5 justify-end items-center">
                         <Button variant="outline" size="xs" asChild className="text-xs">
                           <Link href={`/profile/${applicant.studentId}`} target="_blank">View Profile</Link>
                         </Button>
                         {/* Chat button removed */}
                         <Button variant="destructive" size="xs" className="text-xs" onClick={() => {setApplicantToDelete(applicant); setShowDeleteApplicantDialog(true);}} disabled={isDeletingApplicant && applicantToDelete?.studentId === applicant.studentId}>
                           {isDeletingApplicant && applicantToDelete?.studentId === applicant.studentId ? <Loader2 className="h-3 w-3 animate-spin"/> : <Trash2 className="h-3 w-3"/>}
                         </Button>
                       </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {gig.numberOfReports !== undefined && gig.numberOfReports > 0 && gig.progressReports && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl flex items-center gap-2"><Layers className="h-5 w-5" /> Progress Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {gig.progressReports.length === 0 && <p className="text-sm text-muted-foreground">No progress reports submitted or defined structure missing.</p>}
            {gig.progressReports.sort((a,b) => a.reportNumber - b.reportNumber).map(report => (
              <Card key={report.reportNumber} className="bg-muted/30 p-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-1 gap-1">
                  <h5 className="font-medium text-sm">Report #{report.reportNumber}</h5>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusBadgeVariant(report.clientStatus)} size="sm" className="capitalize text-xs">
                      {report.clientStatus ? report.clientStatus.replace('_', ' ') : 'Awaiting Submission'}
                    </Badge>
                    <Button variant="destructive" size="xs" onClick={() => {setReportToDeleteNumber(report.reportNumber); setShowDeleteReportDialog(true);}} disabled={isDeletingReport && reportToDeleteNumber === report.reportNumber}>
                        {isDeletingReport && reportToDeleteNumber === report.reportNumber ? <Loader2 className="h-3 w-3 animate-spin"/> : <Trash2 className="h-3 w-3"/>}
                    </Button>
                  </div>
                </div>
                {report.deadline && <p className="text-xs text-muted-foreground mb-1"><CalendarDays className="inline h-3 w-3 mr-0.5" />Report Deadline: {formatDate(report.deadline, true)}</p>}
                {report.studentSubmission ? (
                  <div className="text-xs space-y-1">
                    <p><strong>Submission:</strong> {report.studentSubmission.text}</p>
                    {report.studentSubmission.fileUrl && (
                        <Button variant="link" size="xs" asChild className="p-0 h-auto text-xs">
                            <a href={report.studentSubmission.fileUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="mr-1 h-3 w-3 sm:h-4 sm:w-4" /> View Attachment ({report.studentSubmission.fileName || 'file'})
                            </a>
                        </Button>
                    )}
                    <p className="text-muted-foreground">Submitted: {formatDate(report.studentSubmission.submittedAt, true)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Not submitted yet.</p>
                )}
                {report.clientStatus && report.clientStatus !== 'pending_review' && report.clientFeedback && (
                  <div className="mt-1 pt-1 border-t border-dashed text-xs">
                     <p><strong>Client Feedback:</strong> {report.clientFeedback}</p>
                     <p className="text-muted-foreground">Reviewed: {report.reviewedAt ? formatDate(report.reviewedAt, true) : 'N/A'}</p>
                  </div>
                )}
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

       <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl flex items-center gap-2"><CreditCard className="h-5 w-5" /> Transaction History</CardTitle>
            <CardDescription>Payments related to this gig.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isLoadingTransactions ? (
              <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : gigTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No transactions found for this gig yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment ID</TableHead>
                    <TableHead>Paid To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gigTransactions.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{formatDate(tx.paidAt, true)}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{tx.currency} {tx.amount.toFixed(2)}</TableCell>
                      <TableCell><Badge variant={getStatusBadgeVariant(tx.status)} className="capitalize text-xs">{tx.status}</Badge></TableCell>
                      <TableCell className="text-xs sm:text-sm truncate max-w-[100px]">{tx.razorpayPaymentId}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{tx.studentUsername}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dialog for Deleting Applicant */}
        <AlertDialog open={showDeleteApplicantDialog} onOpenChange={setShowDeleteApplicantDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will remove {applicantToDelete?.studentUsername || 'the applicant'}'s application from this gig. This action cannot be undone.
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingApplicant}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteApplicant} disabled={isDeletingApplicant} className="bg-destructive hover:bg-destructive/90">
                    {isDeletingApplicant ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Yes, Remove Applicant
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {/* Dialog for Warning User */}
        <Dialog open={showWarnUserDialog} onOpenChange={setShowWarnUserDialog}>
            <DialogContent>
                <DialogHeader>
                <DialogTitle>Log Warning for {userToWarn?.name || 'User'}</DialogTitle>
                <DialogDescription>
                    Please provide a reason for this warning. This will be logged for administrative review.
                </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Label htmlFor="warningReason" className="sr-only">Warning Reason</Label>
                    <Textarea
                        id="warningReason"
                        placeholder="Enter reason for warning..."
                        value={warningReason}
                        onChange={(e) => setWarningReason(e.target.value)}
                        rows={4}
                    />
                </div>
                <DialogFooter>
                <Button variant="outline" onClick={() => setShowWarnUserDialog(false)} disabled={isSubmittingWarning}>Cancel</Button>
                <Button onClick={submitWarning} disabled={isSubmittingWarning || !warningReason.trim()}>
                    {isSubmittingWarning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit Warning
                </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Dialog for Deleting Progress Report */}
        <AlertDialog open={showDeleteReportDialog} onOpenChange={setShowDeleteReportDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                <AlertDialogTitle>Delete Progress Report #{reportToDeleteNumber}?</AlertDialogTitle>
                <AlertDialogDescription>
                    This action will permanently remove this progress report. The client and student will be notified of this deletion (simulated).
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingReport}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteReport} disabled={isDeletingReport} className="bg-destructive hover:bg-destructive/90">
                    {isDeletingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Yes, Delete Report
                </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

    </div>
  );
}
