import { DuckDBInstance, DuckDBConnection } from '@duckdb/node-api'
import fs from 'fs'
import path from 'path'
import os from 'os'

export class DuckDbClient {
  private instance: DuckDBInstance | null = null
  private connection: DuckDBConnection | null = null
  private tempFilePath: string | null = null

  /**
   * Opens a DuckDB database from a file path
   */
  async openFromFile(filePath: string): Promise<void> {
    this.instance = await DuckDBInstance.create(filePath, {
      access_mode: 'READ_ONLY'
    })
    this.connection = await this.instance.connect()
  }

  /**
   * Opens a DuckDB database directly from a binary Buffer
   */
  async openFromBuffer(buffer: Buffer): Promise<void> {
    this.tempFilePath = path.join(
      os.tmpdir(),
      `duckdb_${Date.now()}_${Math.random().toString(36).substring(7)}.duckdb`
    )
    fs.writeFileSync(this.tempFilePath, buffer)
    await this.openFromFile(this.tempFilePath)
  }

  /**
   * Executes a SQL query and returns rows as an array of structured objects
   */
  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const reader = await this.connection!.runAndReadAll(sql)
    return reader.getRowObjectsJson() as T[]
  }

  /**
   * Returns list of all table names in the database
   */
  async getTableNames(): Promise<string[]> {
    const rows = await this.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main';"
    )
    return rows.map((r) => r.table_name)
  }

  /**
   * Returns total row count for a specific table
   */
  async getRowCount(tableName: string): Promise<number> {
    const rows = await this.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${tableName};`
    )
    return Number(rows[0]?.count ?? 0)
  }

  /**
   * Fetches all records from a table
   */
  async getTableRows<T = Record<string, unknown>>(
    tableName: string
  ): Promise<T[]> {
    return this.query<T>(`SELECT * FROM ${tableName};`)
  }

  /**
   * Closes connection and cleans up temporary file
   */
  async close(): Promise<void> {
    this.connection?.closeSync()
    this.connection = null
    this.instance = null

    if (this.tempFilePath && fs.existsSync(this.tempFilePath)) {
      try {
        fs.unlinkSync(this.tempFilePath)
      } catch {
        // cleanup ignore
      }
      this.tempFilePath = null
    }
  }
}
