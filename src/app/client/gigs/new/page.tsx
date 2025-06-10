
"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Loader2, Info, ArrowLeft, PlusCircle, Trash2, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants';
import type { ProgressReport } from '@/app/student/works/page'; 

const gigSchema = z.object({
  title: z.string().min(5, { message: 'Title must be at least 5 characters' }).max(100, { message: 'Title cannot exceed 100 characters'}),
  description: z.string().min(20, { message: 'Description must be at least 20 characters' }).max(2000, { message: 'Description cannot exceed 2000 characters'}),
  budget: z.coerce.number().positive({ message: 'Payment must be a positive number' }),
  deadline: z.date({ required_error: 'A deadline is required.' }),
  requiredSkills: z.array(z.string()).min(1, { message: 'At least one skill is required' }).max(10, { message: 'Maximum 10 skills allowed' }),
  numberOfReports: z.coerce.number().int().min(0, "Number of reports cannot be negative").max(10, "Maximum 10 reports allowed").optional().default(0),
  reportDeadlines: z.array(z.date().nullable()).optional(),
}).superRefine((data, ctx) => {
    if (data.numberOfReports === 0 && data.reportDeadlines && data.reportDeadlines.length > 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reportDeadlines'],
            message: 'Report deadlines should not be set if number of reports is zero.',
        });
    }
    if (data.reportDeadlines && data.deadline) {
        data.reportDeadlines.forEach((rd, index) => {
            if (rd && rd > data.deadline) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [`reportDeadlines.${index}`],
                    message: `Report deadline ${index + 1} cannot be after the main gig deadline.`,
                });
            }
            // Check sequential deadlines: Nth must be strictly after (N-1)th
            if (rd && index > 0) {
                const previousDeadline = data.reportDeadlines![index - 1];
                if (previousDeadline && rd <= previousDeadline) { // Error if current is not strictly after previous
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: [`reportDeadlines.${index}`],
                        message: `Report deadline ${index + 1} must be after report deadline ${index}.`,
                    });
                }
            }
        });
    }
});

type GigFormValues = z.infer<typeof gigSchema>;

