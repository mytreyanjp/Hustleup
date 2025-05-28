
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
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
import { Calendar as CalendarIcon, Loader2, Sparkles, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MultiSelectSkills } from '@/components/ui/multi-select-skills';
import { PREDEFINED_SKILLS, type Skill } from '@/lib/constants';
import { suggestGigSkills, type SuggestGigSkillsInput } from '@/ai/flows/suggest-gig-skills-flow';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';


const gigSchema = z.object({
  title: z.string().min(5, { message: 'Title must be at least 5 characters' }).max(100, { message: 'Title cannot exceed 100 characters'}),
  description: z.string().min(20, { message: 'Description must be at least 20 characters' }).max(2000, { message: 'Description cannot exceed 2000 characters'}),
  budget: z.coerce.number().positive({ message: 'Budget must be a positive number' }),
  deadline: z.date({ required_error: 'A deadline is required.' }),
  requiredSkills: z.array(z.string()).min(1, { message: 'At least one skill is required' }).max(10, { message: 'Maximum 10 skills allowed' }),
});

type GigFormValues = z.infer<typeof gigSchema>;

export default function NewGigPage() {
  const { user, userProfile, loading: authLoading, role } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isSuggestingSkills, setIsSuggestingSkills] = useState(false);
  const [aiSuggestedSkills, setAiSuggestedSkills] = useState<string[]>([]);
  const [showSkillsSuggestionDialog, setShowSkillsSuggestionDialog] = useState(false);
  const [tempSelectedAiSkills, setTempSelectedAiSkills] = useState<string[]>([]);


  const form = useForm<GigFormValues>({
    resolver: zodResolver(gigSchema),
    defaultValues: {
      title: '',
      description: '',
      budget: '' as unknown as number,
      deadline: undefined,
      requiredSkills: [],
    },
  });

  const gigDescription = form.watch('description');

  useEffect(() => {
    if (!authLoading) {
      if (!user || role !== 'client') {
        toast({ title: "Access Denied", description: "You must be logged in as a client to post a gig.", variant: "destructive"});
        router.push('/auth/login?redirect=/client/gigs/new');
      }
    }
  }, [authLoading, user, role, router, toast]);

  const handleAiSuggestSkills = async () => {
    const description = form.getValues('description');
    if (!description || description.length < 30) {
      toast({ title: "Description Too Short", description: "Please provide a more detailed description (at least 30 characters) for AI skill suggestions.", variant: "destructive" });
      return;
    }
    setIsSuggestingSkills(true);
    setAiSuggestedSkills([]);
    try {
      const result = await suggestGigSkills({ gigDescription: description });
      // Filter AI suggestions to only include those present in PREDEFINED_SKILLS (case-insensitive)
      const validSuggestions = result.suggestedSkills.filter(suggestedSkill =>
        PREDEFINED_SKILLS.some(predefinedSkill => predefinedSkill.toLowerCase() === suggestedSkill.toLowerCase())
      ).map(skill => { // Normalize to the casing in PREDEFINED_SKILLS
        return PREDEFINED_SKILLS.find(ps => ps.toLowerCase() === skill.toLowerCase()) || skill;
      });

      setAiSuggestedSkills(Array.from(new Set(validSuggestions))); // Remove duplicates
      setTempSelectedAiSkills(Array.from(new Set(validSuggestions))); // Pre-select all valid suggestions
      setShowSkillsSuggestionDialog(true);
    } catch (error: any) {
      console.error("AI Skill Suggestion Error:", error);
      toast({ title: "AI Suggestion Failed", description: error.message || "Could not fetch skill suggestions.", variant: "destructive" });
    } finally {
      setIsSuggestingSkills(false);
    }
  };

  const handleAddSelectedAiSkills = () => {
    const currentSkills = form.getValues('requiredSkills') || [];
    const newSkills = Array.from(new Set([...currentSkills, ...tempSelectedAiSkills]));
    // Respect max skills limit
    form.setValue('requiredSkills', newSkills.slice(0, 10) as Skill[], { shouldValidate: true });
    setShowSkillsSuggestionDialog(false);
    setTempSelectedAiSkills([]);
  };

  const onSubmit = async (data: GigFormValues) => {
    if (!user || role !== 'client') {
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
        currency: "INR",
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

  if (authLoading) {
    return (
       <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
    );
  }

  if (!user || role !== 'client') {
    return (
      <div className="flex flex-col justify-center items-center min-h-[calc(100vh-10rem)] text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Checking authorization...</p>
      </div>
    );
  }

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
                       <FormLabel>Budget (INR)</FormLabel>
                       <FormControl>
                         <Input type="number" placeholder="e.g., 10000" {...field} value={field.value ?? ''} min="1" step="any" />
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

              <FormField
                control={form.control}
                name="requiredSkills"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex justify-between items-center mb-1">
                      <FormLabel>Required Skills</FormLabel>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAiSuggestSkills}
                        disabled={isSuggestingSkills || !gigDescription || gigDescription.length < 30}
                      >
                        {isSuggestingSkills ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4 text-yellow-500" />}
                        AI Suggest Skills
                      </Button>
                    </div>
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

              <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Post Gig
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Dialog open={showSkillsSuggestionDialog} onOpenChange={setShowSkillsSuggestionDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>AI Skill Suggestions</DialogTitle>
            <DialogDescription>
              Based on your gig description, AI suggests these skills. Select the ones you'd like to add.
            </DialogDescription>
          </DialogHeader>
          {aiSuggestedSkills.length > 0 ? (
            <div className="grid gap-4 py-4 max-h-60 overflow-y-auto">
              {aiSuggestedSkills.map((skill) => (
                <div key={skill} className="flex items-center space-x-2">
                  <Checkbox
                    id={`ai-skill-${skill.replace(/\s+/g, '-')}`} // Create a unique ID for checkbox
                    checked={tempSelectedAiSkills.includes(skill)}
                    onCheckedChange={(checked) => {
                      setTempSelectedAiSkills(prev =>
                        checked
                          ? [...prev, skill]
                          : prev.filter(s => s !== skill)
                      );
                    }}
                  />
                  <label
                    htmlFor={`ai-skill-${skill.replace(/\s+/g, '-')}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {skill}
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No specific skill suggestions available from AI for this description, or suggestions were not in the predefined list. Please select skills manually.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSkillsSuggestionDialog(false)}>Cancel</Button>
            <Button onClick={handleAddSelectedAiSkills} disabled={tempSelectedAiSkills.length === 0 && aiSuggestedSkills.length > 0}>
                <Check className="mr-2 h-4 w-4" /> Add Selected ({tempSelectedAiSkills.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
