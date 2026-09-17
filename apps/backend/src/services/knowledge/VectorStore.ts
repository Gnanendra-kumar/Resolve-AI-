import { createClient } from "@supabase/supabase-js";
import { KnowledgeEntry } from "@aiops/types";

// Supabase JS v2 always initializes a Realtime client which expects WebSocket.
// In Node 20 environment (AWS Lambda), WebSocket is not globally defined, which crashes the initialization.
// We define a dummy class since we only use Supabase REST/Database features, not Realtime.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = class {};
}

const supabase = createClient(
  process.env.SUPABASE_URL || "https://dummy.supabase.co",
  process.env.SUPABASE_KEY || "dummy-key"
);

export interface VectorSearchResult {
  id: string;
  dynamo_id: string;
  content: string;
  similarity: number;
  metadata: {
    title: string;
    rootCause: string;
    resolution: string;
    technology: string[];
    successCount: number;
  };
}

// ─── Upsert an embedding into Supabase ───────────────────────────────────────

export async function upsertEmbedding(
  dynamoId: string,
  content: string,
  embedding: number[],
  metadata: {
    title: string;
    rootCause: string;
    resolution: string;
    technology: string[];
    successCount: number;
  }
): Promise<string> {
  if (process.env.MOCK_DB === "true" || !process.env.SUPABASE_URL) {
    console.log(`[VectorStore][MOCK] Bypassing Supabase embedding upsert for id: ${dynamoId}`);
    return "mock-supabase-vector-id";
  }
  const { data, error } = await supabase
    .from("knowledge_vectors")
    .upsert(
      {
        dynamo_id: dynamoId,
        content,
        embedding,
        metadata,
      },
      { onConflict: "dynamo_id" }
    )
    .select("id")
    .single();

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  return data.id;
}

// ─── Semantic search using cosine similarity ──────────────────────────────────

export async function searchSimilar(
  queryEmbedding: number[],
  threshold = 0.7,
  limit = 5
): Promise<VectorSearchResult[]> {
  if (process.env.MOCK_DB === "true" || !process.env.SUPABASE_URL) {
    console.log("[VectorStore][MOCK] Bypassing Supabase similarity search.");
    return [];
  }
  const { data, error } = await supabase.rpc("match_knowledge", {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) throw new Error(`Supabase vector search failed: ${error.message}`);
  return (data as VectorSearchResult[]) || [];
}

// ─── Delete an entry by dynamoId ──────────────────────────────────────────────

export async function deleteEmbedding(dynamoId: string): Promise<void> {
  if (process.env.MOCK_DB === "true" || !process.env.SUPABASE_URL) {
    console.log(`[VectorStore][MOCK] Bypassing Supabase delete for id: ${dynamoId}`);
    return;
  }
  const { error } = await supabase
    .from("knowledge_vectors")
    .delete()
    .eq("dynamo_id", dynamoId);

  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}

// ─── Update success count ─────────────────────────────────────────────────────

export async function incrementSuccessCount(dynamoId: string): Promise<void> {
  if (process.env.MOCK_DB === "true" || !process.env.SUPABASE_URL) {
    console.log(`[VectorStore][MOCK] Bypassing Supabase increment success count for id: ${dynamoId}`);
    return;
  }
  const { data: existing } = await supabase
    .from("knowledge_vectors")
    .select("metadata")
    .eq("dynamo_id", dynamoId)
    .single();

  if (!existing) return;

  const updatedMeta = {
    ...existing.metadata,
    successCount: (existing.metadata.successCount || 0) + 1,
  };

  await supabase
    .from("knowledge_vectors")
    .update({ metadata: updatedMeta })
    .eq("dynamo_id", dynamoId);
}
