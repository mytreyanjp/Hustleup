
"use client";

import { useState, useEffect } from 'react';
import { useFirebase } from '@/context/firebase-context';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mail, HelpCircle, MessageSquarePlus, MessageCircle, UserCircle, Send, ArrowLeft, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { db } from '@/config/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation'; 

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

// IMPORTANT: Replace 'YOUR_ACTUAL_ADMIN_UID_GOES_HERE' with a real admin user's UID in your project.
// This admin account will be the initial target for user support chat requests.
// Other admins will also see and be able to respond to these 'pending_admin_response' chats.
const TARGET_ADMIN_UID_FOR_SUPPORT = "YOUR_ACTUAL_ADMIN_UID_GOES_HERE"; 
const isAdminChatConfigured = TARGET_ADMIN_UID_FOR_SUPPORT !== "YOUR_ACTUAL_ADMIN_UID_GOES_HERE";

export default function SupportPage() {
  const supportEmail = "promoflixindia@gmail.com";
  const { user, userProfile, loading: authLoading, role } = useFirebase(); // Added role
  const { toast } = useToast();
  const router = useRouter(); 

  const [faqs, setFaqs] = useState<FAQEntry[]>([]);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(true);
  const [newQuestion, setNewQuestion] = useState('');
  const [isSubmittingQuestion, setIsSubmittingQuestion] = useState(false);

  const [currentAnsweringFaqId, setCurrentAnsweringFaqId] = useState<string | null>(null);
  const [newAnswer, setNewAnswer] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);

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
        answeredByUsername: userProfile.username || user.email?.split('@')[0] || 'Anonymous',
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

  const handleChatWithAdmin = () => {
    if (!user) {
      toast({ title: "Login Required", description: "Please log in to chat with support.", variant: "destructive" });
      router.push('/auth/login?redirect=/support');
      return;
    }
    if (TARGET_ADMIN_UID_FOR_SUPPORT === "YOUR_ACTUAL_ADMIN_UID_GOES_HERE") {
      toast({
        title: "Admin Chat Not Configured",
        description: "This feature is not fully set up. A developer needs to update TARGET_ADMIN_UID_FOR_SUPPORT in src/app/support/page.tsx with a valid admin user ID. For now, please contact support via email.",
        variant: "destructive",
        duration: 15000,
      });
      return;
    }
    if (user.uid === TARGET_ADMIN_UID_FOR_SUPPORT) {
        toast({
            title: "Action Info",
            description: "Admins typically review user requests from their main chat list.",
            variant: "default",
        });
        router.push('/chat');
        return;
    }
    router.push(`/chat?userId=${TARGET_ADMIN_UID_FOR_SUPPORT}&adminChatRequest=true`);
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

      {user && !authLoading && role !== 'admin' && ( // Admins usually manage support, not ask generic questions here
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageSquarePlus className="h-5 w-5" /> Ask a New Question</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Type your question here..."
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              rows={3}
              disabled={isSubmittingQuestion}
            />
          </CardContent>
          <CardFooter>
            <Button onClick={handleAskQuestion} disabled={isSubmittingQuestion || !newQuestion.trim()}>
              {isSubmittingQuestion && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Question
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
                    {user && !authLoading && userProfile?.role === 'admin' && ( // Only admins can answer from here
                      <Dialog open={currentAnsweringFaqId === faq.id} onOpenChange={(isOpen) => !isOpen && setCurrentAnsweringFaqId(null)}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="ml-6 mt-2" onClick={() => { setNewAnswer(''); setCurrentAnsweringFaqId(faq.id); }}>
                            <MessageCircle className="mr-2 h-4 w-4" /> Add Answer
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
          {user && role !== 'admin' && ( // Only non-admins see the direct chat request button
             <div className="flex flex-col gap-3 p-4 border rounded-lg">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
                    <div className="flex items-center gap-3">
                        <MessageCircle className="h-6 w-6 text-primary shrink-0" />
                        <div>
                            <p className="font-semibold">Chat with Admin Team</p>
                            <p className="text-sm text-muted-foreground">Get live help from our support staff.</p>
                        </div>
                    </div>
                    <Button 
                        variant="default" 
                        size="sm" 
                        onClick={handleChatWithAdmin} 
                        className="w-full sm:w-auto mt-2 sm:mt-0"
                        disabled={!isAdminChatConfigured && !authLoading}
                    >
                        Request Admin Chat
                    </Button>
                </div>
                {!isAdminChatConfigured && !authLoading && (
                    <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-500 bg-amber-500/10 p-2 rounded-md mt-1">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>
                            Admin chat is not fully configured. A developer needs to replace <strong>"YOUR_ACTUAL_ADMIN_UID_GOES_HERE"</strong> with a valid admin user ID in the file: <code>src/app/support/page.tsx</code> (line 26).
                        </span>
                    </div>
                )}
             </div>
           )}
          <p className="text-sm text-muted-foreground pt-2">
            We aim to respond to all queries within 24-48 business hours. Please provide as much detail as possible so we can assist you effectively.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

