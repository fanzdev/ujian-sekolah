-- Migration 00046: AI Generations tracking table
-- Stores audit trail of all AI-generated content for teachers

CREATE TABLE IF NOT EXISTS ai_generations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature       TEXT NOT NULL,
  prompt_hash   TEXT NOT NULL,
  model_used    TEXT NOT NULL,
  tokens_input  INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  response_text TEXT,
  result_json   JSONB,
  status        TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ai_generations IS 'Audit log untuk semua generasi AI Veyra';

CREATE INDEX IF NOT EXISTS ai_generations_tenant_id_created_at_idx ON ai_generations (tenant_id DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_generations_feature_idx ON ai_generations (feature);
CREATE INDEX IF NOT EXISTS ai_generations_prompt_hash_idx ON ai_generations (prompt_hash);

ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_generations_tenant_select" ON ai_generations;
CREATE POLICY "ai_generations_tenant_select" ON ai_generations
  FOR SELECT USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "ai_generations_tenant_insert" ON ai_generations;
CREATE POLICY "ai_generations_tenant_insert" ON ai_generations
  FOR INSERT WITH CHECK (tenant_id = auth.uid());

DROP POLICY IF EXISTS "ai_generations_owner_update" ON ai_generations;
CREATE POLICY "ai_generations_owner_update" ON ai_generations
  FOR UPDATE USING (tenant_id = auth.uid());

DROP POLICY IF EXISTS "ai_generations_owner_delete" ON ai_generations;
CREATE POLICY "ai_generations_owner_delete" ON ai_generations
  FOR DELETE USING (tenant_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'purge_old_ai_generations'
  ) THEN
    CREATE OR REPLACE FUNCTION purge_old_ai_generations()
    RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
      DELETE FROM ai_generations
      WHERE created_at < now() - INTERVAL '6 months';
      RETURN ROW_COUNT();
    $$;
  END IF;
END
$$;
