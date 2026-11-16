/* eslint-disable no-empty-pattern */
import { test as base, expect } from '@playwright/test'
import { EtlClient } from '../helpers/etl-client.js'
import { DuckDbClient } from '../helpers/duckdb-client.js'
import { KrdsApiClient } from '../helpers/krds-client.js'
import { CleanseApiClient } from '../helpers/cleanse-client.js'
import '../helpers/etl-matchers.js'
import '../helpers/api-matchers.js'

export interface TestFixtures {
  etlClient: EtlClient
  apiClient: KrdsApiClient
  cleanseClient: CleanseApiClient
  duckDbClient: DuckDbClient
}

export const test = base.extend<TestFixtures>({
  etlClient: async ({ request }, use) => {
    await use(new EtlClient(request))
  },

  apiClient: async ({ request }, use) => {
    await use(new KrdsApiClient(request))
  },

  cleanseClient: async ({ request }, use) => {
    await use(new CleanseApiClient(request))
  },

  duckDbClient: async ({}, use) => {
    const client = new DuckDbClient()
    await use(client)
    // Automatic teardown & cleanup
    await client.close()
  }
})

export { expect }
