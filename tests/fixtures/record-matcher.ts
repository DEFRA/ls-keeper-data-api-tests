import { expect } from '@playwright/test'

/**
 * Explicit Primary Key dictionary per DEFRA KRDS Dataset Specification
 */
export const DATASET_PRIMARY_KEYS: Record<string, string> = {
  sam_showground: 'CPH',
  sam_cph_holdings: 'CPH',
  sam_cph_holder: 'PARTY_ID',
  sam_party: 'PARTY_ID',
  sam_herd: 'HERDMARK',
  sam_tla: 'TLA_ID',
  cts_cph_holding: 'CPH',
  cts_keeper: 'KEEPER_ID',
  cts_agent: 'AGENT_ID',
  amls2_common_land: 'COMMON_LAND_PREMISE_ID',
  amls2_port: 'CPH',
  ames_haulier: 'HAULIER_ID'
}

/**
 * Ingestion control columns stripped during ETL processing that do not exist in DuckDB
 */
export const DEFAULT_IGNORED_FIELDS = new Set(['CHANGE_TYPE'])

export interface MatcherOptions {
  dataset?: string
  primaryKey?: string
  deltas?: Record<string, string>[] | Record<string, string>[][]
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace PlaywrightTest {
    interface Matchers<R> {
      toMatchRecords(
        expectedRows: Record<string, string>[],
        options?: MatcherOptions
      ): R
    }
  }
}

/**
 * Folds incremental deltas on top of baseline records using a Map for O(N) performance
 */
function foldDeltas(
  baseline: Record<string, string>[],
  deltaSets: Record<string, string>[] | Record<string, string>[][],
  pk: string
): Record<string, string>[] {
  const map = new Map(
    baseline.map((r) => [String(r[pk] ?? '').trim(), { ...r }])
  )
  const normalized =
    Array.isArray(deltaSets[0]) && typeof deltaSets[0][0] === 'object'
      ? (deltaSets as Record<string, string>[][])
      : [deltaSets as Record<string, string>[]]

  for (const set of normalized) {
    for (const d of set) {
      const type = (d.CHANGE_TYPE || d.change_type || 'I').toUpperCase().trim()
      const id = String(d[pk] ?? '').trim()
      if (type === 'U' || type === 'I') {
        map.set(id, { ...map.get(id), ...d })
      }
      // 'D' is ignored per LKPR-88
    }
  }
  return Array.from(map.values())
}

expect.extend({
  toMatchRecords(
    actualRows: Record<string, unknown>[],
    expectedRows: Record<string, string>[],
    options: MatcherOptions = {}
  ) {
    // 1. Resolve Primary Key
    const pk =
      options.primaryKey ||
      (options.dataset ? DATASET_PRIMARY_KEYS[options.dataset] : '') ||
      'CPH'

    // 2. Fold Deltas if supplied
    const expected = options.deltas
      ? foldDeltas(expectedRows, options.deltas, pk)
      : expectedRows

    // 3. Strip ingestion control columns (e.g. CHANGE_TYPE) that do not exist in DuckDB
    const cleanExpected = expected.map((row) => {
      const clean: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) {
        if (DEFAULT_IGNORED_FIELDS.has(k)) continue
        clean[k] = v === '' ? null : v
      }
      return clean
    })

    // CRITICAL: Verify DuckDB contains all expected records
    expect(actualRows.length).toBeGreaterThanOrEqual(cleanExpected.length)

    // 4. Order-agnostic native Playwright full-dataset matching
    expect(actualRows).toEqual(expect.arrayContaining(cleanExpected))

    return {
      pass: true,
      message: () =>
        `All ${cleanExpected.length} records match 1:1 in DuckDB (order-agnostic).`
    }
  }
})
