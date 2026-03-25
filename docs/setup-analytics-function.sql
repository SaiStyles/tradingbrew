-- Run this once in Supabase SQL Editor
-- Required for Conversational Analytics (Query Agent)

CREATE OR REPLACE FUNCTION run_analytics_query(query_sql TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Only allow SELECT
  IF NOT (lower(trim(query_sql)) LIKE 'select %') THEN
    RAISE EXCEPTION 'Only SELECT queries allowed';
  END IF;

  -- Block dangerous keywords
  IF lower(query_sql) ~ '\m(insert|update|delete|drop|create|alter|truncate|execute|pg_)\M' THEN
    RAISE EXCEPTION 'Forbidden keyword in query';
  END IF;

  EXECUTE format(
    'SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json) FROM (%s) t',
    query_sql
  ) INTO result;

  RETURN result;
END;
$$;
