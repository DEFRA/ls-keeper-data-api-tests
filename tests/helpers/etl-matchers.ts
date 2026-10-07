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
  cts_location_identifiers: 'LID_ID',
  cts_locations: 'LOC_ID',
  cts_counties: 'CTY_ID',
  cts_addresses: 'ADR_ID',
  cts_parties: 'PAR_ID',
  cts_location_party_rels: 'LPR_ID',
  amls2_common_land: 'COMMON_LAND_PREMISE_ID',
  amls2_port: 'CPH',
  ames_haulier: 'HAULIER_ID'
}

/**
 * Ingestion control columns stripped during ETL processing that do not exist in DuckDB
 */
export const DEFAULT_IGNORED_FIELDS = new Set([
  'CHANGE_TYPE',
  'LID_AUD_ID',
  'LID_AUD_TYPE',
  'LID_AUD_DATETIME',
  'LOC_AUD_ID',
  'LOC_AUD_TYPE',
  'LOC_AUD_DATETIME',
  'LPR_AUD_ID',
  'LPR_AUD_TYPE',
  'LPR_AUD_DATETIME',
  'PAR_AUD_ID',
  'PAR_AUD_TYPE',
  'PAR_AUD_DATETIME',
  'ADR_AUD_ID',
  'ADR_AUD_TYPE',
  'ADR_AUD_DATETIME',
  'CTY_AUD_ID',
  'CTY_AUD_TYPE',
  'CTY_AUD_DATETIME',
  'RECORD_TYPE',
  'RECORD_COUNT'
])

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
  pk: string,
  dataset?: string
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
      const audTypeKey = Object.keys(d).find((k) =>
        /(^change_type$|_aud_type$)/i.test(k)
      )
      const type = (audTypeKey ? d[audTypeKey] : 'I').toUpperCase().trim()
      const id = String(d[pk] ?? '').trim()
      if (type === 'U' || type === 'I') {
        map.set(id, { ...map.get(id), ...d })
      } else if (type === 'D') {
        // For CTS datasets, 'D' (deletes) are processed per LKPR-211
        if (dataset?.startsWith('cts_')) {
          map.delete(id)
        }
        // For legacy SAM/AMLS2 datasets, 'D' is ignored per LKPR-88
      }
    }
  }
  return Array.from(map.values())
}

const ORACLE_MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC'
]

/**
 * Normalizes values between raw CSV text and typed DuckDB storage.
 *
 * WHY THIS IS NEEDED:
 * Legacy CTS / CADS CSV fixtures store dates in Oracle format (e.g. '01-JUL-96' or '11-SEP-02').
 * In LKPR-263 / LKPR-268, the Data Bridge ETL pipeline was updated to strongly type Parquet and
 * DuckDB tables, which automatically standardizes dates to ISO-8601 ('YYYY-MM-DD', e.g. '1996-07-01').
 * To avoid false assertion failures caused solely by date formatting differences, this function
 * normalizes Oracle date strings to ISO-8601 so Playwright compares their semantic values.
 *
 * HOW IT WORKS:
 * 1. Checks for 3 hyphen-separated parts (e.g. '01-JUL-96' -> ['01', 'JUL', '96']).
 * 2. Matches the middle segment against standard three-letter month abbreviations.
 * 3. Expands 2-digit years using standard POSIX pivot rules (>= 50 -> 1900s, < 50 -> 2000s).
 * 4. Returns 'YYYY-MM-DD'. Non-date values and nulls are returned cleanly as-is.
 */
function normalizeValue(val: unknown): string | null {
  if (val === '' || val === null || val === undefined) return null
  const str = String(val).trim()

  const parts = str.split('-')
  if (parts.length === 3) {
    const [day, mon, rawYear] = parts
    const monthIndex = ORACLE_MONTHS.indexOf(mon.toUpperCase())

    if (monthIndex !== -1) {
      const yearPart = rawYear.trim().split(' ')[0]
      const y = parseInt(yearPart, 10)
      const fullYear =
        yearPart.length === 2 ? (y >= 50 ? 1900 + y : 2000 + y) : y
      const mm = String(monthIndex + 1).padStart(2, '0')
      const dd = day.padStart(2, '0')
      return `${fullYear}-${mm}-${dd}`
    }
  }

  return str
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
      ? foldDeltas(expectedRows, options.deltas, pk, options.dataset)
      : expectedRows

    const normalizeRow = (row: Record<string, unknown>) => {
      const clean: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) {
        if (DEFAULT_IGNORED_FIELDS.has(k)) continue
        clean[k] = normalizeValue(v)
      }
      return clean
    }

    // 3. Strip ingestion control columns and normalize empty values
    const cleanExpected = expected.map(normalizeRow)
    const cleanActual = actualRows.map(normalizeRow)

    // CRITICAL: Verify DuckDB contains all expected records
    expect(cleanActual.length).toBeGreaterThanOrEqual(cleanExpected.length)

    // 4. Order-agnostic native Playwright full-dataset matching
    expect(cleanActual).toEqual(expect.arrayContaining(cleanExpected))

    return {
      pass: true,
      message: () =>
        `All ${cleanExpected.length} records match 1:1 in DuckDB (order-agnostic).`
    }
  }
})
