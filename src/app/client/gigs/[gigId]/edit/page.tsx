
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
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
import { Calendar as CalendarIcon, Loader2, ArrowLeft, Info, PlusCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants';
import type { ProgressReport } from '@/app/student/works/page'; // Assuming ProgressReport type is shareable


// Schema for gig form validation
const gigSchema = z.object({
  title: z.string().min(5, { message: 'Title must be at least 5 characters' }).max(100, { message: 'Title cannot exceed 100 characters'}),
  description: z.string().min(20, { message: 'Description must be at least 20 characters' }).max(2000, { message: 'Description cannot exceed 2000 characters'}),
  budget: z.coerce.number().positive({ message: 'Budget must be a positive number' }),
  deadline: z.date({ required_error: 'A deadline is required.' }),
  requiredSkills: z.array(z.string()).min(1, { message: 'At least one skill is required' }).max(10, { message: 'Maximum 10 skills allowed' }),
  numberOfReports: z.coerce.number().int().min(0, "Number of reports cannot be negative").max(10, "Maximum 10 reports allowed").optional().default(0),
  reportDeadlines: z.array(z.date().nullable()).optional(),
}).superRefine((data, ctx) => {
    if (data.numberOfReports > 0 && data.reportDeadlines && data.reportDeadlines.length !== data.numberOfReports) {
      // This can be complex with dynamic arrays. UI should manage the number of fields.
    }
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
            if (rd && index > 0 && data.reportDeadlines![index-1] && rd < data.reportDeadlines![index-1]!) {
                 ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [`reportDeadlines.${index}`],
                    message: `Report deadline ${index + 1} cannot be before report deadline ${index}.`,
                });
            }
        });
    }
});

type GigFormValues = z.infer<typeof gigSchema>;

interface FetchedGigData { // For data fetched from Firestore
  id: string;
  clientId: string;
  currency: string;
  title: string;
  description: string;
  budget: number;
  deadline: Timestamp;
  requiredSkills: string[];
  numberOfReports?: number;
  progressReports?: Partial<ProgressReport>[]; // Firestore progress reports
  status: 'open' | 'in-progress' | 'completed' | 'closed'; // Added status
}

