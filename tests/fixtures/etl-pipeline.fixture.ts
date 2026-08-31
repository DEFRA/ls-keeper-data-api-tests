/* eslint-disable no-empty-pattern */
import { test as base, expect } from '@playwright/test'
import { EtlClient } from '../helpers/etl-client.js'
import { DuckDbClient } from '../helpers/duckdb-client.js'
import './record-matcher.js'

export interface EtlFixtures {
  etlClient: EtlClient
  duckDbClient: DuckDbClient
}

export const test = base.extend<EtlFixtures>({
  etlClient: async ({ request }, use) => {
    const client = new EtlClient(request)
    await use(client)
  },

  duckDbClient: async ({}, use) => {
    const client = new DuckDbClient()
    await use(client)
    // Automatic teardown & cleanup
    await client.close()
  }
})

export { expect }
