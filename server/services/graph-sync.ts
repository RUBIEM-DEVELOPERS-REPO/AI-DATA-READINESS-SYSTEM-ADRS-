import { db } from "../db";
import { kgNodes, kgEdges } from "@shared/schema";
import { generateKgGraph } from "./publishing";
import { storage } from "../storage";
import { sql } from "drizzle-orm";

/**
 * Synchronizes the Live Knowledge Graph (Layer 7).
 * Reads all resolved entities (Layer 5/6), builds the global graph, 
 * and UPSERTs into the live kg_nodes and kg_edges tables.
 */
export async function syncLiveKnowledgeGraph() {
  console.log("[Graph Sync] Starting live Knowledge Graph synchronisation...");

  try {
    // 1. Fetch all Golden Records / resolved entities
    const entities = await storage.getCdmEntities();
    
    // 2. Generate the graph records using the existing logic 
    //    (deduplication, semantic relationship inference)
    const graphRecords = generateKgGraph(entities, "live");

    const nodes = graphRecords.filter(r => r.record_type === "NODE");
    const edges = graphRecords.filter(r => r.record_type === "EDGE");

    console.log(`[Graph Sync] Computed ${nodes.length} nodes and ${edges.length} edges.`);

    // 3. UPSERT Nodes
    for (const node of nodes) {
      await db.insert(kgNodes).values({
        id: node.id!,
        label: node.label!,
        displayName: node.properties?.display_name || "Unknown",
        properties: node.properties,
        confidenceScore: node.properties?.confidence_score ?? 0,
      }).onConflictDoUpdate({
        target: kgNodes.id,
        set: {
          label: node.label!,
          displayName: node.properties?.display_name || "Unknown",
          properties: node.properties,
          confidenceScore: node.properties?.confidence_score ?? 0,
          updatedAt: sql`now()`,
        }
      });
    }

    // 4. UPSERT Edges
    for (const edge of edges) {
      if (!edge.from || !edge.to) continue;

      await db.insert(kgEdges).values({
        id: edge.id!,
        sourceId: edge.from,
        targetId: edge.to,
        relationshipType: edge.type_label!,
        confidence: edge.properties?.confidence ?? 0,
        properties: edge.properties,
      }).onConflictDoUpdate({
        target: kgEdges.id,
        set: {
          sourceId: edge.from,
          targetId: edge.to,
          relationshipType: edge.type_label!,
          confidence: edge.properties?.confidence ?? 0,
          properties: edge.properties,
          updatedAt: sql`now()`,
        }
      });
    }

    console.log("[Graph Sync] Live Knowledge Graph synchronisation complete!");
  } catch (err) {
    console.error("[Graph Sync] Error synchronizing graph:", err);
  }
}
