/* eslint-disable no-empty-pattern */
import { test as base, expect } from '@playwright/test'
import { EtlClient } from '../helpers/etl-client.js'
import { DuckDbClient } from '../helpers/duckdb-client.js'
import { KrdsApiClient } from '../helpers/krds-client.js'
import '../helpers/record-matcher.js'

export interface TestFixtures {
  etlClient: EtlClient
  apiClient: KrdsApiClient
  duckDbClient: DuckDbClient
}

export const test = base.extend<TestFixtures>({
  etlClient: async ({ request }, use) => {
    await use(new EtlClient(request))
  },

  apiClient: async ({ request }, use) => {
    await use(new KrdsApiClient(request))
  },

  duckDbClient: async ({}, use) => {
    const client = new DuckDbClient()
    await use(client)
    // Automatic teardown & cleanup
    await client.close()
  }
})

export { expect }