export default function EditGigPage() {
  const params = useParams();
  const gigId = params.gigId as string;
  const router = useRouter();
  const { user, loading: authLoading, role } = useFirebase();
  const { toast } = useToast();

  const [isLoadingGig, setIsLoadingGig] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<GigFormValues>({
    resolver: zodResolver(gigSchema),
    defaultValues: {
      title: '',
      description: '',
      budget: undefined,
      deadline: undefined,
      requiredSkills: [],
      numberOfReports: 0,
      reportDeadlines: [],
    },
    mode: 'onChange',
  });

  const { control, watch, setValue, reset } = form;
  const numberOfReportsValue = watch("numberOfReports", 0);
  const { fields: reportDeadlineFields, append: appendReportDeadline, remove: removeReportDeadline, replace: replaceReportDeadlines } = useFieldArray({
    control,
    name: "reportDeadlines"
  });

   useEffect(() => {
    const currentDeadlinesCount = reportDeadlineFields.length;
    const targetCount = Number(numberOfReportsValue || 0);

    if (targetCount > currentDeadlinesCount) {
      const newDeadlinesArray = Array(targetCount - currentDeadlinesCount).fill(null);
      appendReportDeadline(newDeadlinesArray);
    } else if (targetCount < currentDeadlinesCount) {
      const newDeadlinesSubset = reportDeadlineFields.slice(0, targetCount);
      replaceReportDeadlines(newDeadlinesSubset);
    }
  }, [numberOfReportsValue, appendReportDeadline, replaceReportDeadlines, reportDeadlineFields.length]); // reportDeadlineFields.length ensures effect runs if length changes externally


  const fetchAndSetGigData = useCallback(async () => {
    if (!user || !gigId) return;
    setIsLoadingGig(true);
    setError(null);

    try {
      const gigDocRef = doc(db, 'gigs', gigId);
      const docSnap = await getDoc(gigDocRef);

      if (docSnap.exists()) {
        const gigData = { id: docSnap.id, ...docSnap.data() } as FetchedGigData;

        if (gigData.clientId !== user.uid) {
          setError("You are not authorized to edit this gig.");
          toast({ title: "Access Denied", description: "You can only edit your own gigs.", variant: "destructive" });
          router.push('/client/gigs');
          return;
        }

        // Check if gig status allows editing
        if (gigData.status && (gigData.status === 'in-progress' || gigData.status === 'completed' || gigData.status === 'closed')) {
          setError(`This gig is ${gigData.status} and can no longer be edited.`);
          toast({
            title: "Editing Not Allowed",
            description: `This gig is ${gigData.status} and can no longer be edited.`,
            variant: "destructive",
          });
          router.push(`/client/gigs/${gigId}/manage`); // Redirect to manage page
          setIsLoadingGig(false); // Stop loading as we are redirecting
          return;
        }

        const initialReportDeadlines: (Date | null)[] = [];
        const numReports = gigData.numberOfReports || 0;
        if (numReports > 0) {
            for (let i = 0; i < numReports; i++) {
                const report = gigData.progressReports?.find(pr => pr.reportNumber === i + 1);
                initialReportDeadlines.push(report?.deadline ? (report.deadline as unknown as Timestamp).toDate() : null);
            }
        }
        
        reset({ // Use reset to correctly populate all fields including field arrays
          title: gigData.title,
          description: gigData.description,
          budget: gigData.budget,
          deadline: (gigData.deadline as unknown as Timestamp)?.toDate ? (gigData.deadline as unknown as Timestamp).toDate() : new Date(),
          requiredSkills: gigData.requiredSkills || [],
          numberOfReports: numReports,
          reportDeadlines: initialReportDeadlines,
        });

      } else {
        setError("Gig not found.");
        toast({ title: "Error", description: "The requested gig could not be found.", variant: "destructive" });
        router.push('/client/gigs');
      }
    } catch (err: any) {
      console.error("Error fetching gig:", err);
      setError("Failed to load gig details. Please try again.");
      toast({ title: "Loading Error", description: "Could not load gig details.", variant: "destructive" });
    } finally {
      setIsLoadingGig(false);
    }
  }, [user, gigId, reset, router, toast]);

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') {
        toast({ title: "Access Denied", description: "You must be logged in as a client to edit gigs.", variant: "destructive" });
        router.push('/auth/login?redirect=/client/gigs');
      } else {
        fetchAndSetGigData();
      }
    }
  }, [authLoading, user, role, router, fetchAndSetGigData, toast]);


  const onSubmit = async (data: GigFormValues) => {
    if (!user || !gigId) {
      toast({ title: "Error", description: "User or Gig ID missing.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const gigDocRef = doc(db, 'gigs', gigId);
      const existingGigSnap = await getDoc(gigDocRef);
      if (!existingGigSnap.exists()) throw new Error("Gig not found for update.");
      const existingGigData = existingGigSnap.data() as FetchedGigData;

      // Double check status before submitting, though UI should prevent this.
      if (existingGigData.status && (existingGigData.status === 'in-progress' || existingGigData.status === 'completed' || existingGigData.status === 'closed')) {
        toast({
          title: "Editing Not Allowed",
          description: `This gig is ${existingGigData.status} and can no longer be edited.`,
          variant: "destructive",
        });
        setIsSubmitting(false);
        router.push(`/client/gigs/${gigId}/manage`);
        return;
      }


      const newProgressReports: Partial<ProgressReport>[] = [];
      if (data.numberOfReports && data.numberOfReports > 0 && data.reportDeadlines) {
          for (let i = 0; i < data.numberOfReports; i++) {
              // Try to preserve existing submission/review data if report number still exists
              const existingReport = existingGigData.progressReports?.find(pr => pr.reportNumber === i + 1);
              newProgressReports.push({
                  reportNumber: i + 1,
                  deadline: data.reportDeadlines[i] ? Timestamp.fromDate(data.reportDeadlines[i]!) : null,
                  studentSubmission: existingReport?.studentSubmission || null,
                  clientStatus: existingReport?.clientStatus || null,
                  clientFeedback: existingReport?.clientFeedback || null,
                  reviewedAt: existingReport?.reviewedAt || null,
              });
          }
      }


      const updateData: Partial<FetchedGigData> & { updatedAt: any, progressReports: Partial<ProgressReport>[] } = {
        title: data.title,
        description: data.description,
        budget: data.budget,
        deadline: Timestamp.fromDate(data.deadline),
        requiredSkills: data.requiredSkills,
        numberOfReports: data.numberOfReports || 0,
        progressReports: newProgressReports,
        updatedAt: serverTimestamp(),
      };
      
      await updateDoc(gigDocRef, updateData);

      toast({
        title: 'Gig Updated Successfully!',
        description: `Your gig "${data.title}" has been updated.`,
      });
      router.push(`/client/gigs/${gigId}/manage`);

    } catch (error: any) {
      console.error('Error updating gig:', error);
      toast({
        title: 'Failed to Update Gig',
        description: `An error occurred: ${error.message}`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || isLoadingGig) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-8 text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button variant="outline" onClick={() => router.push(`/client/gigs/${gigId}/manage`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Manage Gig
        </Button>
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
          <CardTitle className="text-2xl">Edit Gig</CardTitle>
          <CardDescription>
            Modify the details of your gig. Currency is fixed to INR.
          </CardDescription>
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
                      <FormLabel>Budget (INR)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="e.g., 10000" {...field} value={field.value ?? ''} onChange={e => field.onChange(parseFloat(e.target.value) || undefined)} min="1" step="any" />
                      </FormControl>
                      <FormDescription>Enter the total amount in INR.</FormDescription>
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
                            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
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
                      How many progress reports should the student submit?
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
            {numberOfReportsValue > 0 && (
                <Card className="pt-4 border-dashed">
                    <CardHeader className="p-2 pt-0">
                        <CardTitle className="text-lg">Set Progress Report Deadlines</CardTitle>
                        <CardDescription className="text-xs">Optional: Set a deadline for each progress report. Deadlines must be on or before the overall gig deadline.</CardDescription>
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
                                                    disabled={(date) =>
                                                        date < new Date(new Date().setHours(0, 0, 0, 0)) || (form.getValues('deadline') ? date > form.getValues('deadline') : false)
                                                    }
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


              <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting || isLoadingGig}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

