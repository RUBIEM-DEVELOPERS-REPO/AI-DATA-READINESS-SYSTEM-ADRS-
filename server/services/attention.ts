import { generateEmbedding } from "./embeddings";
import { ExtractionProfiles, ExtractionProfile, GenericProfile } from "../../shared/profiles";

export interface ProfileContext {
  profile: ExtractionProfile;
  similarityScore: number;
}

// Simple cosine similarity between two unit vectors (or approximate unit vectors)
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// In-memory cache for profile embeddings to save API calls
const profileEmbeddingsCache: Map<string, number[]> = new Map();

/**
 * Dynamically resolves the best extraction profile using zero-shot semantic matching.
 * This introduces "Dynamic Contextual Attention" into Layer 5.
 */
export async function resolveDynamicProfile(documentSummary: string, docTypeFallback: string): Promise<ProfileContext> {
  if (!documentSummary || documentSummary.trim() === "") {
    // Fallback to static matching if no summary provided
    const profile = ExtractionProfiles.find(p => p.documentFamilies.includes(docTypeFallback)) || GenericProfile;
    return { profile, similarityScore: 0.8 }; // Default scale
  }

  try {
    const docEmbedding = await generateEmbedding(documentSummary);

    let bestProfile = GenericProfile;
    let highestSimilarity = -1;

    for (const profile of ExtractionProfiles) {
      if (!profileEmbeddingsCache.has(profile.id)) {
        const emb = await generateEmbedding(profile.semanticDescription);
        profileEmbeddingsCache.set(profile.id, emb);
      }
      
      const profileEmb = profileEmbeddingsCache.get(profile.id)!;
      const sim = cosineSimilarity(docEmbedding, profileEmb);
      
      if (sim > highestSimilarity) {
        highestSimilarity = sim;
        bestProfile = profile;
      }
    }

    // A reasonable floor for similarity so we don't zero out confidences completely
    // OpenAI embeddings usually have high baseline similarity (~0.7), so we normalize slightly
    const normalizedScore = Math.min(1.0, Math.max(0.5, highestSimilarity));

    return { profile: bestProfile, similarityScore: normalizedScore };
  } catch (error) {
    console.error("[Attention Layer] Failed to resolve dynamic profile:", error);
    const profile = ExtractionProfiles.find(p => p.documentFamilies.includes(docTypeFallback)) || GenericProfile;
    return { profile, similarityScore: 0.8 };
  }
}
