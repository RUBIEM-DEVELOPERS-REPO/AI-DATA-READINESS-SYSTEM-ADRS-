import { pipeline } from "@xenova/transformers";
import { db } from "../db";
import { chunkEmbeddings, extractionTexts, evidenceFiles } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

let extractorInstance: any = null;

async function getExtractor() {
  if (!extractorInstance) {
    console.log("[Embeddings] Initializing local all-MiniLM-L6-v2 model...");
    extractorInstance = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractorInstance;
}

/**
 * Generate a vector embedding for a given text string.
 * Uses local all-MiniLM-L6-v2 model via transformers.js.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim() === "") {
    return new Array(384).fill(0);
  }
  
  try {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    
    return Array.from(output.data) as number[];
  } catch (err: any) {
    console.error("[Embeddings] Error generating embedding:", err?.message || err);
    // Return a zero vector on failure so the system doesn't crash, but log the error
    return new Array(384).fill(0);
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
