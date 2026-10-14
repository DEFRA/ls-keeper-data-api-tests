import { test, expect } from '../../fixtures/base.fixture.js'
import type { HoldingDetail } from '../../helpers/krds-client.js'

test.describe
  .serial('KRDS API: GET /api/v2/holdings/{county}/{parish}/{holding} — Holding detail by CPH', () => {
  test('should return 200 with the documented holding detail shape for an existing CPH (AC 1, AC 4, AC 5, AC 6)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHolding('37', '004', '0004')

    expect(response.status()).toBe(200)
    const data: HoldingDetail = await response.json()

    // Root identifiers and metadata
    expect(data.identifier).toBe('37/004/0004')
    expect(data.holdingType).not.toBeNull()
    expect(typeof data.holdingType).toBe('string')

    // Dates serialise as ISO-8601 UTC (AC 6)
    expect(data.startDate).not.toBeNull()
    expect(data.startDate).toBeIso8601Utc()
    expect(data.endDate).toBeNull()

    // Location and coordinates
    expect(data.location).toBeDefined()
    expect(typeof data.location).toBe('object')
    expect(data.location.easting).not.toBeNull()
    expect(typeof data.location.easting).toBe('number')
    expect(Number.isInteger(data.location.easting)).toBe(true)

    expect(data.location.northing).not.toBeNull()
    expect(typeof data.location.northing).toBe('number')
    expect(Number.isInteger(data.location.northing)).toBe(true)

    // Address
    expect(data.location.address).toBeDefined()
    expect(data.location.address.udprn).not.toBeNull()
    expect(typeof data.location.address.udprn).toBe('number')
    expect(Number.isInteger(data.location.address.udprn)).toBe(true)

    expect(data.location.address.country).not.toBeNull()
    expect(['England', 'Scotland', 'Wales']).toContain(
      data.location.address.country
    )

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
    expect(data.marks.length).toBeGreaterThan(0)
    for (const mark of data.marks) {
      expect(mark.mark).toBeTruthy()
      expect(mark.startDate).not.toBeNull()
      expect(mark.startDate).toBeIso8601Utc()
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

    let foundOwnerOrKeeperRole = false
    for (const association of data.associations) {
      for (const role of association.roles) {
        if (role.code === 'owner' || role.code === 'keeper') {
          foundOwnerOrKeeperRole = true
          expect(Array.isArray(role.species)).toBe(true)
          for (const sp of role.species) {
            expect(typeof sp).toBe('string')
            expect(sp.length).toBeGreaterThan(0)
          }
        }
      }
    }
    expect(foundOwnerOrKeeperRole).toBe(true)
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

  test('should accurately read strongly-typed INTEGER columns (udprn, easting, northing) and preserve NULL as null (LKPR-268)', async ({
    apiClient
  }) => {
    // 1. Holding with populated integer coordinates and UDPRN (LKPR-268 AC 1 & AC 2)
    const resPopulated = await apiClient.getHolding('37', '004', '0004')
    expect(resPopulated.status()).toBe(200)
    const dataPopulated: HoldingDetail = await resPopulated.json()

    expect(typeof dataPopulated.location.easting).toBe('number')
    expect(dataPopulated.location.easting).toBe(400003)
    expect(typeof dataPopulated.location.northing).toBe('number')
    expect(dataPopulated.location.northing).toBe(500003)
    expect(typeof dataPopulated.location.address.udprn).toBe('number')
    expect(dataPopulated.location.address.udprn).toBe(25000003)

    // Dates converted from SQLite integer epoch seconds to ISO-8601 UTC
    expect(dataPopulated.startDate).toBe('2025-01-01T00:00:00+00:00')
    expect(dataPopulated.endDate).toBeNull()

    // 2. Holding with NULL integer columns ("NULL stays NULL" edge case)
    const resNull = await apiClient.getHolding('03', '202', '0021')
    expect(resNull.status()).toBe(200)
    const dataNull: HoldingDetail = await resNull.json()

    expect(dataNull.location.address.udprn).toBeNull()
    expect(dataNull.endDate).toBeNull()
    expect(dataNull.marks).toBeDefined()
    expect(dataNull.marks!.length).toBeGreaterThan(0)
    expect(dataNull.marks![0].endDate).toBeNull()
  })
})
