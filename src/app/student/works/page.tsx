
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs, orderBy, Timestamp, doc, updateDoc, getDoc, serverTimestamp, onSnapshot, DocumentData, addDoc, increment } from 'firebase/firestore'; // Added increment
import { db, storage } from '@/config/firebase';
import { ref as storageRefFn, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, MessageSquare, Layers, CalendarDays, DollarSign, Briefcase, UploadCloud, FileText, Paperclip, Edit, Send, X as XIcon, ChevronDown, ChevronUp, Search as SearchIcon, Hourglass, Link as LinkIcon, IndianRupee, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow, isBefore, addHours, differenceInHours } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from '@/lib/utils';
import type { NotificationType } from '@/types/notifications'; 
import { Progress } from '@/components/ui/progress';

const COMMISSION_RATE = 0.02; // 2%

interface Attachment {
  url: string;
  name: string;
  type?: string;
  size?: number;
}

interface StudentSubmission {
  text: string;
  attachments?: Attachment[];
  submittedAt: Timestamp;
}

export interface ProgressReport {
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
  description: string;
  requiredSkills: string[];
  clientId: string;
  clientUsername?: string;
  clientCompanyName?: string;
  deadline: Timestamp;
  updatedAt: Timestamp; // Used to estimate time in 'awaiting_payout'
  budget: number; // Gross budget
  currency: string;
  numberOfReports?: number;
  status: 'in-progress' | 'awaiting_payout' | 'completed';
  progressReports?: ProgressReport[];
  effectiveStatus?: 'action-required' | 'pending-review' | 'in-progress' | 'awaiting-payout' | 'completed';
  nextUpcomingDeadline?: Timestamp | null;
  sharedDriveLink?: string; 
  // Payment request fields
  paymentRequestsCount?: number;
  lastPaymentRequestedAt?: Timestamp | null;
  studentPaymentRequestPending?: boolean;
  paymentRequestAvailableAt?: Timestamp | null; // Client-side calculated
}

type EffectiveStatusType = 'action-required' | 'pending-review' | 'in-progress' | 'awaiting-payout' | 'completed';

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

const getEffectiveGigStatus = (gig: WorkGig): EffectiveStatusType => {
    if (gig.status === 'awaiting_payout') return 'awaiting-payout';
    if (gig.status === 'completed') return 'completed';

    if (!gig.progressReports || gig.progressReports.length === 0 || (gig.numberOfReports === 0)) {
        return 'in-progress'; // No reports means it's just plain in-progress until payment requested
    }
    const hasRejected = gig.progressReports.some(r => r.clientStatus === 'rejected');
    if (hasRejected) return 'action-required';

    const hasPendingReview = gig.progressReports.some(r => r.studentSubmission && r.clientStatus === 'pending_review');
    if (hasPendingReview) return 'pending-review';
    
    const hasSubmittedButNotReviewed = gig.progressReports.some(r => r.studentSubmission && !r.clientStatus);
    if (hasSubmittedButNotReviewed) return 'pending-review';


    const allReportsApproved = gig.progressReports.every(r => r.clientStatus === 'approved');
    if (allReportsApproved && gig.progressReports.length === (gig.numberOfReports || 0)) {
        // All reports are approved, so it's in-progress (awaiting payment request or final deadline)
        return 'in-progress'; 
    }
    
    // If not all reports are submitted or approved yet, and none are rejected/pending review, it's in-progress
    return 'in-progress';
};

