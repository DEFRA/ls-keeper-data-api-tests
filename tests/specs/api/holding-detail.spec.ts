import { test, expect } from '../../fixtures/base.fixture.js'
import type { HoldingDetail } from '../../helpers/krds-client.js'

test.describe
  .serial('KRDS API: GET /api/v2/holdings/{county}/{parish}/{holding} — Holding detail by CPH', () => {
  test.beforeAll(async ({ etlClient, apiClient }) => {
    test.setTimeout(180000)

    // Upload SAM datasets (Holdings, Holders, Parties, Herds)
    await etlClient.uploadFile('LITP_SAMCPHHOLDING_BASELINE.csv')
    await etlClient.uploadFile('LITP_SAMCPHHOLDER_BASELINE.csv')
    await etlClient.uploadFile('LITP_SAMPARTY_BASELINE.csv')
    await etlClient.uploadFile('LITP_SAMHERD_BASELINE.csv')

    // Ingest all uploaded datasets into DuckDB and export to SQLite read model
    await etlClient.importDataset()

    // Trigger SQLite read-model cache refresh so the API picks up the fresh database
    await apiClient.refreshSqliteCache('read-model', false)
  })

  test('should return 200 with the documented holding detail shape for an existing CPH (AC 1, AC 4, AC 5, AC 6)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHolding('37', '004', '0004')

    expect(response.status()).toBe(200)
    const data: HoldingDetail = await response.json()

    // Root identifiers and metadata
    expect(data.identifier).toBe('37/004/0004')
    if (data.holdingType !== null) {
      expect(typeof data.holdingType).toBe('string')
    }

    // Dates serialise as ISO-8601 UTC (AC 6)
    if (data.startDate !== null) {
      expect(data.startDate).toBeIso8601Utc()
    }
    if (data.endDate !== null) {
      expect(data.endDate).toBeIso8601Utc()
    }

    // Location and coordinates
    expect(data.location).toBeDefined()
    expect(typeof data.location).toBe('object')
    if (data.location.easting !== null) {
      expect(typeof data.location.easting).toBe('number')
    }
    if (data.location.northing !== null) {
      expect(typeof data.location.northing).toBe('number')
    }

    // Address
    expect(data.location.address).toBeDefined()
    if (data.location.address.country !== null) {
      expect(['England', 'Scotland', 'Wales']).toContain(
        data.location.address.country
      )
    }

    // Associations
    expect(Array.isArray(data.associations)).toBe(true)
    for (const association of data.associations) {
      expect(association.customerNumber).toBeTruthy()
      expect(['person', 'organisation']).toContain(association.partyType)

      // Role codes are strictly owner, holder, or keeper (AC 5)
      expect(Array.isArray(association.roles)).toBe(true)
      for (const role of association.roles) {
        expect(['owner', 'holder', 'keeper']).toContain(role.code)
        expect(Array.isArray(role.species)).toBe(true)
      }
    }

    // Allowed species
    expect(Array.isArray(data.allowedSpecies)).toBe(true)

    // Marks
    expect(Array.isArray(data.marks)).toBe(true)
    for (const mark of data.marks) {
      expect(mark.mark).toBeTruthy()
      if (mark.startDate !== null) {
        expect(mark.startDate).toBeIso8601Utc()
      }
      if (mark.endDate !== null) {
        expect(mark.endDate).toBeIso8601Utc()
      }
      expect(Array.isArray(mark.species)).toBe(true)
    }
  })

  test('should ensure no excluded fields appear in the response payload (AC 11)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHolding('37', '004', '0004')
    expect(response.status()).toBe(200)

    const rawData = (await response.json()) as Record<string, unknown>

    // Root exclusions: sbi, state
    expect(rawData.sbi).toBeUndefined()
    expect(rawData.state).toBeUndefined()

    // Address exclusions: county, uprn, businessName, lastUpdatedDate
    const address =
      ((rawData.location as Record<string, unknown>)?.address as Record<
        string,
        unknown
      >) || {}
    expect(address.county).toBeUndefined()
    expect(address.uprn).toBeUndefined()
    expect(address.businessName).toBeUndefined()
    expect(address.lastUpdatedDate).toBeUndefined()

    // Associations exclusions: state
    const associations =
      (rawData.associations as Array<Record<string, unknown>>) || []
    for (const assoc of associations) {
      expect(assoc.state).toBeUndefined()
    }

    // Marks exclusions: colour
    const marks = (rawData.marks as Array<Record<string, unknown>>) || []
    for (const mark of marks) {
      expect(mark.colour).toBeUndefined()
    }
  })

  test('should return an empty species array for holder roles (AC 7)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHolding('37', '004', '0004')
    expect(response.status()).toBe(200)
    const data: HoldingDetail = await response.json()

    let foundHolderRole = false
    for (const association of data.associations) {
      for (const role of association.roles) {
        if (role.code === 'holder') {
          foundHolderRole = true
          expect(role.species).toEqual([])
        }
      }
    }

    expect(foundHolderRole).toBe(true)
  })

  test('should aggregate species across herds for owner and keeper roles (AC 8)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHolding('37', '004', '0004')
    expect(response.status()).toBe(200)
    const data: HoldingDetail = await response.json()

    for (const association of data.associations) {
      for (const role of association.roles) {
        if (role.code === 'owner' || role.code === 'keeper') {
          expect(Array.isArray(role.species)).toBe(true)
          for (const sp of role.species) {
            expect(typeof sp).toBe('string')
            expect(sp.length).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  test('should serialize collections as empty arrays rather than null when empty (AC 9)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHolding('37', '002', '0002')
    expect(response.status()).toBe(200)
    const data: HoldingDetail = await response.json()

    expect(Array.isArray(data.associations)).toBe(true)
    expect(Array.isArray(data.allowedSpecies)).toBe(true)
    expect(Array.isArray(data.marks)).toBe(true)
  })

  test('should return 404 Not Found when the CPH does not exist in the snapshot (AC 2)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHolding('99', '999', '9999')
    expect(response.status()).toBe(404)
  })

  test('should return 400 Bad Request when a path segment fails its constraint (AC 2)', async ({
    apiClient
  }) => {
    // Non-numeric county
    const responseCounty = await apiClient.getHolding('abc', '004', '0004')
    expect(responseCounty.status()).toBe(400)

    // Non-numeric parish
    const responseParish = await apiClient.getHolding('37', 'xyz', '0004')
    expect(responseParish.status()).toBe(400)

    // Non-numeric holding
    const responseHolding = await apiClient.getHolding('37', '004', 'invalid')
    expect(responseHolding.status()).toBe(400)
  })

  test('should prevent SQL injection and reject malformed segment parameters safely (AC 3)', async ({
    apiClient
  }) => {
    const response = await apiClient.get(
      'api/v2/holdings/37/004%20OR%201=1/0004',
      {
        headers: apiClient.getHeaders()
      }
    )

    // Must be safely rejected without executing dynamic SQL or triggering unhandled 500 errors
    expect([400, 404]).toContain(response.status())
  })

  test('should return a 401 Unauthorized response when the Authorization header is missing', async ({
    apiClient
  }) => {
    const gatewayKey = process.env.GATEWAY_API_KEY || process.env.API_KEY || ''
    const response = await apiClient.get('api/v2/holdings/37/004/0004', {
      headers: {
        'x-api-key': gatewayKey
      }
    })

    expect(response.status()).toBe(401)
  })

  test('should return a 401 Unauthorized response when the Authorization token is invalid', async ({
    apiClient
  }) => {
    const gatewayKey = process.env.GATEWAY_API_KEY || process.env.API_KEY || ''
    const invalidCredentials = Buffer.from(
      'invalid-user:invalid-pass'
    ).toString('base64')

    const response = await apiClient.get('api/v2/holdings/37/004/0004', {
      headers: {
        'x-api-key': gatewayKey,
        Authorization: `Basic ${invalidCredentials}`
      }
    })

    expect(response.status()).toBe(401)
  })
})
