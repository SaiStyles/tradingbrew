import { createClient } from '@/lib/supabase/server'

/**
 * Executes a SELECT-only analytics query for the given user.
 *
 * Requires this function in Supabase (run once in SQL editor):
 *
 * CREATE OR REPLACE FUNCTION run_analytics_query(query_sql TEXT)
 * RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
 * DECLARE result JSON;
 * BEGIN
 *   IF NOT (lower(trim(query_sql)) LIKE 'select %') THEN
 *     RAISE EXCEPTION 'Only SELECT queries allowed';
 *   END IF;
 *   IF lower(query_sql) ~ '(insert|update|delete|drop|create|alter|truncate|pg_)' THEN
 *     RAISE EXCEPTION 'Forbidden keywords in query';
 *   END IF;
 *   EXECUTE format('SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json) FROM (%s) t', query_sql)
 *   INTO result;
 *   RETURN result;
 * END; $$;
 */
export async function runAnalyticsQuery(
  userId: string,
  rawSql: string
): Promise<{ results: Record<string, unknown>[]; error?: string }> {
  // Hard validate SELECT-only before sending to DB
  const trimmed = rawSql.trim().toLowerCase()
  if (!trimmed.startsWith('select')) {
    return { results: [], error: 'Only SELECT queries allowed' }
  }

  // Inject user_id scope — find the first WHERE clause or add one
  let sql = injectUserIdFilter(rawSql, userId)

  // Ensure LIMIT exists for non-aggregate queries
  if (!trimmed.includes('limit')) {
    sql = sql.trimEnd() + ' LIMIT 100'
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('run_analytics_query', { query_sql: sql })

    if (error) {
      console.error('[run-analytics] rpc error:', error)
      return { results: [], error: error.message }
    }

    const results = Array.isArray(data) ? data : []
    return { results }
  } catch (e) {
    console.error('[run-analytics] unexpected error:', e)
    return { results: [], error: 'Query execution failed' }
  }
}

/**
 * Injects user_id filter into the SQL WHERE clause.
 * Adds "user_id = '<uuid>'" to existing WHERE or adds a new WHERE clause.
 */
function injectUserIdFilter(sql: string, userId: string): string {
  const safeId = userId.replace(/[^a-f0-9-]/gi, '') // UUID chars only
  const userFilter = `user_id = '${safeId}'`

  // If there's already a WHERE clause, prepend our filter
  const whereMatch = sql.match(/\bwhere\b/i)
  if (whereMatch && whereMatch.index !== undefined) {
    const insertAt = whereMatch.index + whereMatch[0].length
    return sql.slice(0, insertAt) + ` ${userFilter} AND` + sql.slice(insertAt)
  }

  // No WHERE — insert before GROUP BY, ORDER BY, LIMIT, or at end
  const insertBefore = sql.search(/\b(group\s+by|order\s+by|limit|having)\b/i)
  if (insertBefore !== -1) {
    return sql.slice(0, insertBefore) + `WHERE ${userFilter} ` + sql.slice(insertBefore)
  }

  return sql + ` WHERE ${userFilter}`
}
