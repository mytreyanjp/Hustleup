
"use client";

import { useState, useEffect } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mail, HelpCircle, MessageSquarePlus, UserCircle, Send, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { db } from '@/config/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, getDoc, where, getDocs, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import type { ChatMetadata } from '@/types/chat';
import { getChatId } from '@/lib/utils';

interface AnswerEntry {
  answerText: string;
  answeredByUid: string;
  answeredByUsername: string;
  answeredAt: Timestamp;
}

interface FAQEntry {
  id: string;
  questionText: string;
  askedByUid: string;
  askedByUsername: string;
  createdAt: Timestamp;
  answers: AnswerEntry[];
}

// Local AdminChatRequest type definition for this page
interface AdminChatRequest {
    id?: string; // Firestore document ID if fetched
    requesterUid: string;
    requestedAt: Timestamp;
    status: 'pending' | 'in_progress' | 'resolved' | 'closed';
    handledByAdminUid?: string; // UID of the admin who handled/is handling
    initialMessage?: string; // Stored from the request dialog
    resolutionNotes?: string;
    resolvedAt?: Timestamp;
}

export default function SupportPage() {
  const supportEmail = "promoflixindia@gmail.com";
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const { toast } = useToast();
  const router = useRouter();

  const [faqs, setFaqs] = useState<FAQEntry[]>([]);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);

  const [currentAnsweringFaqId, setCurrentAnsweringFaqId] = useState<string | null>(null);
  const [newAnswer, setNewAnswer] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);

  const [showSupportChatRequestDialog, setShowSupportChatRequestDialog] = useState(false);
  const [supportRequestMessage, setSupportRequestMessage] = useState('');
  const [isSubmittingSupportRequest, setIsSubmittingSupportRequest] = useState(false);
  
  const [canSubmitChatRequest, setCanSubmitChatRequest] = useState(false);
  const [hasActiveChatRequestMessage, setHasActiveChatRequestMessage] = useState<string | null>(null);
  const [isLoadingChatRequestEligibility, setIsLoadingChatRequestEligibility] = useState(true);

  const TARGET_ADMIN_UID_FOR_SUPPORT = "Z2X9gmcjA9P4S29Q3n0zHFp7YqJ3"; 
  const isAdminChatConfigured = TARGET_ADMIN_UID_FOR_SUPPORT !== "YOUR_ACTUAL_ADMIN_UID_GOES_HERE";


  useEffect(() => {
    if (!db) return;
    setIsLoadingFaqs(true);
    const faqsQuery = query(collection(db, 'faqs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(faqsQuery, (snapshot) => {
      const fetchedFaqs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FAQEntry));
      setFaqs(fetchedFaqs);
      setIsLoadingFaqs(false);
    }, (error) => {
      console.error("Error fetching FAQs:", error);
      toast({ title: "Error", description: "Could not load FAQs.", variant: "destructive" });
      setIsLoadingFaqs(false);
    });
    return () => unsubscribe();
  }, [toast]);

  useEffect(() => {
    if (!user || !db || authLoading) {
      setIsLoadingChatRequestEligibility(false);
      setCanSubmitChatRequest(false);
      return;
    }

    setIsLoadingChatRequestEligibility(true);
    setHasActiveChatRequestMessage(null);

    const checkEligibility = async () => {
      try {
        const activeRequestsQuery = query(
          collection(db, 'admin_chat_requests'),
          where('requesterUid', '==', user.uid),
          where('status', 'in', ['pending', 'in_progress'])
        );
        const activeRequestsSnapshot = await getDocs(activeRequestsQuery);

        if (!activeRequestsSnapshot.empty) {
          const activeRequestDoc = activeRequestsSnapshot.docs[0]; // Assuming one active request at most
          const activeRequestData = activeRequestDoc.data() as AdminChatRequest;
          
          if (activeRequestData.status === 'pending' && !activeRequestData.handledByAdminUid) {
            setCanSubmitChatRequest(false);
            setHasActiveChatRequestMessage("Your support request is pending. An admin will attend to it soon.");
          } else if (activeRequestData.handledByAdminUid) {
            const chatIdForActualAdmin = getChatId(user.uid, activeRequestData.handledByAdminUid);
            const chatDocRef = doc(db, 'chats', chatIdForActualAdmin);
            const chatSnap = await getDoc(chatDocRef);

            if (chatSnap.exists()) {
              const chatData = chatSnap.data() as ChatMetadata;
              if (chatData.chatStatus === 'closed_by_user') {
                const adminChatRequestDocRef = doc(db, 'admin_chat_requests', activeRequestDoc.id);
                 if (activeRequestData.status === 'in_progress' || activeRequestData.status === 'pending') {
                    try {
                        await updateDoc(adminChatRequestDocRef, { status: 'closed', resolutionNotes: 'Chat resolved and closed by user.' });
                        console.log(`Admin chat request ${adminChatRequestDocRef.id} marked as closed because chat was closed by user.`);
                    } catch (updateError) {
                        console.error(`Failed to update admin_chat_request ${adminChatRequestDocRef.id} to closed:`, updateError);
                    }
                }
                setCanSubmitChatRequest(true);
                setHasActiveChatRequestMessage(null);
              } else {
                setCanSubmitChatRequest(false);
                setHasActiveChatRequestMessage("You already have an active support request/chat. Please wait for it to be resolved or close it from the chat page.");
              }
            } else {
              // Chat document with the handling admin doesn't exist. This could mean the admin accepted the request
              // but the chat document itself was never created or was deleted.
              // Or the initial TARGET_ADMIN_UID_FOR_SUPPORT was used to check the chat and it was not found
              // because a different admin handled it.
              // For safety, block new request. If the admin_chat_request is 'in_progress', it's likely an admin is meant to be in a chat.
              setCanSubmitChatRequest(false);
              setHasActiveChatRequestMessage("You have an active support interaction. If you believe it's resolved, please close it from the chat page or contact support via email.");
            }
          } else {
            // Fallback for inconsistent states (e.g. in_progress but no handledByAdminUid)
            setCanSubmitChatRequest(false);
            setHasActiveChatRequestMessage("You have an active support request with an unusual status. Please wait or contact support via email.");
          }
        } else {
          // No active admin_chat_requests found for this user.
          setCanSubmitChatRequest(true);
          setHasActiveChatRequestMessage(null);
        }
      } catch (error) {
        console.error("Error checking chat request eligibility:", error);
        toast({ title: "Error", description: "Could not verify chat request status. Please try again.", variant: "destructive" });
        setCanSubmitChatRequest(false); 
      } finally {
        setIsLoadingChatRequestEligibility(false);
      }
    };

    checkEligibility();
  }, [user, db, authLoading, toast, TARGET_ADMIN_UID_FOR_SUPPORT, showSupportChatRequestDialog]); 

  const handleAskQuestion = async () => {
    if (!user || !userProfile || !newQuestion.trim() || !db) {
      toast({ title: "Error", description: "Please log in and enter a question.", variant: "destructive" });
      return;
    }
    setIsSubmittingQuestion(true);
    try {
      await addDoc(collection(db, 'faqs'), {
        questionText: newQuestion.trim(),
        askedByUid: user.uid,
        askedByUsername: userProfile.username || user.email?.split('@')[0] || 'Anonymous',
        createdAt: serverTimestamp(),
        answers: [],
      });
      toast({ title: "Question Submitted!", description: "Your question has been posted." });
      setNewQuestion('');
    } catch (error: any) {
      console.error("Error submitting question:", error);
      toast({ title: "Error", description: `Could not submit question: ${error.message}`, variant: "destructive" });
    } finally {
      setIsSubmittingQuestion(false);
    }
  };

  const handleAddAnswer = async () => {
    if (!user || !userProfile || !newAnswer.trim() || !currentAnsweringFaqId || !db) {
      toast({ title: "Error", description: "Please log in and enter an answer.", variant: "destructive" });
      return;
    }
    if (userProfile.role !== 'admin') {
        toast({ title: "Permission Denied", description: "Only administrators can add answers.", variant: "destructive" });
        return;
    }
    setIsSubmittingAnswer(true);
    try {
      const faqDocRef = doc(db, 'faqs', currentAnsweringFaqId);
      const faqSnap = await getDoc(faqDocRef);

      if (!faqSnap.exists()) {
        toast({ title: "Error", description: "Question not found.", variant: "destructive" });
        setIsSubmittingAnswer(false);
        return;
      }

      const currentData = faqSnap.data() as FAQEntry;
      const existingAnswers = currentData.answers || [];

      const newAnswerObject: AnswerEntry = {
        answerText: newAnswer.trim(),
        answeredByUid: user.uid,
        answeredByUsername: userProfile.username || user.email?.split('@')[0] || 'Admin',
        answeredAt: Timestamp.now(),
      };

      const updatedAnswers = [...existingAnswers, newAnswerObject];

      await updateDoc(faqDocRef, {
        answers: updatedAnswers
      });

      toast({ title: "Answer Submitted!", description: "Thank you for your contribution." });
      setNewAnswer('');
      setCurrentAnsweringFaqId(null);
    } catch (error: any) {
      console.error("Error submitting answer:", error);
      toast({ title: "Error", description: `Could not submit answer: ${error.message}`, variant: "destructive" });
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleSubmitSupportRequest = async () => {
    if (!user || !userProfile || !supportRequestMessage.trim() || !db) {
      toast({ title: "Error", description: "Please log in and enter your query.", variant: "destructive" });
      return;
    }
    if (!isAdminChatConfigured) {
        toast({
            title: "Admin Chat Not Configured",
            description: "Admin chat feature is currently unavailable. Please use email support.",
            variant: "destructive",
            duration: 7000,
        });
        return;
    }
    if (!canSubmitChatRequest || isLoadingChatRequestEligibility) {
        if (hasActiveChatRequestMessage) {
            toast({ title: "Request Not Sent", description: hasActiveChatRequestMessage, variant: "destructive"});
        } else {
            toast({ title: "Request Not Sent", description: "Cannot submit request at this time.", variant: "destructive"});
        }
        return;
    }

    setIsSubmittingSupportRequest(true);
    try {
      await addDoc(collection(db, 'admin_chat_requests'), {
        requesterUid: user.uid,
        requesterUsername: userProfile.username || user.email?.split('@')[0] || 'User',
        requesterEmail: user.email || 'No email',
        initialMessage: supportRequestMessage.trim(),
        requestedAt: serverTimestamp(),
        status: 'pending', 
        platformInfo: { 
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
            url: typeof window !== 'undefined' ? window.location.href : 'Unknown',
        }
      });
      toast({ title: "Support Request Sent!", description: "An admin will contact you via chat shortly." });
      setSupportRequestMessage('');
      setShowSupportChatRequestDialog(false);
      setCanSubmitChatRequest(false); 
      setIsLoadingChatRequestEligibility(true);
    } catch (error: any) {
      console.error("Error submitting support request:", error);
      toast({ title: "Request Failed", description: `Could not submit your request: ${error.message}`, variant: "destructive" });
    } finally {
      setIsSubmittingSupportRequest(false);
    }
  };

  const formatDateDistance = (timestamp: Timestamp | undefined): string => {
    if (!timestamp) return 'Just now';
    try {
      if (timestamp.toDate) {
        return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
      }
      return 'A moment ago';
    } catch (e) {
      return 'Invalid date';
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-2 self-start">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      <div className="text-center">
        <HelpCircle className="mx-auto h-16 w-16 text-primary mb-4" />
        <h1 className="text-3xl font-bold tracking-tight">Support & Community FAQs</h1>
        <p className="text-muted-foreground mt-2">
          Find answers, ask questions, and help others.
        </p>
      </div>

      {user && !authLoading && role !== 'admin' && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageSquarePlus className="h-5 w-5" /> Ask a New Question</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Type your question here to ask the community..."
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              rows={3}
              disabled={isSubmittingQuestion}
            />
          </CardContent>
          <CardFooter>
            <Button onClick={handleAskQuestion} disabled={isSubmittingQuestion || !newQuestion.trim()}>
              {isSubmittingQuestion && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post Question
            </Button>
          </CardFooter>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
          <CardDescription>
            Browse questions from the community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingFaqs ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : faqs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No questions have been asked yet. Be the first!</p>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq) => (
                <AccordionItem value={faq.id} key={faq.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex-1 text-left">
                      <p className="font-medium text-base">{faq.questionText}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Asked by {faq.askedByUsername} &bull; {formatDateDistance(faq.createdAt)}
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-2 pb-4 space-y-3">
                    {faq.answers && faq.answers.length > 0 ? (
                      <div className="space-y-3 pl-4 border-l-2 border-border ml-2">
                        {faq.answers.sort((a,b) => b.answeredAt.toMillis() - a.answeredAt.toMillis()).map((answer, index) => (
                          <div key={index} className="py-2 rounded-md">
                            <p className="text-sm">{answer.answerText}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              <UserCircle className="inline h-3 w-3 mr-1" />
                              Answered by {answer.answeredByUsername} &bull; {formatDateDistance(answer.answeredAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic pl-6">No answers yet.</p>
                    )}
                    {user && !authLoading && userProfile?.role === 'admin' && (
                      <Dialog open={currentAnsweringFaqId === faq.id} onOpenChange={(isOpen) => !isOpen && setCurrentAnsweringFaqId(null)}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="ml-6 mt-2" onClick={() => { setNewAnswer(''); setCurrentAnsweringFaqId(faq.id); }}>
                            <MessageSquarePlus className="mr-2 h-4 w-4" /> Add Answer
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Answer Question</DialogTitle>
                            <DialogDescription className="line-clamp-3">
                              Your answer to: "{faq.questionText}"
                            </DialogDescription>
                          </DialogHeader>
                          <Textarea
                            placeholder="Type your answer here..."
                            value={newAnswer}
                            onChange={(e) => setNewAnswer(e.target.value)}
                            rows={4}
                            disabled={isSubmittingAnswer}
                          />
                          <DialogFooter>
                            <DialogClose asChild><Button variant="ghost" disabled={isSubmittingAnswer}>Cancel</Button></DialogClose>
                            <Button onClick={handleAddAnswer} disabled={isSubmittingAnswer || !newAnswer.trim()}>
                              {isSubmittingAnswer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Submit Answer
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Direct Support</CardTitle>
          <CardDescription>
            If you can't find an answer or need personalized help, please use one of the options below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border rounded-lg">
            <div className="flex items-center gap-3">
                <Mail className="h-6 w-6 text-primary shrink-0" />
                <div>
                <p className="font-semibold">Email Support</p>
                <a href={`mailto:${supportEmail}`} className="text-sm text-primary hover:underline">
                    {supportEmail}
                </a>
                </div>
            </div>
            <Button variant="outline" size="sm" asChild className="w-full sm:w-auto mt-2 sm:mt-0">
                 <a href={`mailto:${supportEmail}`}>Send Email</a>
            </Button>
          </div>

          {user && role !== 'admin' && !authLoading && (
             <div className="flex flex-col gap-3 p-4 border rounded-lg">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
                    <div className="flex items-center gap-3">
                        <MessageSquarePlus className="h-6 w-6 text-primary shrink-0" />
                        <div>
                            <p className="font-semibold">Chat with Admin Team</p>
                            <p className="text-sm text-muted-foreground">Submit a request to chat with our support staff.</p>
                        </div>
                    </div>
                    <Dialog open={showSupportChatRequestDialog} onOpenChange={setShowSupportChatRequestDialog}>
                        <DialogTrigger asChild>
                            <Button
                                variant="default"
                                size="sm"
                                className="w-full sm:w-auto mt-2 sm:mt-0"
                                disabled={authLoading || !user || !isAdminChatConfigured || isSubmittingSupportRequest || !canSubmitChatRequest || isLoadingChatRequestEligibility}
                                title={
                                    !isAdminChatConfigured ? "Admin Chat feature is currently unavailable." :
                                    isLoadingChatRequestEligibility ? "Checking eligibility..." :
                                    hasActiveChatRequestMessage || "Request chat with admin team"
                                }
                            >
                                {isLoadingChatRequestEligibility ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Request Admin Chat
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Request Chat with Admin Team</DialogTitle>
                                <DialogDescription>
                                Please briefly describe your issue or question. An admin will join a chat with you shortly.
                                </DialogDescription>
                            </DialogHeader>
                             {hasActiveChatRequestMessage && !canSubmitChatRequest && <p className="text-sm text-destructive p-2 bg-destructive/10 rounded-md">{hasActiveChatRequestMessage}</p>}
                            <Textarea
                                placeholder="Type your message here..."
                                value={supportRequestMessage}
                                onChange={(e) => setSupportRequestMessage(e.target.value)}
                                rows={4}
                                disabled={isSubmittingSupportRequest || !canSubmitChatRequest || isLoadingChatRequestEligibility || !!hasActiveChatRequestMessage}
                            />
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setShowSupportChatRequestDialog(false)} disabled={isSubmittingSupportRequest}>Cancel</Button>
                                <Button onClick={handleSubmitSupportRequest} disabled={isSubmittingSupportRequest || !supportRequestMessage.trim() || !canSubmitChatRequest || isLoadingChatRequestEligibility || !!hasActiveChatRequestMessage}>
                                    {isSubmittingSupportRequest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Send Request
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
                {!canSubmitChatRequest && !isLoadingChatRequestEligibility && hasActiveChatRequestMessage && (
                    <p className="text-xs text-center text-muted-foreground mt-1 sm:text-right">
                        {hasActiveChatRequestMessage}
                    </p>
                )}
             </div>
           )}
          <p className="text-sm text-muted-foreground pt-2">
            We aim to respond to all queries on HustleUp by PromoFlix within 24-48 business hours. Please provide as much detail as possible so we can assist you effectively.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

