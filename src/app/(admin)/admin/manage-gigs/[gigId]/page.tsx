
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase, type UserProfile } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ArrowLeft, UserCircle, Briefcase, DollarSign, CalendarDays, FileText, MessageSquare, Edit3, Layers, Star, Info } from 'lucide-react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

// Interfaces (can be moved to a shared types file if used elsewhere)
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

interface Gig {
  id: string;
  title: string;
  description: string;
  budget: number;
  currency: string;
  deadline: Timestamp;
  requiredSkills: string[];
  clientId: string;
  clientUsername?: string; // Legacy or fallback
  clientDisplayName?: string;
  clientAvatarUrl?: string;
  createdAt: Timestamp;
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  applicants?: ApplicantInfo[];
  selectedStudentId?: string | null;
  numberOfReports?: number;
  progressReports?: ProgressReport[];
  // Other fields as necessary
}


export default function AdminGigDetailPage() {
  const params = useParams();
  const gigId = params.gigId as string;
  const router = useRouter();
  const { user: adminUser, role: adminRole, loading: adminLoading } = useFirebase();
  const { toast } = useToast();

  const [gig, setGig] = useState<Gig | null>(null);
  const [clientProfile, setClientProfile] = useState<UserProfile | null>(null);
  const [selectedStudentProfile, setSelectedStudentProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGigAndRelatedData = useCallback(async () => {
    if (!gigId || !db) return;
    setIsLoading(true);
    setError(null);

    try {
      const gigDocRef = doc(db, 'gigs', gigId);
      const gigSnap = await getDoc(gigDocRef);

      if (!gigSnap.exists()) {
        setError("Gig not found.");
        setIsLoading(false);
        return;
      }
      const fetchedGig = { id: gigSnap.id, ...gigSnap.data() } as Gig;
      if (!fetchedGig.currency) fetchedGig.currency = "INR"; // Default currency
      setGig(fetchedGig);

      // Fetch client profile
      const clientDocRef = doc(db, 'users', fetchedGig.clientId);
      const clientSnap = await getDoc(clientDocRef);
      if (clientSnap.exists()) {
        setClientProfile({ uid: clientSnap.id, ...clientSnap.data() } as UserProfile);
      } else {
        console.warn(`Client profile not found for clientId: ${fetchedGig.clientId}`);
      }

      // Fetch selected student profile if exists
      if (fetchedGig.selectedStudentId) {
        const studentDocRef = doc(db, 'users', fetchedGig.selectedStudentId);
        const studentSnap = await getDoc(studentDocRef);
        if (studentSnap.exists()) {
          setSelectedStudentProfile({ uid: studentSnap.id, ...studentSnap.data() } as UserProfile);
        } else {
           console.warn(`Selected student profile not found for studentId: ${fetchedGig.selectedStudentId}`);
        }
      }

    } catch (err: any) {
      console.error("Error fetching gig details for admin:", err);
      setError("Failed to load gig details. Please try again.");
      toast({ title: "Loading Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [gigId, toast]);

  useEffect(() => {
    if (!adminLoading && adminRole === 'admin') {
      fetchGigAndRelatedData();
    } else if (!adminLoading && adminRole !== 'admin') {
      router.push('/'); // Redirect if not admin
    }
  }, [adminLoading, adminRole, fetchGigAndRelatedData, router]);

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

  const getStatusBadgeVariant = (status: Gig['status'] | ApplicantInfo['status'] | ProgressReport['clientStatus']): "default" | "secondary" | "destructive" | "outline" => {
       switch (status) {
           case 'open': case 'accepted': case 'approved': return 'default';
           case 'in-progress': case 'pending': case 'pending_review': return 'secondary';
           case 'completed': return 'outline';
           case 'closed': case 'rejected': return 'destructive';
           default: return 'secondary';
       }
   };


  if (isLoading || adminLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={() => router.push('/admin/manage-gigs')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Manage Gigs
        </Button>
      </div>
    );
  }

  if (!gig) {
    return <div className="text-center py-10 text-muted-foreground">Gig details could not be loaded.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <Button variant="outline" size="sm" onClick={() => router.push('/admin/manage-gigs')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to All Gigs
      </Button>

      <Card className="glass-card">
        <CardHeader className="border-b">
          <CardTitle className="text-2xl sm:text-3xl">{gig.title}</CardTitle>
          <CardDescription className="text-sm">
            Created: {formatDate(gig.createdAt)} &bull; Deadline: {formatDate(gig.deadline, true)}
          </CardDescription>
          <div className="flex items-center gap-2 pt-2">
            <span className="text-sm font-medium">Status:</span>
            <Badge variant={getStatusBadgeVariant(gig.status)} className="capitalize">{gig.status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h3 className="font-semibold text-lg mb-1">Description</h3>
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

      {/* Client Information */}
      {clientProfile && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2"><UserCircle className="h-5 w-5" /> Client Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={clientProfile.profilePictureUrl} alt={clientProfile.username || clientProfile.email || 'Client'}/>
                <AvatarFallback>{getInitials(clientProfile.username, clientProfile.email)}</AvatarFallback>
              </Avatar>
              <div>
                 <p><strong>Username:</strong> <Link href={`/profile/${clientProfile.uid}`} className="text-primary hover:underline">{clientProfile.username || 'N/A'}</Link></p>
                 <p><strong>Email:</strong> {clientProfile.email}</p>
              </div>
            </div>
            {clientProfile.companyName && <p><strong>Company:</strong> {clientProfile.companyName}</p>}
            {clientProfile.website && <p><strong>Website:</strong> <a href={clientProfile.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{clientProfile.website}</a></p>}
          </CardContent>
        </Card>
      )}

      {/* Selected Student Information */}
      {gig.selectedStudentId && selectedStudentProfile && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2"><Briefcase className="h-5 w-5" /> Selected Student</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
             <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={selectedStudentProfile.profilePictureUrl} alt={selectedStudentProfile.username || selectedStudentProfile.email || 'Student'}/>
                <AvatarFallback>{getInitials(selectedStudentProfile.username, selectedStudentProfile.email)}</AvatarFallback>
              </Avatar>
              <div>
                <p><strong>Username:</strong> <Link href={`/profile/${selectedStudentProfile.uid}`} className="text-primary hover:underline">{selectedStudentProfile.username || 'N/A'}</Link></p>
                <p><strong>Email:</strong> {selectedStudentProfile.email}</p>
              </div>
            </div>
            {selectedStudentProfile.skills && selectedStudentProfile.skills.length > 0 && (
              <div><strong>Skills:</strong> {selectedStudentProfile.skills.join(', ')}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Applicants List */}
      {gig.applicants && gig.applicants.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2"><Users className="h-5 w-5" /> Applicants ({gig.applicants.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Applied At</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gig.applicants.map(applicant => (
                  <TableRow key={applicant.studentId}>
                    <TableCell>{applicant.studentUsername}</TableCell>
                    <TableCell>{formatDate(applicant.appliedAt)}</TableCell>
                    <TableCell className="max-w-xs truncate">{applicant.message || 'N/A'}</TableCell>
                    <TableCell><Badge variant={getStatusBadgeVariant(applicant.status || 'pending')} className="capitalize">{applicant.status || 'pending'}</Badge></TableCell>
                    <TableCell>
                       <Button variant="outline" size="xs" asChild><Link href={`/profile/${applicant.studentId}`} target="_blank">View Profile</Link></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Progress Reports */}
      {gig.numberOfReports !== undefined && gig.numberOfReports > 0 && gig.progressReports && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2"><Layers className="h-5 w-5" /> Progress Reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {gig.progressReports.length === 0 && <p className="text-sm text-muted-foreground">No progress reports submitted or defined structure missing.</p>}
            {gig.progressReports.sort((a,b) => a.reportNumber - b.reportNumber).map(report => (
              <Card key={report.reportNumber} className="bg-muted/30 p-3">
                <div className="flex justify-between items-center mb-1">
                  <h5 className="font-medium text-sm">Report #{report.reportNumber}</h5>
                  <Badge variant={getStatusBadgeVariant(report.clientStatus)} size="sm" className="capitalize text-xs">
                    {report.clientStatus ? report.clientStatus.replace('_', ' ') : 'Awaiting Submission'}
                  </Badge>
                </div>
                {report.deadline && <p className="text-xs text-muted-foreground mb-1"><CalendarDays className="inline h-3 w-3 mr-0.5" />Report Deadline: {formatDate(report.deadline, true)}</p>}
                {report.studentSubmission ? (
                  <div className="text-xs space-y-1">
                    <p><strong>Submission:</strong> {report.studentSubmission.text}</p>
                    {report.studentSubmission.fileUrl && (
                        <Button variant="link" size="xs" asChild className="p-0 h-auto">
                            <a href={report.studentSubmission.fileUrl} target="_blank" rel="noopener noreferrer">
                                <FileText className="mr-1 h-4 w-4" /> View Attachment ({report.studentSubmission.fileName || 'file'})
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
    </div>
  );
}

    