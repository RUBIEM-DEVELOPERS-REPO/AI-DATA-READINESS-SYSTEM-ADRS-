import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

/**
 * Generate a vector embedding for a given text string.
 * Uses the configured OpenAI API to return an array of floats.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim() === "") {
    return new Array(1536).fill(0);
  }
  
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small", // You can configure this via env vars later
      input: text.slice(0, 8000), // Max tokens safeguard
    });
    
    return response.data[0].embedding;
  } catch (err: any) {
    console.error("[Embeddings] Error generating embedding:", err?.message || err);
    // Return a zero vector on failure so the system doesn't crash, but log the error
    return new Array(1536).fill(0);
  }
}
