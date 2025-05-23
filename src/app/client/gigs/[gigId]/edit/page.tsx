
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
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
import { Calendar as CalendarIcon, Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants';

// Schema for gig form validation (same as new gig)
const gigSchema = z.object({
  title: z.string().min(5, { message: 'Title must be at least 5 characters' }).max(100, { message: 'Title cannot exceed 100 characters'}),
  description: z.string().min(20, { message: 'Description must be at least 20 characters' }).max(2000, { message: 'Description cannot exceed 2000 characters'}),
  budget: z.coerce.number().positive({ message: 'Budget must be a positive number' }),
  deadline: z.date({ required_error: 'A deadline is required.' }),
  requiredSkills: z.array(z.string()).min(1, { message: 'At least one skill is required' }).max(10, { message: 'Maximum 10 skills allowed' }),
});

type GigFormValues = z.infer<typeof gigSchema>;

interface GigData extends GigFormValues {
  id: string;
  clientId: string;
  // other fields like status, createdAt are not directly edited here but exist on the document
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
    defaultValues: { // Will be reset after fetching gig data
      title: '',
      description: '',
      budget: undefined, // Coerced to number
      deadline: undefined,
      requiredSkills: [],
    },
  });

  const fetchAndSetGigData = useCallback(async () => {
    if (!user || !gigId) return;
    setIsLoadingGig(true);
    setError(null);

    try {
      const gigDocRef = doc(db, 'gigs', gigId);
      const docSnap = await getDoc(gigDocRef);

      if (docSnap.exists()) {
        const gigData = { id: docSnap.id, ...docSnap.data() } as GigData;

        if (gigData.clientId !== user.uid) {
          setError("You are not authorized to edit this gig.");
          toast({ title: "Access Denied", description: "You can only edit your own gigs.", variant: "destructive" });
          router.push('/client/gigs');
          return;
        }

        form.reset({
          title: gigData.title,
          description: gigData.description,
          budget: gigData.budget,
          deadline: (gigData.deadline as unknown as Timestamp)?.toDate ? (gigData.deadline as unknown as Timestamp).toDate() : new Date(),
          requiredSkills: gigData.requiredSkills || [],
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
  }, [user, gigId, form, router, toast]);

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
      // Ensure we only update fields that are part of the form
      // status, applicants, etc. should not be overwritten here
      await updateDoc(gigDocRef, {
        ...data, // title, description, budget, deadline, requiredSkills
        updatedAt: serverTimestamp(),
      });

      toast({
        title: 'Gig Updated Successfully!',
        description: `Your gig "${data.title}" has been updated.`,
      });
      router.push(`/client/gigs/${gigId}/manage`); // Or back to /client/gigs

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
        <Button variant="outline" onClick={() => router.push('/client/gigs')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to My Gigs
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
            Modify the details of your gig.
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
                      <FormLabel>Budget ($)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="e.g., 150" {...field} value={field.value ?? ''} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} min="1" step="any" />
                      </FormControl>
                      <FormDescription>Enter the total amount you're willing to pay.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Deadline</FormLabel>
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

    