const getNextUpcomingDeadline = (gig: WorkGig): Timestamp | null => {
    if (gig.status === 'awaiting_payout' || gig.status === 'completed') return null;

    let nextDeadline: Timestamp | null = gig.deadline;
    const now = Timestamp.now();

    if (gig.progressReports && gig.progressReports.length > 0) {
        const futureReportDeadlines = gig.progressReports
            .filter(r => r.deadline && r.deadline.toMillis() >= now.toMillis() && r.clientStatus !== 'approved' && r.clientStatus !== 'rejected')
            .sort((a, b) => (a.deadline?.toMillis() || Infinity) - (b.deadline?.toMillis() || Infinity));

        if (futureReportDeadlines.length > 0 && futureReportDeadlines[0].deadline) {
            if (!nextDeadline || futureReportDeadlines[0].deadline.toMillis() < nextDeadline.toMillis()) {
                nextDeadline = futureReportDeadlines[0].deadline;
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Array<{ name: string; progress: number }>>([]);
  const [isSubmittingUnsubmit, setIsSubmittingUnsubmit] = useState<number | null>(null);


  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<EffectiveStatusType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'deadlineAsc' | 'deadlineDesc'>('default');

  const [showPaymentRequestDialog, setShowPaymentRequestDialog] = useState(false);
  const [paymentRequestGig, setPaymentRequestGig] = useState<WorkGig | null>(null);
  const [isRequestingPayment, setIsRequestingPayment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const PAYMENT_DELAY_THRESHOLD_HOURS = 72; // 3 days

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'student') {
        router.push('/auth/login?redirect=/student/works');
        return;
      }
      if (user && db) {
        setIsLoading(true);
        setError(null);

        const gigsRef = collection(db, "gigs");
        const q = query(
          gigsRef,
          where("selectedStudentId", "==", user.uid),
          where("status", "in", ["in-progress", "awaiting_payout", "completed"]),
          orderBy("createdAt", "desc") // Or orderBy("updatedAt", "desc") if more relevant for "awaiting_payout"
        );

        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
          const fetchedGigsPromises = querySnapshot.docs.map(async (gigDoc) => {
            const gigData = gigDoc.data() as DocumentData;
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
            
            let paymentRequestAvailableAtCalc: Timestamp | null = null;
            if (gigData.lastPaymentRequestedAt && gigData.lastPaymentRequestedAt.toDate) {
                const lastRequestDate = gigData.lastPaymentRequestedAt.toDate();
                paymentRequestAvailableAtCalc = Timestamp.fromDate(addHours(lastRequestDate, 2));
            }


            return {
              id: gigDoc.id, title: gigData.title || "Untitled Gig", 
              description: gigData.description || "", 
              requiredSkills: gigData.requiredSkills || [], 
              clientId: gigData.clientId, clientUsername, clientCompanyName,
              deadline: gigData.deadline, 
              updatedAt: gigData.updatedAt, // Ensure updatedAt is fetched
              budget: gigData.budget || 0, currency: gigData.currency || "INR",
              numberOfReports: numReports, status: gigData.status,
              progressReports: completeProgressReports,
              sharedDriveLink: gigData.sharedDriveLink || "", 
              paymentRequestsCount: gigData.paymentRequestsCount || 0,
              lastPaymentRequestedAt: gigData.lastPaymentRequestedAt || null,
              studentPaymentRequestPending: gigData.studentPaymentRequestPending || false,
              paymentRequestAvailableAt: paymentRequestAvailableAtCalc,
            } as WorkGig;
          });

          try {
            const resolvedGigs = await Promise.all(fetchedGigsPromises);
            const gigsWithEffectiveStatus = resolvedGigs.map(gig => ({
              ...gig,
              effectiveStatus: getEffectiveGigStatus(gig),
              nextUpcomingDeadline: getNextUpcomingDeadline(gig)
            }));
            setActiveGigs(gigsWithEffectiveStatus);
             setCollapsedGigs(prevCollapsed => {
                const newCollapsed = new Set<string>();
                gigsWithEffectiveStatus.forEach(gig => {
                    if ((gig.effectiveStatus === 'in-progress' || gig.effectiveStatus === 'awaiting-payout' || gig.effectiveStatus === 'completed') && !prevCollapsed.has(gig.id)) {
                        newCollapsed.add(gig.id);
                    } else if (prevCollapsed.has(gig.id) && gig.effectiveStatus !== 'action-required' && gig.effectiveStatus !== 'pending-review') {
                         newCollapsed.add(gig.id);
                    }
                });
                return newCollapsed;
            });
          } catch (resolveError) {
             console.error("Error resolving gig details:", resolveError);
             setError("Failed to process some gig details.");
          } finally {
            setIsLoading(false);
          }
        }, (err: any) => {
          console.error("Error fetching active gigs with onSnapshot:", err);
          setError("Failed to load your active works. This might be due to a missing Firestore index.");
          setIsLoading(false);
        });

        return () => unsubscribe();
      } else {
         setIsLoading(false);
      }
    }
  }, [user, authLoading, role, router]);


  const processedGigs = useMemo(() => {
    if (!activeGigs) return [];
    let gigsToProcess = [...activeGigs];

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
        'awaiting-payout': 4,
        'completed': 5,
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
      // Default sort by updatedAt if status and explicit sort are same
      return (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0);
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
        const newFilesArray = Array.from(files);
        const validNewFiles = newFilesArray.filter(file => {
            if (file.size > 5 * 1024 * 1024) { 
                toast({
                    title: "File Too Large (Max 5MB)",
                    description: `"${file.name}" exceeds 5MB. For larger files, please upload to a service like Google Drive and paste the shareable link in your report description.`,
                    variant: "destructive",
                    duration: 7000,
                });
                return false;
            }
            return true;
        });
        setSelectedFiles(prevFiles => [...prevFiles, ...validNewFiles]);
    }
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const removeSelectedFile = (fileNameToRemove: string) => {
    setSelectedFiles(prevFiles => prevFiles.filter(file => file.name !== fileNameToRemove));
  };

  const handleOpenSubmitReportDialog = (gigId: string, reportNumber: number) => {
    setCurrentSubmittingGigId(gigId);
    setCurrentReportNumber(reportNumber);
    const gig = activeGigs.find(g => g.id === gigId);
    const report = gig?.progressReports?.find(r => r.reportNumber === reportNumber);
    setReportText(report?.studentSubmission?.text || "");
    setSelectedFiles(report?.studentSubmission?.attachments ? [] : []);
    setUploadProgress([]); 
    if (fileInputRef.current) { 
      fileInputRef.current.value = ""; 
    }
  };


  const handleSubmitReport = async () => {
    if (!currentSubmittingGigId || !currentReportNumber || !user || !userProfile || !db) {
      toast({ title: "Error", description: "Cannot submit report. Missing context or Firebase not ready.", variant: "destructive" });
      return;
    }
    if (!reportText.trim() && selectedFiles.length === 0) {
      toast({ title: "Cannot Submit Empty Report", description: "Please provide a description or attach at least one file.", variant: "destructive" });
      return;
    }
    setIsSubmittingReport(true);
    setUploadProgress([]);

    const uploadedAttachments: Attachment[] = [];

    try {
      if (selectedFiles.length > 0 && storage) {
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          setUploadProgress(prev => [...prev, { name: file.name, progress: 0 }]);
          
          const uniqueFileName = `${Date.now()}_${file.name}`;
          const reportStorageRef = storageRefFn(storage, `gig_reports/${currentSubmittingGigId}/${currentReportNumber}/${user.uid}/attachments/${uniqueFileName}`);
          const uploadTask = uploadBytesResumable(reportStorageRef, file);

          await new Promise<void>((resolve, reject) => {
            uploadTask.on(
              'state_changed',
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(prev => prev.map(up => up.name === file.name ? { ...up, progress } : up));
              },
              (error) => {
                console.error('Upload error for file:', file.name, error);
                let detailedErrorMessage = `File upload failed for ${file.name}. Error: ${error.message}`;
                 if (error.code === 'storage/unauthorized') {
                   detailedErrorMessage = `Upload failed for ${file.name}: You do not have permission to upload to this location. This is likely a Firebase Storage security rule issue. Please ensure students are allowed to write to their report paths.`;
                 } else if (error.code === 'storage/object-not-found') {
                   detailedErrorMessage = `Upload failed for ${file.name}: The target storage location was not found. This is an unexpected backend issue.`;
                 } else if (error.code === 'storage/canceled') {
                   detailedErrorMessage = `File upload was canceled for ${file.name}.`;
                 }
                toast({
                    id: `upload-error-${file.name}-${Date.now()}`,
                    title: "File Upload Error",
                    description: detailedErrorMessage,
                    variant: "destructive",
                    duration: 10000
                });
                reject(error);
              },
              async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                uploadedAttachments.push({
                  url: downloadURL,
                  name: file.name,
                  type: file.type,
                  size: file.size,
                });
                resolve();
              }
            );
          });
        }
      }

      const gigDocRef = doc(db, 'gigs', currentSubmittingGigId);
      const gigSnap = await getDoc(gigDocRef);
      if (!gigSnap.exists()) throw new Error("Gig not found");

      const currentGigData = gigSnap.data() as WorkGig;
      let progressReports: ProgressReport[] = currentGigData.progressReports || [];

      const reportIndex = progressReports.findIndex(r => r.reportNumber === currentReportNumber);
      
      let finalAttachments: Attachment[] = uploadedAttachments;
      if (reportIndex > -1 && progressReports[reportIndex]?.studentSubmission?.attachments && uploadedAttachments.length === 0) {
          finalAttachments = progressReports[reportIndex].studentSubmission!.attachments!;
      }
      
      const studentSubmission: StudentSubmission = {
        text: reportText.trim(),
        submittedAt: Timestamp.now(),
        attachments: finalAttachments.length > 0 ? finalAttachments : [],
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
          reportNumber: currentReportNumber as number,
          deadline: null, 
          studentSubmission,
          clientStatus: 'pending_review',
          clientFeedback: null,
          reviewedAt: null,
        });
      }
      progressReports.sort((a, b) => a.reportNumber - b.reportNumber);

      await updateDoc(gigDocRef, { progressReports });

      toast({ title: `Report #${currentReportNumber} Submitted`, description: "The client has been notified." });

      await createNotification(
        currentGigData.clientId,
        `"${userProfile.username || 'The student'}" has submitted Report #${currentReportNumber} for your gig "${currentGigData.title}".`,
        'report_submitted',
        currentSubmittingGigId,
        currentGigData.title,
        `/client/gigs/${currentSubmittingGigId}/manage`,
        user.uid,
        userProfile.username || 'The student'
      );

      setCurrentSubmittingGigId(null);
      setCurrentReportNumber(null);
      setSelectedFiles([]);
      setUploadProgress([]);
      setReportText("");
    } catch (err: any) {
      if (!(err && err.code && (err.code.startsWith('storage/')))) {
          console.error("Error submitting report:", err);
          toast({ 
            title: "Submission Error", 
            description: `Could not submit report: ${err.message}`,
            variant: "destructive",
            duration: 7000, 
          });
      }
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleUnsubmitReport = async (gigId: string, reportNumberToUnsubmit: number) => {
    if (!user || !db) {
        toast({ title: "Error", description: "Cannot unsubmit report. User or DB not available.", variant: "destructive" });
        return;
    }
    setIsSubmittingUnsubmit(reportNumberToUnsubmit);
    try {
        const gigDocRef = doc(db, 'gigs', gigId);
        const gigSnap = await getDoc(gigDocRef);
        if (!gigSnap.exists()) throw new Error("Gig not found to unsubmit report from.");

        const currentGigData = gigSnap.data() as WorkGig;
        let progressReports: ProgressReport[] = currentGigData.progressReports || [];
        const reportIndex = progressReports.findIndex(r => r.reportNumber === reportNumberToUnsubmit);

        if (reportIndex === -1 || !progressReports[reportIndex].studentSubmission) {
            throw new Error("Report not found or not submitted.");
        }
        
        const attachmentsToDelete = progressReports[reportIndex].studentSubmission?.attachments;
        if (attachmentsToDelete && attachmentsToDelete.length > 0 && storage) {
            for (const attachment of attachmentsToDelete) {
                try {
                    const urlPath = new URL(attachment.url).pathname;
                    const filePathEncoded = urlPath.split('/o/')[1].split('?')[0];
                    const filePath = decodeURIComponent(filePathEncoded);
                    const fileRefToDelete = storageRefFn(storage, filePath); 
                    await deleteObject(fileRefToDelete);
                    console.log("Report attachment deleted from storage:", attachment.name);
                } catch (storageError: any) {
                    if (storageError.code === 'storage/object-not-found') {
                        console.warn("File to delete not found in storage:", attachment.name);
                    } else {
                        console.warn("Could not delete report attachment from storage during unsubmit:", storageError);
                    }
                }
            }
        }

        progressReports[reportIndex] = {
          ...progressReports[reportIndex],
          studentSubmission: null, 
          clientStatus: null,
          clientFeedback: null,
          reviewedAt: null,
        };

        await updateDoc(gigDocRef, { progressReports });
        toast({ title: "Report Unsubmitted", description: `Report #${reportNumberToUnsubmit} has been unsubmitted.` });
        
        setActiveGigs(prevGigs => 
            prevGigs.map(g => 
                g.id === gigId 
                ? { ...g, progressReports: progressReports.map(pr => ({...pr})) } 
                : g
            )
        );
    } catch (error: any) {
        console.error("Error unsubmitting report:", error);
        toast({ title: "Unsubmit Failed", description: `Could not unsubmit report: ${error.message}`, variant: "destructive" });
    } finally {
        setIsSubmittingUnsubmit(null);
    }
  };

  const handleRequestPayment = async () => {
    if (!paymentRequestGig || !user || !userProfile || !db) {
        toast({title: "Error", description: "Cannot request payment. Missing gig info or user session.", variant: "destructive"});
        return;
    }
    setIsRequestingPayment(true);
    try {
        const gigDocRef = doc(db, 'gigs', paymentRequestGig.id);
        await updateDoc(gigDocRef, {
            paymentRequestsCount: increment(1),
            lastPaymentRequestedAt: serverTimestamp(),
            studentPaymentRequestPending: true,
        });

        await createNotification(
            paymentRequestGig.clientId,
            `"${userProfile.username || 'The student'}" has requested payment for the gig "${paymentRequestGig.title}".`,
            'payment_requested_by_student',
            paymentRequestGig.id,
            paymentRequestGig.title,
            `/client/gigs/${paymentRequestGig.id}/manage`,
            user.uid,
            userProfile.username || 'The student'
        );

        toast({ title: "Payment Requested!", description: "The client has been notified of your payment request."});
        setShowPaymentRequestDialog(false);
        setPaymentRequestGig(null);
        
        const updatedGigs = activeGigs.map(gig =>
            gig.id === paymentRequestGig.id
                ? { ...gig, 
                    paymentRequestsCount: (gig.paymentRequestsCount || 0) + 1, 
                    lastPaymentRequestedAt: Timestamp.now(),
                    studentPaymentRequestPending: true,
                    paymentRequestAvailableAt: Timestamp.fromDate(addHours(new Date(), 2))
                  }
                : gig
        );
        setActiveGigs(updatedGigs);

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
      case 'awaiting-payout': return 'secondary';
      case 'completed': return 'default';
      case 'in-progress':
      default: return 'outline';
    }
  };

  const getEffectiveStatusLabel = (status?: EffectiveStatusType): string => {
     switch (status) {
      case 'action-required': return 'Action Required';
      case 'pending-review': return 'Pending Client Review';
      case 'awaiting-payout': return 'Awaiting Payout';
      case 'completed': return 'Completed';
      case 'in-progress':
      default: return 'In Progress';
    }
  }


  if (isLoading || authLoading) return (
    <div className="flex justify-center items-center min-h-screen">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );
  if (error) return (
      <div
        className="relative min-h-[calc(100vh-4rem)] w-screen ml-[calc(50%-50vw)] mt-[-2rem] mb-[-2rem] bg-cover bg-center bg-no-repeat bg-fixed flex items-center justify-center"
        style={{ backgroundImage: "url('https://picsum.photos/1980/1080')" }}
        data-ai-hint="modern office"
      >
        <div className="absolute inset-0 bg-background/80 backdrop-blur-lg"></div>
        <div className="text-center py-10 text-destructive relative z-10 p-4 bg-background/80 rounded-lg shadow-xl">
            <p className="text-xl font-semibold">{error}</p>
        </div>
      </div>
  );


  return (
    <div
      className="relative min-h-[calc(100vh-4rem)] w-screen ml-[calc(50%-50vw)] mt-[-2rem] mb-[-2rem] bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: "url('https://picsum.photos/1980/1080')" }}
      data-ai-hint="modern office"
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm"></div>
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center text-center sm:text-left mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground pt-8 sm:pt-0">Your Works</h1>
          <Button variant="outline" asChild size="sm" className="mt-4 sm:mt-0 sm:text-sm"><Link href="/gigs/browse">Find More Gigs</Link></Button>
        </div>

        <Card className="glass-card p-3 sm:p-4 mb-6">
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
                  <SelectItem value="awaiting-payout">Awaiting Payout</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
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
          <Card className="glass-card text-center py-10 max-w-lg mx-auto">
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
          <div className="space-y-6 pb-8">
            {processedGigs.map((gig) => {
              const isCollapsed = collapsedGigs.has(gig.id);
              const effectiveStatusLabel = getEffectiveStatusLabel(gig.effectiveStatus);
              const effectiveStatusVariant = getEffectiveStatusBadgeVariant(gig.effectiveStatus);
              const allReportsApproved = gig.numberOfReports && gig.numberOfReports > 0 ? (gig.progressReports?.filter(r => r.clientStatus === 'approved').length === gig.numberOfReports) : true;
              const requestsUsed = gig.paymentRequestsCount || 0;

              const now = new Date();
              const isCoolDownActive = gig.paymentRequestAvailableAt ? now < gig.paymentRequestAvailableAt.toDate() : false;
              const coolDownTimeRemaining = gig.paymentRequestAvailableAt ? formatDistanceToNow(gig.paymentRequestAvailableAt.toDate(), { addSuffix: true, includeSeconds: true }) : "";

              const canRequestPayment = gig.status === 'in-progress' && allReportsApproved && requestsUsed < 5 && !gig.studentPaymentRequestPending && !isCoolDownActive;
              const paymentButtonTitle =
                gig.status === 'awaiting_payout' ? "Payment being processed by admin" :
                gig.status === 'completed' ? "Gig completed and paid" :
                !allReportsApproved ? "All reports must be approved first" :
                requestsUsed >= 5 ? "Maximum 5 payment requests reached" :
                gig.studentPaymentRequestPending ? "A payment request is already pending with the client" :
                isCoolDownActive ? `Next payment request available ${coolDownTimeRemaining}` :
                "Request payment from client";
              
              const netPayment = gig.budget * (1 - COMMISSION_RATE);
              const isAwaitingPayoutForLong = gig.status === 'awaiting_payout' && gig.updatedAt && differenceInHours(new Date(), gig.updatedAt.toDate()) > PAYMENT_DELAY_THRESHOLD_HOURS;


              return (
              <Card key={gig.id} className="glass-card">
                <CardHeader
                  className="flex flex-col sm:flex-row justify-between items-start p-4 sm:p-6 gap-2 cursor-pointer hover:bg-accent/20 transition-colors"
                  onClick={() => toggleGigCollapse(gig.id)}
                >
                  <div className="flex-grow">
                      <CardTitle className="text-lg sm:text-xl">{gig.title}</CardTitle>
                    <CardDescription className="text-xs sm:text-sm"> Client: <Link href={`/profile/${gig.clientId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{gig.clientCompanyName || gig.clientUsername}</Link></CardDescription>
                    <div className="mt-1">
                       <Badge variant={effectiveStatusVariant} size="sm" className="capitalize text-xs">{effectiveStatusLabel}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-center">
                      {isAwaitingPayoutForLong && (
                         <Button 
                            variant="outline" 
                            size="xs" 
                            className="h-8 text-xs"
                            onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/support?context=payment_delay&gigId=${gig.id}&gigTitle=${encodeURIComponent(gig.title)}`);
                            }}
                          >
                            <HelpCircle className="mr-1.5 h-3.5 w-3.5" /> Ask HustleUp
                          </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
                          {isCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                      </Button>
                  </div>
                </CardHeader>
                <div
                  className={cn(
                    "transition-all duration-300 ease-in-out overflow-hidden",
                    isCollapsed ? "max-h-0 opacity-0" : "max-h-[2500px] opacity-100"
                  )}
                >
                  <CardContent className="space-y-3 pt-3 p-4 sm:p-6">
                    <p className="text-sm text-muted-foreground line-clamp-none">{gig.description}</p>
                     {gig.requiredSkills && gig.requiredSkills.length > 0 && (
                        <div className="pt-1">
                            <h4 className="text-xs font-semibold text-muted-foreground mb-1">Skills Needed:</h4>
                            <div className="flex flex-wrap gap-1">
                                {gig.requiredSkills.map((skill, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">{skill}</Badge>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex items-center text-xs sm:text-sm"> <IndianRupee className="mr-2 h-4 w-4 text-muted-foreground" /> <span className="text-muted-foreground mr-1">Your Payout:</span> <span className="font-medium">₹{netPayment.toFixed(2)}</span> </div>
                    <div className="flex items-center text-xs sm:text-sm"> <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" /> <span className="text-muted-foreground mr-1">Gig Deadline:</span> <span className="font-medium">{formatDeadlineDate(gig.deadline)}</span> </div>
                    {gig.nextUpcomingDeadline && gig.nextUpcomingDeadline.toMillis() !== gig.deadline.toMillis() && (
                         <div className="flex items-center text-xs sm:text-sm text-amber-600 dark:text-amber-400"> <CalendarDays className="mr-2 h-4 w-4" /> <span className="font-semibold mr-1">Next Report Due:</span> <span className="font-medium">{formatDeadlineDate(gig.nextUpcomingDeadline)}</span> </div>
                    )}
                    {gig.sharedDriveLink && (
                        <div className="pt-2 border-t">
                            <h4 className="font-semibold mt-1 mb-1 text-sm flex items-center gap-1"><LinkIcon className="h-4 w-4 text-muted-foreground" /> Client Shared Link:</h4>
                            <a href={gig.sharedDriveLink} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all block">
                                {gig.sharedDriveLink}
                            </a>
                        </div>
                    )}

                    {gig.numberOfReports !== undefined && gig.numberOfReports > 0 && (
                      <div className="pt-2 border-t">
                        <h4 className="font-semibold mt-2 mb-2 text-sm sm:text-md">Progress Reports ({gig.progressReports?.filter(r => r.studentSubmission).length || 0} / {gig.numberOfReports})</h4>
                        <div className="space-y-3">
                          {gig.progressReports?.map(report => {
                            const previousReport = gig.progressReports?.find(r => r.reportNumber === report.reportNumber - 1);
                            const canSubmitThisReport = report.reportNumber === 1 || (previousReport?.clientStatus === 'approved');
                            
                            const reportSubmitted = !!report.studentSubmission;
                            const isPendingClientReview = reportSubmitted && (report.clientStatus === 'pending_review' || !report.clientStatus);
                            const isRejectedByClient = reportSubmitted && report.clientStatus === 'rejected';
                            
                            let reportButton;
                            if (isPendingClientReview) {
                                reportButton = (
                                    <Button size="xs" variant="destructive" className="mt-2 text-xs h-7 px-2" onClick={() => handleUnsubmitReport(gig.id, report.reportNumber)} disabled={isSubmittingUnsubmit === report.reportNumber || userProfile?.isBanned}>
                                        {isSubmittingUnsubmit === report.reportNumber ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <XIcon className="mr-1 h-3 w-3" />} Unsubmit
                                    </Button>
                                );
                            } else if ((!reportSubmitted && canSubmitThisReport) || (isRejectedByClient && canSubmitThisReport)) {
                                reportButton = (
                                    <Button size="xs" variant="outline" className="mt-2 text-xs h-7 px-2" onClick={() => handleOpenSubmitReportDialog(gig.id, report.reportNumber)} disabled={userProfile?.isBanned}>
                                        <Edit className="mr-1 h-3 w-3" /> {isRejectedByClient ? `Resubmit Report #${report.reportNumber}` : `Submit Report #${report.reportNumber}`}
                                    </Button>
                                );
                            }
                            
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
                                    {report.studentSubmission.attachments && report.studentSubmission.attachments.length > 0 && (
                                      <div className="space-y-0.5 mt-1">
                                        {report.studentSubmission.attachments.map((att, idx) => (
                                          <Button key={idx} variant="link" size="xs" asChild className="p-0 h-auto text-xs block">
                                            <a href={att.url} target="_blank" rel="noopener noreferrer">
                                              <FileText className="mr-1 h-3 w-3" /> View Attachment: {att.name}
                                            </a>
                                          </Button>
                                        ))}
                                      </div>
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
                                {reportButton}
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
                  <CardFooter className="flex flex-col sm:flex-row items-center gap-2 border-t p-4 pt-4 sm:p-6 sm:pt-4">
                       {gig.status !== 'completed' && (
                        <Button
                            size="sm"
                            variant={canRequestPayment ? "default" : "outline"}
                            onClick={() => { if(canRequestPayment) {setPaymentRequestGig(gig); setShowPaymentRequestDialog(true);}}}
                            disabled={!canRequestPayment || userProfile?.isBanned}
                            title={paymentButtonTitle}
                            className="w-full sm:w-auto"
                        >
                            {gig.status === 'awaiting_payout' ? <Hourglass className="mr-2 h-4 w-4" /> : <DollarSign className="mr-2 h-4 w-4" />}
                            {gig.status === 'awaiting_payout' ? 'Payment Processing' :
                             (gig.status === 'completed' ? 'Payment Complete' : `Request Payment (${requestsUsed}/5)`)}
                        </Button>
                       )}
                        <Button variant="outline" size="sm" asChild className="w-full sm:w-auto flex-grow justify-center">
                            <Link href={`/gigs/${gig.id}`}>
                                <Briefcase className="mr-2 h-4 w-4" /> View Gig Details
                            </Link>
                        </Button>
                  </CardFooter>
                </div>
              </Card>
            )})}
          </div>
        )}

        <Dialog 
          open={!!currentSubmittingGigId && !!currentReportNumber} 
          onOpenChange={(isOpen) => { 
            if (!isOpen) { 
              setCurrentSubmittingGigId(null); 
              setCurrentReportNumber(null); 
              setReportText(""); 
              setSelectedFiles([]); 
              setUploadProgress([]); 
              if(fileInputRef.current) fileInputRef.current.value = "";
            }
          }}
          key={`${currentSubmittingGigId}-${currentReportNumber}`}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Report #{currentReportNumber} for Gig: {activeGigs.find(g => g.id === currentSubmittingGigId)?.title}</DialogTitle>
              <DialogDescription>Provide details about your progress. Max file size 5MB per file. For larger files, please upload to a service like Google Drive and paste the shareable link in your report description.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Textarea placeholder="Describe your progress, challenges, and next steps..." value={reportText} onChange={(e) => setReportText(e.target.value)} rows={5} disabled={isSubmittingReport} />
              <div>
                  <label htmlFor="reportFile" className="text-sm font-medium text-muted-foreground block mb-1">Attach File(s) (Optional)</label>
                  <Input
                    id="reportFile"
                    type="file"
                    multiple
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="text-sm file:mr-2 file:py-1.5 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    disabled={isSubmittingReport || uploadProgress.some(up => up.progress < 100 && up.progress > 0)}
                  />
                   {selectedFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Selected files:</p>
                        {selectedFiles.map((file, index) => (
                        <div key={index} className="text-xs flex items-center justify-between bg-muted p-1.5 rounded">
                            <span className="truncate max-w-[200px] sm:max-w-xs" title={file.name}>{file.name}</span>
                            <Button variant="ghost" size="icon" onClick={() => removeSelectedFile(file.name)} disabled={isSubmittingReport || uploadProgress.some(up => up.progress < 100 && up.progress > 0)} className="h-5 w-5 shrink-0">
                            <XIcon className="h-3 w-3" />
                            </Button>
                        </div>
                        ))}
                    </div>
                  )}
                  {uploadProgress.length > 0 && uploadProgress.some(up => up.progress < 100) && (
                    <div className="mt-2 space-y-1">
                        {uploadProgress.filter(up => up.progress < 100).map((upFile, idx) => (
                            <div key={idx}>
                                <p className="text-xs text-muted-foreground truncate">Uploading: {upFile.name}</p>
                                <Progress value={upFile.progress} className="w-full h-1.5" />
                                <p className="text-xs text-muted-foreground text-right">{Math.round(upFile.progress)}%</p>
                            </div>
                        ))}
                    </div>
                  )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {setCurrentSubmittingGigId(null); setCurrentReportNumber(null); setReportText(""); setSelectedFiles([]); setUploadProgress([]); if(fileInputRef.current) fileInputRef.current.value = "";}} disabled={isSubmittingReport}>Cancel</Button>
              <Button onClick={handleSubmitReport} disabled={isSubmittingReport || (!reportText.trim() && selectedFiles.length === 0)}>
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
    </div>
  );
}

