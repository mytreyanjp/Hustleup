
import {genkit, Genkit} from 'genkit'; // Import Genkit type
import {googleAI} from '@genkit-ai/googleai';

function getApiKeyGracefully(): string | undefined {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "HUSTLEUP_WARNING: GOOGLE_GENAI_API_KEY environment variable is not set. " +
      "Genkit AI features depending on Google AI will NOT work. " +
      "Ensure this variable is set in your server environment (e.g., Cloud Function environment variables)."
    );
    return undefined;
  }
  return apiKey;
}

const apiKeyForPlugin = getApiKeyGracefully();

const genkitPlugins = [];
let defaultModel: string | undefined = undefined;

if (apiKeyForPlugin) {
  genkitPlugins.push(googleAI({ apiKey: apiKeyForPlugin }));
  defaultModel = 'googleai/gemini-pro'; // Set default model only if plugin is active
  console.log("HUSTLEUP_INFO: Google AI plugin for Genkit initialized with API key.");
} else {
  console.error(
    "CRITICAL HUSTLEUP_ERROR: GOOGLE_GENAI_API_KEY is MISSING. " +
    "Google AI plugin for Genkit is NOT initialized. AI features will be non-functional. " +
    "THIS IS A LIKELY CAUSE FOR SERVER ERRORS IF AI FEATURES ARE USED."
  );
  // No plugins are added, and no Google AI model is set as default.
  // Genkit will be initialized with an empty plugin array.
}

// Explicitly type 'ai' if possible, otherwise 'any' might be necessary
// depending on the exact export structure of 'genkit'.
export const ai: Genkit = genkit({
  promptDir: './prompts',
  plugins: genkitPlugins,
  // Conditionally add the model property only if defaultModel is set
  ...(defaultModel && { model: defaultModel }),
});
