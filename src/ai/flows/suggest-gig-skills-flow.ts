
'use server';
/**
 * @fileOverview AI flow to suggest skills based on a gig description.
 *
 * - suggestGigSkills - A function that suggests relevant skills for a gig.
 * - SuggestGigSkillsInput - The input type for the suggestGigSkills function.
 * - SuggestGigSkillsOutput - The return type for the suggestGigSkills function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import { PREDEFINED_SKILLS } from '@/lib/constants';

// Prepare a snippet of predefined skills for the prompt to guide the AI
const skillExamples = PREDEFINED_SKILLS.slice(0, 15).join(', ');

// Internal Zod schema for input - not exported
const SuggestGigSkillsInputSchemaInternal = z.object({
  gigDescription: z
    .string()
    .min(30, { message: 'Description must be at least 30 characters for AI suggestion.' })
    .describe('The detailed description of the gig, used to suggest relevant skills.'),
});
export type SuggestGigSkillsInput = z.infer<typeof SuggestGigSkillsInputSchemaInternal>; // Export type

// Internal Zod schema for output - not exported
const SuggestGigSkillsOutputSchemaInternal = z.object({
  suggestedSkills: z
    .array(z.string())
    .max(7, { message: 'AI should suggest a maximum of 7 skills.'})
    .describe(
      'An array of 3 to 7 suggested skill strings relevant to the gig description. These skills should ideally be from or very similar to a predefined list of common freelance skills.'
    ),
});
export type SuggestGigSkillsOutput = z.infer<typeof SuggestGigSkillsOutputSchemaInternal>; // Export type

export async function suggestGigSkills(input: SuggestGigSkillsInput): Promise<SuggestGigSkillsOutput> {
  return suggestGigSkillsFlow(input);
}

const suggestSkillsPrompt = ai.definePrompt({
  name: 'suggestGigSkillsPrompt',
  input: { schema: SuggestGigSkillsInputSchemaInternal }, // Use internal schema
  output: { schema: SuggestGigSkillsOutputSchemaInternal }, // Use internal schema
  prompt: `You are an expert assistant helping users create effective job postings on a freelance platform.
Based on the following gig description, suggest between 3 and 5 relevant skills required for the gig.
The skills should be concise and commonly recognized in freelancing.

Here are some examples of the types of skills available on the platform:
"${skillExamples}"

Please try to suggest skills that are similar to these examples or would fit well within such a list.
Ensure your output is an array of skill strings.

Gig Description:
{{{gigDescription}}}

Analyze the description and provide your skill suggestions.
`,
});

const suggestGigSkillsFlow = ai.defineFlow(
  {
    name: 'suggestGigSkillsFlow',
    inputSchema: SuggestGigSkillsInputSchemaInternal, // Use internal schema
    outputSchema: SuggestGigSkillsOutputSchemaInternal, // Use internal schema
  },
  async (input) => {
    const { output } = await suggestSkillsPrompt(input);
    if (!output) {
      // Handle cases where the AI might not return an output as expected
      return { suggestedSkills: [] };
    }
    // Ensure the AI doesn't return more than a reasonable number (e.g. 7)
    // and filter for unique, non-empty strings
    const validatedSkills = Array.from(new Set(output.suggestedSkills.filter(skill => skill && skill.trim() !== ''))).slice(0, 7);
    return { suggestedSkills: validatedSkills };
  }
);
