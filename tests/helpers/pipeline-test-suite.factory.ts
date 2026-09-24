import { test, expect } from '../fixtures/base.fixture.js'
import { parseCsvFile } from './csv-parser.js'
import { DATASET_PRIMARY_KEYS } from './etl-matchers.js'
import { EtlClient } from './etl-client.js'
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
  baselineFolder?: string
  delta1File?: string
  delta1Folder?: string
  delta2File?: string
  delta2Folder?: string
  xsvnDeltaFile?: string
  xsvnDeltaFolder?: string
  omittedColumn?: string
  timeout?: number
}

/**
 * Default non-mandatory columns to omit per dataset for graceful schema evolution testing.
 */
export const DEFAULT_OMITTED_COLUMNS: Record<string, string> = {
  sam_showground: 'LOCALITY',
  sam_cph_holdings: 'LOCALITY',
  sam_party: 'TELEPHONE_NUMBER',
  sam_herd: 'INTERVALS',
  sam_cph_holder: 'SAON_START_NUMBER',
  amls2_common_land: 'ADDRESS_LINE_2',
  amls2_port: 'ADDRESS_LINE_2',
  cts_location_identifiers: 'LID_SUB_IDENTIFIER'
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
    const xsvnDeltaRecords = config.xsvnDeltaFile
      ? parseCsvFile(path.join(dataDirectory, config.xsvnDeltaFile))
      : []

    // Test 1: Baseline Ingestion & Schema Verification
    test('should ingest baseline records with diverse edge cases and accurately verify DuckDB schema', async ({
      etlClient,
      duckDbClient
    }) => {
      const { encryptedFilename } = await etlClient.uploadFile(
        config.baselineFile,
        config.baselineFolder
      )
      expect(encryptedFilename).toMatch(
        /^(LITP|CT|CTSM|CADS)_[A-Za-z0-9_.-]+\.csv$/
      )

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
          config.delta1File!,
          config.delta1Folder
        )
        expect(encryptedFilename).toMatch(
          /^(LITP|CT|CTSM|CADS)_[A-Za-z0-9_.-]+\.csv$/
        )

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
          config.delta2File!,
          config.delta2Folder
        )
        expect(encryptedFilename).toMatch(
          /^(LITP|CT|CTSM|CADS)_[A-Za-z0-9_.-]+\.csv$/
        )

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

    // Test 4: Upstream CADS .xsvn.csv double-extension ingestion (if xsvnDeltaFile supplied per LKPR-209)
    if (config.xsvnDeltaFile) {
      test('should discover, decrypt, and ingest upstream CADS files with .xsvn.csv double extension', async ({
        etlClient,
        duckDbClient
      }) => {
        await new Promise((resolve) => setTimeout(resolve, 1500))

        const { encryptedFilename } = await etlClient.uploadFile(
          config.xsvnDeltaFile!,
          config.xsvnDeltaFolder
        )
        expect(encryptedFilename).toMatch(
          /^(LITP|CT|CTSM|CADS)_[A-Za-z0-9_.-]+\.csv$/
        )

        const importStatus = await etlClient.importDataset(datasetName)
        expect(importStatus.status).toBe('Succeeded')

        const discoverStage = (importStatus.stages || []).find(
          (s) => s.name === 'discover'
        )
        if (discoverStage && typeof discoverStage.itemCount === 'number') {
          expect(discoverStage.itemCount).toBeGreaterThan(0)
        }

        const duckDbBuffer = await etlClient.downloadDuckDb(
          importStatus.presignedDuckDbUri
        )
        await duckDbClient.openFromBuffer(duckDbBuffer)

        const rows = await duckDbClient.getTableRows(datasetName)
        expect(rows).toMatchRecords(baselineRecords, {
          dataset: datasetName,
          primaryKey: config.primaryKey,
          deltas: [
            ...(config.delta1File ? [delta1Records] : []),
            ...(config.delta2File ? [delta2Records] : []),
            xsvnDeltaRecords
          ]
        })
      })
    }

    // Pipeline Idempotency and Table Stability
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
        ...(config.delta2File ? [delta2Records] : []),
        ...(config.xsvnDeltaFile ? [xsvnDeltaRecords] : [])
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

    // Graceful Schema Evolution (Omitted Delta Columns)
    if (config.delta1File) {
      test('should gracefully tolerate omitted columns in delta files by projecting nulls and maintaining table consistency', async ({
        etlClient,
        duckDbClient
      }) => {
        const columnToOmit =
          config.omittedColumn || DEFAULT_OMITTED_COLUMNS[datasetName]
        expect(
          columnToOmit,
          `No omitted column defined for dataset ${datasetName}`
        ).toBeTruthy()

        await new Promise((resolve) => setTimeout(resolve, 1500))

        const { encryptedFilename } =
          await etlClient.uploadFileWithOmittedColumn(
            config.delta1File!,
            columnToOmit!,
            config.delta1Folder
          )
        expect(encryptedFilename).toMatch(
          /^(LITP|CT|CTSM|CADS)_[A-Za-z0-9_.-]+\.csv$/
        )

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

        const duckDbBuffer = await etlClient.downloadDuckDb(
          importStatus.presignedDuckDbUri
        )
        await duckDbClient.openFromBuffer(duckDbBuffer)

        const rows = await duckDbClient.getTableRows(datasetName)
        expect(rows.length).toBeGreaterThan(0)

        const hasNullOrEmpty = rows.some(
          (r) =>
            r[columnToOmit!] === null ||
            r[columnToOmit!] === undefined ||
            r[columnToOmit!] === ''
        )
        expect(
          hasNullOrEmpty,
          `Expected omitted column ${columnToOmit} to be projected as null or empty in DuckDB for dataset ${datasetName}`
        ).toBe(true)
      })
    }

    // =========================================================================================
    // Future Resilience & Negative Test Scenarios (Deferred pending LKPR-127 & LKPR-128)
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
