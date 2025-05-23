
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useFirebase } from '@/context/firebase-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const gigSchema = z.object({
  title: z.string().min(5, { message: 'Title must be at least 5 characters' }).max(100, { message: 'Title cannot exceed 100 characters'}),
  description: z.string().min(20, { message: 'Description must be at least 20 characters' }).max(2000, { message: 'Description cannot exceed 2000 characters'}),
  budget: z.coerce.number().positive({ message: 'Budget must be a positive number' }), // Coerce input to number
  deadline: z.date({ required_error: 'A deadline is required.' }),
  requiredSkills: z.array(z.string().min(1, { message: 'Skill cannot be empty' })).min(1, { message: 'At least one skill is required' }).max(10, { message: 'Maximum 10 skills allowed' }),
});

type GigFormValues = z.infer<typeof gigSchema>;

export default function NewGigPage() {
  const { user, userProfile, loading, role } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false); // Renamed from isLoading for clarity

  const form = useForm<GigFormValues>({
    resolver: zodResolver(gigSchema),
    defaultValues: {
      title: '',
      description: '',
      budget: '' as unknown as number, // Initialize with empty string for input, coerce handles it
      deadline: undefined,
      requiredSkills: [''],
    },
  });

   const { fields, append, remove } = useFieldArray({
     control: form.control,
     name: "requiredSkills"
   });

  // Effect for redirection if not authorized
  useEffect(() => {
    if (!loading) { // Only act once context is not loading
      if (!user || role !== 'client') {
        toast({ title: "Access Denied", description: "You must be logged in as a client to post a gig.", variant: "destructive"});
        router.push('/auth/login?redirect=/client/gigs/new');
      }
    }
  }, [loading, user, role, router, toast]);

  const onSubmit = async (data: GigFormValues) => {
    if (!user || role !== 'client') { // Double check authorization before submission
        toast({ title: "Action Failed", description: "You are not authorized to perform this action.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);
    try {
      const gigsCollectionRef = collection(db, 'gigs');
      await addDoc(gigsCollectionRef, {
        clientId: user.uid,
        clientUsername: userProfile?.username || user.email?.split('@')[0] || 'Unknown Client',
        ...data,
        status: 'open',
        createdAt: serverTimestamp(),
        applicants: [],
      });

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

  // Primary loading check from Firebase context
  if (loading) {
    return (
       <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
    );
  }

  // After context is loaded, if user is not authorized, show placeholder while redirecting.
  // The useEffect above handles the actual redirect.
  if (!user || role !== 'client') {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-10rem)] text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Checking authorization...</p>
      </div>
    );
  }

  // If all checks pass, render the form.
  return (
     <div className="max-w-3xl mx-auto py-8">
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
                       <FormLabel>Budget ($)</FormLabel>
                       <FormControl>
                         <Input type="number" placeholder="e.g., 150" {...field} value={field.value ?? ''} min="1" step="any" />
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

               <div>
                 <FormLabel>Required Skills</FormLabel>
                 <FormDescription className="mb-2">List the skills needed for this gig (max 10).</FormDescription>
                 <div className="space-y-2">
                   {fields.map((field, index) => (
                     <div key={field.id} className="flex items-center gap-2">
                       <FormField
                         control={form.control}
                         name={`requiredSkills.${index}`}
                         render={({ field: skillField }) => (
                           <FormItem className="flex-1">
                             <FormControl>
                                <Input
                                  {...skillField}
                                  value={skillField.value ?? ''} // Ensure value is not undefined
                                  placeholder={`Skill ${index + 1} (e.g., JavaScript, UI/UX Design)`}
                                />
                              </FormControl>
                              <FormMessage />
                           </FormItem>
                         )}
                       />
                       {fields.length > 1 && (
                         <Button
                           type="button"
                           variant="ghost"
                           size="icon"
                           className="h-9 w-9 text-destructive hover:bg-destructive/10"
                           onClick={() => remove(index)}
                         >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                       )}
                     </div>
                   ))}
                 </div>
                 <Button
                   type="button"
                   variant="outline"
                   size="sm"
                   className="mt-2"
                   onClick={() => append('')}
                   disabled={fields.length >= 10}
                 >
                   <PlusCircle className="mr-2 h-4 w-4" /> Add Another Skill
                 </Button>
                  <FormMessage>{form.formState.errors.requiredSkills?.message || form.formState.errors.requiredSkills?.root?.message}</FormMessage>
               </div>

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
