import OpenAI from "openai";
import { db } from "../db";
import { chunkEmbeddings, extractionTexts, evidenceFiles } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

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

/**
 * Perform a semantic search across ingested documents using pgvector.
 * @param query The user's natural language question
 * @param limit Max number of results to return (default 5)
 * @returns Array of text chunks with their similarity score and source file name
 */
export async function semanticSearch(query: string, limit: number = 5) {
  if (!query || query.trim() === "") return [];

  // 1. Embed the query
  const queryVector = await generateEmbedding(query);

  // 2. Query the vector database (cosine distance)
  // Using sql template literal for pgvector distance operator <=>
  const similarity = sql<number>`1 - (${chunkEmbeddings.embedding} <=> ${JSON.stringify(queryVector)})`;

  try {
    const results = await db
      .select({
        score: similarity,
        text: extractionTexts.text,
        fileName: evidenceFiles.fileName,
        fileFormat: evidenceFiles.fileFormat,
      })
      .from(chunkEmbeddings)
      .innerJoin(extractionTexts, eq(chunkEmbeddings.extractionTextId, extractionTexts.id))
      .innerJoin(evidenceFiles, eq(chunkEmbeddings.evidenceId, evidenceFiles.id))
      .orderBy(sql`${chunkEmbeddings.embedding} <=> ${JSON.stringify(queryVector)}`)
      .limit(limit);

    return results;
  } catch (err: any) {
    console.error("[Semantic Search] Query failed:", err?.message || err);
    return [];
  }
}
