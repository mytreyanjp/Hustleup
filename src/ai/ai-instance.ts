
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

function getApiKeyGracefully(): string | undefined {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "HUSTLEUP_WARNING: GOOGLE_GENAI_API_KEY environment variable is not set. " +
      "Genkit AI features may not work correctly or at all. " +
      "Ensure this variable is set in your server environment (e.g., Cloud Function environment variables)."
    );
    return undefined; // Explicitly return undefined
  }
  return apiKey;
}

const apiKeyForPlugin = getApiKeyGracefully();

export const ai = genkit({
  promptDir: './prompts', // This is not used by definePrompt, but good to keep
  plugins: [
    googleAI({
      // IMPORTANT: This API key is read from the GOOGLE_GENAI_API_KEY environment variable.
      // Ensure it's set in your .env.local file for local development AND
      // in your Cloud Function's environment variables for deployed environments.
      apiKey: apiKeyForPlugin,
    }),
  ],
  // Default model for generate() calls if not specified, can be overridden.
  // For definePrompt, the model used depends on the plugin capabilities.
  // If GOOGLE_GENAI_API_KEY is for Gemini, Gemini models will be used.
  // Changed from gemini-1.5-flash-latest due to "Model not found" error.
  model: 'googleai/gemini-pro',
});