export default function NewGigPage() {
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<GigFormValues>({
    resolver: zodResolver(gigSchema),
    defaultValues: {
      title: '',
      description: '',
      budget: '' as unknown as number, 
      deadline: undefined,
      requiredSkills: [],
      numberOfReports: 0,
      reportDeadlines: [],
    },
    mode: 'onChange', 
  });

  const { control, watch, setValue } = form;
  const numberOfReportsValue = watch("numberOfReports", 0);
  const overallGigDeadline = watch("deadline");
  const { fields: reportDeadlineFields, append: appendReportDeadline, remove: removeReportDeadline } = useFieldArray({
    control,
    name: "reportDeadlines"
  });

  useEffect(() => {
    const currentDeadlinesCount = reportDeadlineFields.length;
    const targetCount = Number(numberOfReportsValue || 0); 

    if (targetCount > currentDeadlinesCount) {
      for (let i = currentDeadlinesCount; i < targetCount; i++) {
        appendReportDeadline(null);
      }
    } else if (targetCount < currentDeadlinesCount) {
      for (let i = currentDeadlinesCount - 1; i >= targetCount; i--) {
        removeReportDeadline(i);
      }
    }
  }, [numberOfReportsValue, reportDeadlineFields.length, appendReportDeadline, removeReportDeadline]);


  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') {
        toast({ title: "Access Denied", description: "You must be logged in as a client to post a gig.", variant: "destructive"});
        router.push('/auth/login?redirect=/client/gigs/new');
      } else if (userProfile?.isBanned) {
        toast({ title: "Account Suspended", description: "Your account is currently suspended. You cannot post new gigs.", variant: "destructive", duration: 7000 });
        router.push('/client/dashboard');
      }
    }
  }, [authLoading, user, role, router, toast, userProfile?.isBanned]);

  const onSubmit = async (data: GigFormValues) => {
    if (!user || role !== 'client' || !userProfile) {
        toast({ title: "Action Failed", description: "You are not authorized or your profile is not loaded.", variant: "destructive"});
        return;
    }
    if (userProfile.isBanned) {
        toast({ title: "Account Suspended", description: "Your account is currently suspended. You cannot post new gigs.", variant: "destructive", duration: 7000 });
        return;
    }
    setIsSubmitting(true);
    try {
      const gigsCollectionRef = collection(db, 'gigs');
      
      const progressReportsData: Omit<ProgressReport, 'studentSubmission' | 'clientStatus' | 'clientFeedback' | 'reviewedAt'>[] = [];
      if (data.numberOfReports && data.numberOfReports > 0 && data.reportDeadlines) {
        for (let i = 0; i < data.numberOfReports; i++) {
          progressReportsData.push({
            reportNumber: i + 1,
            deadline: data.reportDeadlines[i] ? Timestamp.fromDate(data.reportDeadlines[i]!) : null,
          });
        }
      }

      const gigDataToSave = {
        clientId: user.uid,
        clientUsername: userProfile.username || user.email?.split('@')[0] || 'Unknown Client',
        clientDisplayName: userProfile.companyName || userProfile.username || user.email?.split('@')[0] || 'Client',
        clientAvatarUrl: userProfile.profilePictureUrl || '',
        title: data.title,
        description: data.description,
        budget: data.budget,
        deadline: Timestamp.fromDate(data.deadline),
        requiredSkills: data.requiredSkills,
        numberOfReports: data.numberOfReports || 0,
        progressReports: progressReportsData, 
        currency: "INR", 
        status: 'open',
        createdAt: serverTimestamp(),
        applicants: [],
      };
      
      await addDoc(gigsCollectionRef, gigDataToSave);

      toast({
        title: 'Gig Posted Successfully!',
        description: `Your gig "${data.title}" is now live.`,
      });
      router.push('/client/dashboard');

    } catch (error: any) {
      console.error('Error posting gig:', error);
      toast({
        title: 'Failed to Post Gig',
        description: `An error occurred: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
       <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
    );
  }

  if (!user || role !== 'client' || userProfile?.isBanned) { // Add banned check here for initial render if not redirected
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-10rem)] text-center p-4">
        {userProfile?.isBanned ? (
            <>
                <UserX className="h-12 w-12 text-destructive mb-4" />
                <h2 className="text-xl font-semibold text-destructive">Account Suspended</h2>
                <p className="text-muted-foreground">You cannot post new gigs as your account is suspended.</p>
                <Button variant="outline" onClick={() => router.push('/client/dashboard')} className="mt-4">Go to Dashboard</Button>
            </>
        ) : (
            <>
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Checking authorization...</p>
            </>
        )}
      </div>
    );
  }


  return (
     <div className="max-w-3xl mx-auto py-8">
       <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
         <ArrowLeft className="mr-2 h-4 w-4" /> Back
       </Button>
       <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-2xl">Post a New Gig</CardTitle>
          <CardDescription>Describe the work you need done and find talented students.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gig Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Design a Logo for a Startup" {...field} />
                    </FormControl>
                     <FormDescription>A clear and concise title attracts the right talent.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Detailed Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Provide details about the project requirements, deliverables, and context..." {...field} rows={6} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <FormField
                   control={form.control}
                   name="budget"
                   render={({ field }) => (
                     <FormItem>
                       <FormLabel>Gig Payment (INR)</FormLabel>
                       <FormControl>
                         <Input type="number" placeholder="e.g., 10000" {...field} value={field.value ?? ''} min="1" step="any" />
                       </FormControl>
                       <FormDescription>Enter the total payment amount in INR.</FormDescription>
                       <FormMessage />
                     </FormItem>
                   )}
                 />

                  <FormField
                    control={form.control}
                    name="deadline"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Overall Gig Deadline</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) =>
                                date < new Date(new Date().setHours(0, 0, 0, 0))
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                         <FormDescription>When does this project need to be completed?</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
              </div>

              <FormField
                control={form.control}
                name="requiredSkills"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Required Skills</FormLabel>
                    <FormControl>
                      <MultiSelectSkills
                        options={PREDEFINED_SKILLS}
                        selected={(field.value as Skill[]) || []}
                        onChange={field.onChange}
                        placeholder="Select required skills"
                        maxSkills={10}
                      />
                    </FormControl>
                    <FormDescription>List the skills needed for this gig (min 1, max 10).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="numberOfReports"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      Number of Progress Reports (0-10)
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="e.g., 3 (0 for no reports)" 
                        {...field} 
                        value={field.value ?? 0} 
                        onChange={e => {
                            const val = parseInt(e.target.value, 10);
                            field.onChange(isNaN(val) ? 0 : Math.max(0, Math.min(10, val)));
                        }}
                        min="0" 
                        max="10"
                      />
                    </FormControl>
                    <FormDescription>
                      Specify how many progress reports the student should submit.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            
            {numberOfReportsValue > 0 && overallGigDeadline && (
                <Card className="pt-4 border-dashed">
                    <CardHeader className="p-2 pt-0">
                        <CardTitle className="text-lg">Set Progress Report Deadlines</CardTitle>
                        <CardDescription className="text-xs">Optional: Set a deadline for each progress report. Deadlines must be on or before the overall gig deadline and sequential.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 p-2">
                        {reportDeadlineFields.map((item, index) => (
                            <FormField
                                key={item.id}
                                control={control}
                                name={`reportDeadlines.${index}`}
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Deadline for Report #{index + 1}</FormLabel>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <FormControl>
                                                    <Button
                                                        variant={"outline"}
                                                        className={cn(
                                                            "w-full pl-3 text-left font-normal",
                                                            !field.value && "text-muted-foreground"
                                                        )}
                                                    >
                                                        {field.value ? format(field.value, "PPP") : <span>Pick a date (Optional)</span>}
                                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                    </Button>
                                                </FormControl>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={field.value}
                                                    onSelect={(date) => {
                                                        field.onChange(date || null); 
                                                        form.trigger(`reportDeadlines.${index}`); 
                                                        form.trigger('deadline'); 
                                                    }}
                                                    disabled={(date) => {
                                                        const mainDeadline = form.getValues('deadline');
                                                        const previousReportDeadline = index > 0 ? form.getValues(`reportDeadlines.${index - 1}`) : null;
                                                        let isDisabled = date < new Date(new Date().setHours(0, 0, 0, 0));
                                                        if (mainDeadline) isDisabled = isDisabled || date > mainDeadline;
                                                        if (previousReportDeadline) isDisabled = isDisabled || date <= previousReportDeadline; // Must be after previous
                                                        return isDisabled;
                                                    }}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        ))}
                    </CardContent>
                </Card>
            )}

              <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Post Gig
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

