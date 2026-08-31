import path from 'path'
import { fileURLToPath } from 'url'
import { APIRequestContext, expect } from '@playwright/test'
import { prepareEncryptedFile } from './file-processor.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ImportTriggerResponse {
  importId: string
  status: string
}

export interface ImportStage {
  name: string
  itemCount?: number
  elapsedMs?: number
  completedAtUtc?: string
}

export interface ImportStatusResponse {
  importId: string
  status: 'Queued' | 'Running' | 'Succeeded' | 'Completed' | 'Failed'
  presignedDuckDbUri?: string
  duckDbPath?: string
  error?: string
  failureReason?: string
  stages?: ImportStage[]
}

export type EtlStage =
  | 'all'
  | 'inbound'
  | 'raw'
  | 'normalised'
  | 'snapshots'
  | 'staging'

export type SourceType = 'internal' | 'external'

export interface PurgeStorageOptions {
  dataset?: string
  stage?: EtlStage
  sourceType?: SourceType
}

export class EtlClient {
  constructor(
    private request: APIRequestContext,
    private apiKey = process.env.API_KEY || '',
    private authorizationKey = process.env.AUTHORIZATION_KEY || '',
    private dataDir = path.resolve(__dirname, '../data')
  ) {}

  private getHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      Authorization: `ApiKey ${this.authorizationKey}`
    }
  }

  /**
   * Purges ETL v2 pipeline storage across stages (DELETE /api/etl/storage)
   */
  async purgeStorage(options: PurgeStorageOptions = {}): Promise<void> {
    const { dataset = 'all', stage = 'all', sourceType } = options
    const params: Record<string, string> = { dataset, stage }
    if (sourceType) params.sourceType = sourceType

    const response = await this.request.delete('api/etl/storage', {
      headers: this.getHeaders(),
      params
    })

    expect(
      response.ok(),
      `Storage purge failed with HTTP ${response.status()}: ${await response.text()}`
    ).toBeTruthy()
  }

  /**
   * Cleans storage (delegates to full purge across all datasets and stages)
   */
  async cleanStorage(): Promise<void> {
    await this.purgeStorage({ dataset: 'all', stage: 'all' })
  }

  /**
   * Resolves a raw data file from tests/data, encrypts it in memory, and uploads it
   */
  async uploadFile(fileName: string): Promise<{ encryptedFilename: string }> {
    const filePath = path.resolve(this.dataDir, fileName)
    const { filename, buffer } = prepareEncryptedFile(filePath)

    const response = await this.request.post('api/ExternalCatalogue/upload', {
      headers: this.getHeaders(),
      params: { objectKey: filename },
      multipart: {
        File: {
          name: filename,
          mimeType: 'application/octet-stream',
          buffer
        }
      }
    })

    expect(
      response.ok(),
      `Upload failed with HTTP ${response.status()}: ${await response.text()}`
    ).toBeTruthy()

    return {
      encryptedFilename: filename
    }
  }

  /**
   * Triggers the file-based ETL pipeline (POST /api/etl/imports)
   */
  async triggerImport(
    dataset?: string,
    sourceType = 'internal'
  ): Promise<ImportTriggerResponse> {
    const params: Record<string, string> = {}
    if (dataset) params.dataset = dataset
    if (sourceType) params.sourceType = sourceType

    const response = await this.request.post('api/etl/imports', {
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json'
      },
      params
    })

    expect(
      response.ok(),
      `Trigger import failed with HTTP ${response.status()}: ${await response.text()}`
    ).toBeTruthy()

    return response.json()
  }

  /**
   * Retrieves status of an import by importId (GET /api/etl/imports/{importId})
   */
  async getImportStatus(importId: string): Promise<ImportStatusResponse> {
    const response = await this.request.get(
      `api/etl/imports/${encodeURIComponent(importId)}`,
      {
        headers: this.getHeaders()
      }
    )

    expect(
      response.ok(),
      `Get import status failed with HTTP ${response.status()}: ${await response.text()}`
    ).toBeTruthy()

    return response.json()
  }

  /**
   * Polls import status until 'Succeeded' or 'Completed' using Playwright's expect.poll
   */
  async pollImportUntilComplete(
    importId: string,
    timeout = 180000,
    interval = 2000
  ): Promise<ImportStatusResponse> {
    let latestStatus: ImportStatusResponse | undefined

    await expect
      .poll(
        async () => {
          latestStatus = await this.getImportStatus(importId)
          if (latestStatus.status === 'Failed') {
            throw new Error(
              `ETL Import ${importId} failed on backend: ${latestStatus.error || JSON.stringify(latestStatus)}`
            )
          }
          return (
            latestStatus.status === 'Succeeded' ||
            latestStatus.status === 'Completed'
          )
        },
        {
          message: `ETL Import ${importId} did not reach Succeeded/Completed status within ${timeout}ms.`,
          timeout,
          intervals: [interval]
        }
      )
      .toBeTruthy()

    return latestStatus!
  }

  /**
   * Retrieves the latest presigned DuckDB download URL from the backend
   */
  async getLatestDuckDbUrl(): Promise<string> {
    const response = await this.request.get('api/etl/staging/duckdb/latest', {
      headers: this.getHeaders()
    })
    expect(
      response.ok(),
      `Failed to get latest DuckDB URL: HTTP ${response.status()}`
    ).toBeTruthy()
    const json = (await response.json()) as { downloadUrl?: string }
    return json.downloadUrl || ''
  }

  /**
   * Downloads the DuckDB database file buffer from a presigned S3 URL or latest staging endpoint
   */
  async downloadDuckDb(presignedUrl?: string): Promise<Buffer> {
    const url = presignedUrl || (await this.getLatestDuckDbUrl())
    expect(
      url,
      'Cannot download DuckDB database: download URL is undefined or empty'
    ).toBeTruthy()

    const response = await this.request.get(url)
    expect(
      response.ok(),
      `Failed to download DuckDB from S3: HTTP ${response.status()}`
    ).toBeTruthy()
    return response.body()
  }

  /**
   * Triggers the ETL pipeline for a dataset and polls until completion
   */
  async importDataset(
    dataset?: string,
    sourceType = 'internal',
    timeout = 60000,
    interval = 2000
  ): Promise<ImportStatusResponse> {
    const triggerRes = await this.triggerImport(dataset, sourceType)
    return this.pollImportUntilComplete(triggerRes.importId, timeout, interval)
  }
}
