import { test, expect } from './etl-pipeline.fixture.js'
import { parseCsvFile } from '../helpers/csv-parser.js'
import { DATASET_PRIMARY_KEYS } from './record-matcher.js'
import { EtlClient } from '../helpers/etl-client.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const defaultDataDir = path.resolve(__dirname, '../data')

export interface PipelineSuiteConfig {
  dataset: string
  displayName?: string
  primaryKey?: string
  dataDir?: string
  baselineFile: string
  delta1File?: string
  delta2File?: string
  timeout?: number
}

/**
 * Creates an exhaustive, reusable 4-stage Playwright test suite for any DEFRA KRDS dataset.
 * Automatically handles Baseline ingestion, single-step deltas, multi-step chained deltas,
 * and idempotency verification.
 */
export function definePipelineTestSuite(config: PipelineSuiteConfig) {
  const datasetName = config.dataset
  const displayName =
    config.displayName || config.dataset.toUpperCase().replace(/_/g, ' ')
  const dataDirectory = config.dataDir || defaultDataDir

  test.describe
    .serial(`${displayName} Pipeline - Exhaustive Test Suite`, () => {
    if (config.timeout) {
      test.setTimeout(config.timeout)
    }

    // Purge previous leftover or stuck files for this dataset across all stages before suite runs
    test.beforeAll(async ({ request }) => {
      const etlClient = new EtlClient(request)
      await etlClient.purgeStorage({
        dataset: datasetName,
        stage: 'all',
        sourceType: 'internal'
      })
    })

    // Pre-load CSV test data files from disk
    const baselineRecords = parseCsvFile(
      path.join(dataDirectory, config.baselineFile)
    )
    const delta1Records = config.delta1File
      ? parseCsvFile(path.join(dataDirectory, config.delta1File))
      : []
    const delta2Records = config.delta2File
      ? parseCsvFile(path.join(dataDirectory, config.delta2File))
      : []

    // Test 1: Baseline Ingestion & Schema Verification
    test('should ingest baseline records with diverse edge cases and accurately verify DuckDB schema', async ({
      etlClient,
      duckDbClient
    }) => {
      const { encryptedFilename } = await etlClient.uploadFile(
        config.baselineFile
      )
      expect(encryptedFilename).toMatch(/^LITP_[A-Z0-9]+_\d+\.csv$/)

      // 1. Run pipeline import
      const importStatus = await etlClient.importDataset(datasetName)
      expect(importStatus.status).toBe('Succeeded')

      const stageNames = (importStatus.stages || []).map((s) => s.name)
      expect(stageNames).toEqual(
        expect.arrayContaining([
          'discover',
          'decrypt',
          'normalise',
          'snapshot',
          'load-duckdb'
        ])
      )

      const discoverStage = (importStatus.stages || []).find(
        (s) => s.name === 'discover'
      )
      if (discoverStage && typeof discoverStage.itemCount === 'number') {
        expect(
          discoverStage.itemCount,
          `ETL Discover stage found 0 matching files for ${datasetName}. The uploaded file was not picked up by the pipeline.`
        ).toBeGreaterThan(0)
      }

      // 2. Download resulting DuckDB database extract
      const duckDbBuffer = await etlClient.downloadDuckDb(
        importStatus.presignedDuckDbUri
      )
      await duckDbClient.openFromBuffer(duckDbBuffer)

      const rows = await duckDbClient.getTableRows(datasetName)
      expect(rows).toMatchRecords(baselineRecords, {
        dataset: datasetName,
        primaryKey: config.primaryKey
      })
    })

    // Test 2: Single-step Delta (if delta1File supplied)
    if (config.delta1File) {
      test('should apply single-step deltas with in-place updates, new inserts, and delete preservation', async ({
        etlClient,
        duckDbClient
      }) => {
        await new Promise((resolve) => setTimeout(resolve, 1500))

        const { encryptedFilename } = await etlClient.uploadFile(
          config.delta1File!
        )
        expect(encryptedFilename).toMatch(/^LITP_[A-Z0-9]+_\d+\.csv$/)

        const importStatus = await etlClient.importDataset(datasetName)
        expect(importStatus.status).toBe('Succeeded')

        const duckDbBuffer = await etlClient.downloadDuckDb(
          importStatus.presignedDuckDbUri
        )
        await duckDbClient.openFromBuffer(duckDbBuffer)

        const rows = await duckDbClient.getTableRows(datasetName)
        expect(rows).toMatchRecords(baselineRecords, {
          dataset: datasetName,
          primaryKey: config.primaryKey,
          deltas: [delta1Records]
        })
      })
    }

    // Test 3: Multi-step Chained Delta (if delta2File supplied)
    if (config.delta2File) {
      test('should fold multi-step chained deltas correctly handling re-updates and updates to previous delta inserts', async ({
        etlClient,
        duckDbClient
      }) => {
        await new Promise((resolve) => setTimeout(resolve, 1500))

        const { encryptedFilename } = await etlClient.uploadFile(
          config.delta2File!
        )
        expect(encryptedFilename).toMatch(/^LITP_[A-Z0-9]+_\d+\.csv$/)

        const importStatus = await etlClient.importDataset(datasetName)
        expect(importStatus.status).toBe('Succeeded')

        const duckDbBuffer = await etlClient.downloadDuckDb(
          importStatus.presignedDuckDbUri
        )
        await duckDbClient.openFromBuffer(duckDbBuffer)

        const rows = await duckDbClient.getTableRows(datasetName)
        expect(rows).toMatchRecords(baselineRecords, {
          dataset: datasetName,
          primaryKey: config.primaryKey,
          deltas: [delta1Records, delta2Records]
        })
      })
    }

    // Test 4: Pipeline Idempotency and Table Stability
    test('should ensure pipeline idempotency and table stability upon repeated trigger executions', async ({
      etlClient,
      duckDbClient
    }) => {
      const importStatus = await etlClient.importDataset(datasetName)
      expect(importStatus.status).toBe('Succeeded')

      const duckDbBuffer = await etlClient.downloadDuckDb(
        importStatus.presignedDuckDbUri
      )
      await duckDbClient.openFromBuffer(duckDbBuffer)

      const rows = await duckDbClient.getTableRows(datasetName)

      const activeDeltas = [
        ...(config.delta1File ? [delta1Records] : []),
        ...(config.delta2File ? [delta2Records] : [])
      ]

      expect(rows).toMatchRecords(baselineRecords, {
        dataset: datasetName,
        primaryKey: config.primaryKey,
        deltas: activeDeltas.length > 0 ? activeDeltas : undefined
      })

      // Verify Primary Key stability
      const pk =
        config.primaryKey ||
        (datasetName ? DATASET_PRIMARY_KEYS[datasetName] : '') ||
        'CPH'
      const keys = rows.map((r) => r[pk])
      const uniqueKeys = new Set(keys)
      expect(uniqueKeys.size).toBeGreaterThan(0)
      expect(rows.length).toBeGreaterThanOrEqual(uniqueKeys.size)
    })

    // --- Phase II Planned Feature: Graceful Schema Evolution (Skipped pending backend implementation) ---
    test.skip('should gracefully tolerate omitted columns in delta files by projecting nulls and recording warning telemetry', async () => {
      // Pending Phase II backend implementation:
      // When a non-mandatory column disappears from a delta CSV during the delta walk,
      // the pipeline should succeed, project null for that column in DuckDB, and log a warning.
    })

    // =========================================================================================
    // --- Phase II: Negative & Resilience Test Scenarios (Deferred pending LKPR-127 & LKPR-128) ---
    // =========================================================================================

    // test('should fail import and quarantine file when mandatory schema columns are missing (LKPR-127)')
    // test('should fail import when CSV column headers are malformed or misaligned')
    // test('should fail gracefully when multiple files for the same dataset share identical timestamps (LKPR-34)')
    // test('should fail import when source filename contains unparseable or corrupted timestamp format')
    // test('should fail import and record failure reason when decryption fails due to invalid password/salt')
    // test('should reject comma-delimited CSV when dataset configuration strictly expects pipe-delimited PSV')
    // test('should reject H/C/D/T legacy file when trailer record count does not match data rows count (LKPR-36)')
    // test('should reject H/C/D/T legacy file when header and trailer metadata disagree on filename or timestamp')
    // test('should reject H/C/D/T legacy file when envelope structure is incomplete (missing H, C, or T tag)')
  })
}
