-- Run this in your Supabase SQL Editor before deploying
-- ============================================================
-- AI Incident Platform — Supabase pgvector Setup
-- ============================================================

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing table if re-running
DROP TABLE IF EXISTS knowledge_vectors;

-- Create knowledge vectors table (768-dim for nomic-embed-text)
CREATE TABLE knowledge_vectors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dynamo_id   TEXT NOT NULL UNIQUE,     -- Links to DynamoDB KnowledgeTable
  content     TEXT NOT NULL,            -- Root cause + resolution text
  embedding   vector(768),              -- nomic-embed-text-v1_5 dimensions
  metadata    JSONB DEFAULT '{}',       -- title, rootCause, resolution, technology[], successCount
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- IVFFlat index for fast cosine similarity search
-- (lists = 100 is good for up to ~1M rows; reduce for smaller datasets)
CREATE INDEX ON knowledge_vectors
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- RPC function used by VectorStore.ts to perform similarity search
CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding  vector(768),
  match_threshold  float DEFAULT 0.6,
  match_count      int   DEFAULT 5
)
RETURNS TABLE (
  id         UUID,
  dynamo_id  TEXT,
  content    TEXT,
  similarity float,
  metadata   JSONB
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    dynamo_id,
    content,
    1 - (embedding <=> query_embedding) AS similarity,
    metadata
  FROM knowledge_vectors
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Enable Row Level Security (recommended for Supabase)
ALTER TABLE knowledge_vectors ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (used by Lambda via SUPABASE_KEY)
CREATE POLICY "Service role full access"
  ON knowledge_vectors
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Verify setup
SELECT 'Supabase pgvector setup complete!' as status;
