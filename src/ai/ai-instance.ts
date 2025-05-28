
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  promptDir: './prompts', // This is not used by definePrompt, but good to keep
  plugins: [
    googleAI({
      // IMPORTANT: This API key is read from the GOOGLE_GENAI_API_KEY environment variable.
      // Ensure it's set in your .env.local file for local development.
      // Example: GOOGLE_GENAI_API_KEY="YOUR_ACTUAL_GOOGLE_AI_KEY"
      apiKey: process.env.GOOGLE_GENAI_API_KEY, 
    }),
  ],
  // Default model for generate() calls if not specified, can be overridden.
  // For definePrompt, the model used depends on the plugin capabilities.
  // If GOOGLE_GENAI_API_KEY is for Gemini, Gemini models will be used.
  model: 'googleai/gemini-1.5-flash-latest', // Set a default model
});

