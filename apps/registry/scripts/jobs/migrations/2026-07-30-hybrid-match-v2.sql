-- Hybrid retrieval v2 — fixes a statement timeout in match_jobs_v5_hybrid.
--
-- v1's FTS arm used the GIN index over ALL-TIME rows: a 25-term OR query
-- matches common words ("react") across the whole table, and ts_rank_cd +
-- row_number then sorted hundreds of thousands of rows before the date
-- filter applied. v2 materializes the recent window first (~1-2k rows for a
-- 90-120 day corpus) and computes both arms over it exactly — predictable
-- milliseconds at this scale, no index dependence.
--
-- Applied to prod via the Supabase Management API on 2026-07-30.
-- Rollback: re-apply 2026-07-22-hybrid-match.sql (v1 function body).

CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at DESC);

CREATE OR REPLACE FUNCTION public.match_jobs_v5_hybrid(
  query_embedding vector,
  query_text text,
  match_count integer,
  created_after timestamp without time zone
)
RETURNS TABLE(id bigint, similarity double precision, rrf_score double precision)
LANGUAGE sql
STABLE
AS $function$
  WITH recent AS MATERIALIZED (
    SELECT jobs.id, jobs.content, jobs.embedding_v5
    FROM jobs
    WHERE jobs.created_at > created_after
      AND jobs.embedding_v5 IS NOT NULL
  ),
  vec AS (
    SELECT recent.id,
           1 - (recent.embedding_v5 <=> query_embedding) AS similarity,
           row_number() OVER (ORDER BY recent.embedding_v5 <=> query_embedding ASC) AS vrank
    FROM recent
    ORDER BY recent.embedding_v5 <=> query_embedding ASC
    LIMIT match_count
  ),
  fts AS (
    SELECT recent.id,
           row_number() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('english', coalesce(recent.content, '')),
               websearch_to_tsquery('english', query_text)
             ) DESC
           ) AS trank
    FROM recent
    WHERE query_text <> ''
      AND to_tsvector('english', coalesce(recent.content, ''))
          @@ websearch_to_tsquery('english', query_text)
    LIMIT match_count
  )
  SELECT COALESCE(vec.id, fts.id) AS id,
         COALESCE(vec.similarity, 0) AS similarity,
         COALESCE(1.0 / (60 + vec.vrank), 0) +
         COALESCE(1.0 / (60 + fts.trank), 0) AS rrf_score
  FROM vec
  FULL OUTER JOIN fts ON vec.id = fts.id
  ORDER BY rrf_score DESC
  LIMIT match_count;
$function$;
