import { test, expect } from '../../fixtures/base.fixture.js'
import type {
  ApiErrorResponse,
  HoldingDetail,
  HoldingDetailPaginatedResult
} from '../../helpers/krds-client.js'

test.describe
  .serial('KRDS API: GET /api/v2/holdings — Paginated holdings collection', () => {
  test('should return 200 with default pagination metadata and sorted by CPH ascending', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings()

    expect(response.status()).toBe(200)
    const data: HoldingDetailPaginatedResult = await response.json()

    expect(data.page).toBe(1)
    expect(data.pageSize).toBe(10)
    expect(data.totalCount).toBeGreaterThanOrEqual(1)
    expect(data.count).toBe(data.values?.length ?? 0)
    expect(data.totalPages).toBe(Math.ceil(data.totalCount / data.pageSize))
    expect(data.hasPreviousPage).toBe(false)
    expect(data.hasNextPage).toBe(data.page < data.totalPages)
    expect(Array.isArray(data.values)).toBe(true)
    expect(data.values!.length).toBeGreaterThanOrEqual(1)

    const identifiers = data.values!.map((h) => h.identifier)
    const sorted = [...identifiers].sort((a, b) => a.localeCompare(b))
    expect(identifiers).toEqual(sorted)
  })

  test('should return each holding in the collection adhering to the full HoldingDetail schema', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings()
    expect(response.status()).toBe(200)
    const data: HoldingDetailPaginatedResult = await response.json()
    expect(data.values).not.toBeNull()
    expect(data.values!.length).toBeGreaterThanOrEqual(1)

    const firstHolding: HoldingDetail = data.values![0]

    expect(firstHolding.identifier).toMatch(/^\d{2}\/\d{3}\/\d{4}$/)

    if (firstHolding.holdingType !== null) {
      expect(typeof firstHolding.holdingType).toBe('string')
    }
    if (firstHolding.name !== null) {
      expect(typeof firstHolding.name).toBe('string')
    }

    if (firstHolding.startDate !== null) {
      expect(firstHolding.startDate).toBeIso8601Utc()
    }
    if (firstHolding.endDate !== null) {
      expect(firstHolding.endDate).toBeIso8601Utc()
    }

    expect(firstHolding.location).toBeDefined()
    expect(firstHolding.location.address).toBeDefined()
    if (firstHolding.location.address.country !== null) {
      expect(['England', 'Scotland', 'Wales']).toContain(
        firstHolding.location.address.country
      )
    }

    expect(Array.isArray(firstHolding.associations)).toBe(true)
    for (const assoc of firstHolding.associations) {
      expect(assoc.customerNumber).toBeTruthy()
      expect(Array.isArray(assoc.roles)).toBe(true)
    }

    expect(Array.isArray(firstHolding.allowedSpecies)).toBe(true)
    expect(Array.isArray(firstHolding.marks)).toBe(true)
  })

  test('should navigate across pages with pageSize=2 and verify disjoint page items', async ({
    apiClient
  }) => {
    const res1 = await apiClient.getHoldings({ page: 1, pageSize: 2 })
    expect(res1.status()).toBe(200)
    const page1: HoldingDetailPaginatedResult = await res1.json()
    expect(page1.page).toBe(1)
    expect(page1.pageSize).toBe(2)
    expect(page1.count).toBe(2)
    expect(page1.hasPreviousPage).toBe(false)
    expect(page1.hasNextPage).toBe(true)
    expect(page1.totalPages).toBeGreaterThanOrEqual(2)

    const res2 = await apiClient.getHoldings({ page: 2, pageSize: 2 })
    expect(res2.status()).toBe(200)
    const page2: HoldingDetailPaginatedResult = await res2.json()
    expect(page2.page).toBe(2)
    expect(page2.pageSize).toBe(2)
    expect(page2.count).toBe(2)
    expect(page2.hasPreviousPage).toBe(true)
    expect(page2.hasNextPage).toBe(page2.page < page2.totalPages)

    const p1Identifiers = page1.values!.map((h) => h.identifier)
    const p2Identifiers = page2.values!.map((h) => h.identifier)
    const overlap = p1Identifiers.filter((id) => p2Identifiers.includes(id))
    expect(overlap).toHaveLength(0)
  })

  test('should fully traverse all pages and reconstruct the complete unique dataset', async ({
    apiClient
  }) => {
    const pageSize = 2
    const firstRes = await apiClient.getHoldings({ page: 1, pageSize })
    expect(firstRes.status()).toBe(200)
    const firstPage: HoldingDetailPaginatedResult = await firstRes.json()
    const totalCount = firstPage.totalCount
    const totalPages = firstPage.totalPages

    const collectedIdentifiers: string[] = []

    for (let page = 1; page <= totalPages; page++) {
      const pageRes = await apiClient.getHoldings({ page, pageSize })
      expect(pageRes.status()).toBe(200)
      const pageResult: HoldingDetailPaginatedResult = await pageRes.json()
      expect(pageResult.page).toBe(page)
      expect(pageResult.pageSize).toBe(pageSize)

      if (page === totalPages) {
        expect(pageResult.hasNextPage).toBe(false)
      } else {
        expect(pageResult.hasNextPage).toBe(true)
      }

      for (const item of pageResult.values!) {
        collectedIdentifiers.push(item.identifier)
      }
    }

    expect(collectedIdentifiers).toHaveLength(totalCount)
    const uniqueIdentifiers = new Set(collectedIdentifiers)
    expect(uniqueIdentifiers.size).toBe(totalCount)
  })

  test('should return empty values array when requesting page beyond totalPages', async ({
    apiClient
  }) => {
    const defaultRes = await apiClient.getHoldings()
    expect(defaultRes.status()).toBe(200)
    const defaultData: HoldingDetailPaginatedResult = await defaultRes.json()
    const outOfBoundsPage = defaultData.totalPages + 5

    const response = await apiClient.getHoldings({
      page: outOfBoundsPage,
      pageSize: 5
    })
    expect(response.status()).toBe(200)

    const data: HoldingDetailPaginatedResult = await response.json()
    expect(data.page).toBe(outOfBoundsPage)
    expect(data.count).toBe(0)
    expect(data.values).toEqual([])
    expect(data.hasNextPage).toBe(false)
    expect(data.hasPreviousPage).toBe(true)
  })

  test('should accept maximum allowed pageSize=100 and return 200 OK', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({ pageSize: 100 })
    expect(response.status()).toBe(200)

    const data: HoldingDetailPaginatedResult = await response.json()
    expect(data.pageSize).toBe(100)
    expect(data.page).toBe(1)
    expect(data.totalPages).toBe(1)
    expect(data.count).toBe(data.totalCount)
  })

  test('should sort holdings in descending order by CPH when sort=desc', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({ sort: 'desc' })
    expect(response.status()).toBe(200)

    const data: HoldingDetailPaginatedResult = await response.json()
    const identifiers = data.values!.map((h) => h.identifier)
    const sortedDesc = [...identifiers].sort((a, b) => b.localeCompare(a))

    expect(identifiers).toEqual(sortedDesc)
  })

  test('should support case-insensitive sort parameters (SORT=DESC)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({ sort: 'DESC' })
    expect(response.status()).toBe(200)

    const data: HoldingDetailPaginatedResult = await response.json()
    const identifiers = data.values!.map((h) => h.identifier)
    const sortedDesc = [...identifiers].sort((a, b) => b.localeCompare(a))

    expect(identifiers).toEqual(sortedDesc)
  })

  test('should support ordering by identifier field (order=identifier)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({
      order: 'identifier',
      sort: 'asc'
    })
    expect(response.status()).toBe(200)

    const data: HoldingDetailPaginatedResult = await response.json()
    const identifiers = data.values!.map((h) => h.identifier)
    const sortedAsc = [...identifiers].sort((a, b) => a.localeCompare(b))

    expect(identifiers).toEqual(sortedAsc)
  })

  test('should support ordering by name field (order=name)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({
      order: 'name',
      sort: 'asc'
    })
    expect(response.status()).toBe(200)

    const data: HoldingDetailPaginatedResult = await response.json()
    expect(data.values!.length).toBeGreaterThanOrEqual(1)
  })

  test('should support ordering by holdingType field (order=holdingType)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({
      order: 'holdingType',
      sort: 'asc'
    })
    expect(response.status()).toBe(200)

    const data: HoldingDetailPaginatedResult = await response.json()
    expect(data.values!.length).toBeGreaterThanOrEqual(1)
  })

  test('should support ordering by startDate field (order=startDate)', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({
      order: 'startDate',
      sort: 'desc'
    })
    expect(response.status()).toBe(200)

    const data: HoldingDetailPaginatedResult = await response.json()
    expect(data.values!.length).toBeGreaterThanOrEqual(1)
  })

  test('should return 400 Bad Request when page is less than 1 (page=0, page=-1)', async ({
    apiClient
  }) => {
    const resPage0 = await apiClient.getHoldings({ page: 0 })
    await expect(resPage0).toBeApiError(400, { field: 'page' })

    const resPageNeg = await apiClient.getHoldings({ page: -1 })
    await expect(resPageNeg).toBeApiError(400, { field: 'page' })
  })

  test('should return 400 Bad Request when pageSize is less than 1 (pageSize=0, pageSize=-5)', async ({
    apiClient
  }) => {
    const resSize0 = await apiClient.getHoldings({ pageSize: 0 })
    await expect(resSize0).toBeApiError(400, { field: 'pageSize' })

    const resSizeNeg = await apiClient.getHoldings({ pageSize: -5 })
    await expect(resSizeNeg).toBeApiError(400, { field: 'pageSize' })
  })

  test('should return 400 Bad Request when pageSize exceeds 100 (pageSize=101, pageSize=500)', async ({
    apiClient
  }) => {
    const resSize101 = await apiClient.getHoldings({ pageSize: 101 })
    await expect(resSize101).toBeApiError(400, { field: 'pageSize' })

    const resSize500 = await apiClient.getHoldings({ pageSize: 500 })
    await expect(resSize500).toBeApiError(400, { field: 'pageSize' })
  })

  test('should return 400 Bad Request when sort parameter is invalid', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({ sort: 'alphabetical' })
    await expect(response).toBeApiError(400, { field: 'sort' })
  })

  test('should return 400 Bad Request when order parameter is invalid', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({ order: 'nonexistentField' })
    await expect(response).toBeApiError(400, { field: 'order' })
  })

  test('should return 400 Bad Request when pagination parameters are non-numeric', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({
      params: { page: 'abc', pageSize: 'xyz' }
    })
    await expect(response).toBeApiError(400)
  })

  test('should return 401 Unauthorized when Authorization header is missing', async ({
    apiClient
  }) => {
    const response = await apiClient.get('api/v2/holdings', {
      headers: {
        'x-api-key': process.env.GATEWAY_API_KEY || ''
      }
    })

    expect(response.status()).toBe(401)
  })

  test('should document GET /api/v2/holdings with complete schema in OpenAPI specification', async ({
    apiClient
  }) => {
    const response = await apiClient.get('swagger/v2/swagger.json', {
      headers: apiClient.getHeaders()
    })
    expect(response.status()).toBe(200)

    const openApi = await response.json()
    const operation = openApi.paths?.['/api/v2/holdings']?.get

    expect(operation).toBeDefined()
    expect(operation.tags).toContain('holdings')

    const paramNames = operation.parameters?.map(
      (p: { name: string }) => p.name
    )
    expect(paramNames).toEqual(
      expect.arrayContaining(['search', 'page', 'pageSize', 'sort', 'order'])
    )

    const statusCodes = Object.keys(operation.responses || {})
    expect(statusCodes).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '503'])
    )
  })

  // =========================================================================
  // Search Holdings (LKPR-271)
  // =========================================================================

  test('should filter holdings by exact and partial holding name with case-insensitivity (LKPR-271 AC 1, 2, 3)', async ({
    apiClient
  }) => {
    // Exact match for distinct holding name
    const resExact = await apiClient.getHoldings({ search: 'Re-Updated' })
    expect(resExact.status()).toBe(200)
    const dataExact: HoldingDetailPaginatedResult = await resExact.json()
    expect(dataExact.values?.length).toBe(1)
    expect(dataExact.values![0].identifier).toBe('37/002/0002')

    // Case-insensitivity: lowercase
    const resLower = await apiClient.getHoldings({ search: 're-updated' })
    expect(resLower.status()).toBe(200)
    const dataLower: HoldingDetailPaginatedResult = await resLower.json()
    expect(dataLower.values?.length).toBe(1)
    expect(dataLower.values![0].identifier).toBe('37/002/0002')

    // Case-insensitivity: uppercase
    const resUpper = await apiClient.getHoldings({ search: 'RE-UPDATED' })
    expect(resUpper.status()).toBe(200)
    const dataUpper: HoldingDetailPaginatedResult = await resUpper.json()
    expect(dataUpper.values?.length).toBe(1)
    expect(dataUpper.values![0].identifier).toBe('37/002/0002')

    // Partial term match
    const resPartial = await apiClient.getHoldings({ search: 'Updated' })
    expect(resPartial.status()).toBe(200)
    const dataPartial: HoldingDetailPaginatedResult = await resPartial.json()
    expect(dataPartial.values?.length).toBe(1)
    expect(dataPartial.values![0].identifier).toBe('37/002/0002')

    // Shared prefix term match across multiple holdings
    const resShared = await apiClient.getHoldings({ search: 'Feature' })
    expect(resShared.status()).toBe(200)
    const dataShared: HoldingDetailPaginatedResult = await resShared.json()
    expect(dataShared.totalCount).toBeGreaterThanOrEqual(5)
  })

  test('should filter holdings by full, unslashed, spaced, and partial CPH formats (LKPR-326 AC 1, AC 2)', async ({
    apiClient
  }) => {
    // Slashed CPH
    const resSlashed = await apiClient.getHoldings({ search: '37/003/0003' })
    expect(resSlashed.status()).toBe(200)
    const dataSlashed: HoldingDetailPaginatedResult = await resSlashed.json()
    expect(dataSlashed.values?.length).toBe(1)
    expect(dataSlashed.values![0].identifier).toBe('37/003/0003')

    // Normalized unslashed CPH
    const resUnslashed = await apiClient.getHoldings({ search: '370030003' })
    expect(resUnslashed.status()).toBe(200)
    const dataUnslashed: HoldingDetailPaginatedResult =
      await resUnslashed.json()
    expect(dataUnslashed.values?.length).toBe(1)
    expect(dataUnslashed.values![0].identifier).toBe('37/003/0003')

    // Spaced CPH
    const resSpaced = await apiClient.getHoldings({ search: '37 003 0003' })
    expect(resSpaced.status()).toBe(200)
    const dataSpaced: HoldingDetailPaginatedResult = await resSpaced.json()
    expect(dataSpaced.values?.length).toBe(1)
    expect(dataSpaced.values![0].identifier).toBe('37/003/0003')

    // The three full-CPH formats return identical results (AC 2)
    expect(dataSlashed.values).toEqual(dataUnslashed.values)
    expect(dataSlashed.values).toEqual(dataSpaced.values)

    // Partial holding segment (last 4 digits)
    const resHoldingSeg = await apiClient.getHoldings({ search: '0003' })
    expect(resHoldingSeg.status()).toBe(200)
    const dataHoldingSeg: HoldingDetailPaginatedResult =
      await resHoldingSeg.json()
    expect(dataHoldingSeg.values?.length).toBe(1)
    expect(dataHoldingSeg.values![0].identifier).toBe('37/003/0003')

    // Partial parish/holding segment
    const resParishSeg = await apiClient.getHoldings({ search: '003/0003' })
    expect(resParishSeg.status()).toBe(200)
    const dataParishSeg: HoldingDetailPaginatedResult =
      await resParishSeg.json()
    expect(dataParishSeg.values?.length).toBe(1)
    expect(dataParishSeg.values![0].identifier).toBe('37/003/0003')
  })

  test('should filter holdings by address post town and locality (LKPR-326 AC 1, AC 5)', async ({
    apiClient
  }) => {
    const resTown = await apiClient.getHoldings({ search: 'Town2' })
    expect(resTown.status()).toBe(200)
    const dataTown: HoldingDetailPaginatedResult = await resTown.json()
    expect(dataTown.values?.length).toBe(1)
    expect(dataTown.values![0].identifier).toBe('37/003/0003')
    expect(dataTown.values![0].location?.address?.postTown).toBe('Town2')

    const resLocality = await apiClient.getHoldings({ search: 'Locality3' })
    expect(resLocality.status()).toBe(200)
    const dataLocality: HoldingDetailPaginatedResult = await resLocality.json()
    expect(dataLocality.values?.length).toBe(1)
    expect(dataLocality.values![0].identifier).toBe('37/004/0004')
    expect(dataLocality.values![0].location?.address?.locality).toBe(
      'Locality3'
    )
  })

  test('should filter holdings by postcode with and without spaces, and outward/inward codes (LKPR-326 AC 6)', async ({
    apiClient
  }) => {
    // Full postcode with space
    const resPostcodeSpace = await apiClient.getHoldings({
      search: 'CPH02 102'
    })
    expect(resPostcodeSpace.status()).toBe(200)
    const dataSpace: HoldingDetailPaginatedResult =
      await resPostcodeSpace.json()
    expect(dataSpace.values?.length).toBe(1)
    expect(dataSpace.values![0].identifier).toBe('37/003/0003')

    // Full postcode without space
    const resPostcodeNoSpace = await apiClient.getHoldings({
      search: 'CPH02102'
    })
    expect(resPostcodeNoSpace.status()).toBe(200)
    const dataNoSpace: HoldingDetailPaginatedResult =
      await resPostcodeNoSpace.json()
    expect(dataNoSpace.values?.length).toBe(1)
    expect(dataNoSpace.values![0].identifier).toBe('37/003/0003')

    // Outward code
    const resOutward = await apiClient.getHoldings({ search: 'CPH02' })
    expect(resOutward.status()).toBe(200)
    const dataOutward: HoldingDetailPaginatedResult = await resOutward.json()
    expect(dataOutward.values?.length).toBe(1)
    expect(dataOutward.values![0].identifier).toBe('37/003/0003')

    // Inward code
    const resInward = await apiClient.getHoldings({ search: '102' })
    expect(resInward.status()).toBe(200)
    const dataInward: HoldingDetailPaginatedResult = await resInward.json()
    expect(dataInward.values?.length).toBe(1)
    expect(dataInward.values![0].identifier).toBe('37/003/0003')

    // Case-insensitive
    const resLower = await apiClient.getHoldings({ search: 'cph02 102' })
    expect(resLower.status()).toBe(200)
    const dataLower: HoldingDetailPaginatedResult = await resLower.json()
    expect(dataLower.values?.length).toBe(1)
    expect(dataLower.values![0].identifier).toBe('37/003/0003')
  })

  test('should filter holdings by address line 1 and address line 2 (LKPR-326 AC 1, AC 5)', async ({
    apiClient
  }) => {
    // addressLine1 (SAON: 1A-10B)
    const resLine1 = await apiClient.getHoldings({ search: '1A-10B' })
    expect(resLine1.status()).toBe(200)
    const dataLine1: HoldingDetailPaginatedResult = await resLine1.json()
    expect(dataLine1.totalCount).toBeGreaterThanOrEqual(1)
    const identifiers = (dataLine1.values || []).map((h) => h.identifier)
    expect(identifiers).toContain('37/004/0004')

    // addressLine2 (Holding Street 3)
    const resLine2 = await apiClient.getHoldings({ search: 'Holding Street 3' })
    expect(resLine2.status()).toBe(200)
    const dataLine2: HoldingDetailPaginatedResult = await resLine2.json()
    expect(dataLine2.values?.length).toBe(1)
    expect(dataLine2.values![0].identifier).toBe('37/004/0004')
    expect(dataLine2.values![0].location?.address?.addressLine2).toContain(
      'Holding Street 3'
    )
  })

  test('should verify excluded fields return 0 search matches while holdingType remains available for sorting (LKPR-326 AC 9, AC 12)', async ({
    apiClient
  }) => {
    // Excluded fields per AC 9: email, telephone/mobile, UDPRN, OS map reference, personal names, party identifiers, holding type
    const excludedQueries = [
      '25000003', // UDPRN
      'main', // holdingType
      'permanent', // holdingType
      'C3700002', // party identifier (customerNumber)
      'PartyFamily2', // personal last name
      'PartyGiven2', // personal first name
      'single.owner@example.test', // email
      '37123402', // telephone
      'TA6000060000' // osMapReference
    ]

    for (const query of excludedQueries) {
      const response = await apiClient.getHoldings({ search: query })
      expect(response.status()).toBe(200)
      const data: HoldingDetailPaginatedResult = await response.json()
      expect(
        data.totalCount,
        `Expected search for excluded field "${query}" to return 0 matches`
      ).toBe(0)
      expect(data.values).toEqual([])
    }

    // Holding type remains available as a sorting option (AC 9 & AC 12)
    const sortResponse = await apiClient.getHoldings({
      order: 'holdingType',
      sort: 'asc'
    })
    expect(sortResponse.status()).toBe(200)
    const sortData: HoldingDetailPaginatedResult = await sortResponse.json()
    expect(sortData.totalCount).toBeGreaterThanOrEqual(1)
  })

  test('should filter holdings by associated business and organisation name (LKPR-326 AC 1, AC 3)', async ({
    apiClient
  }) => {
    const resOrg = await apiClient.getHoldings({ search: 'PartyOrg2' })
    expect(resOrg.status()).toBe(200)
    const dataOrg: HoldingDetailPaginatedResult = await resOrg.json()
    expect(dataOrg.values?.length).toBe(1)
    expect(dataOrg.values![0].identifier).toBe('37/003/0003')

    // Partial business name
    const resPartial = await apiClient.getHoldings({ search: 'PartyOrg' })
    expect(resPartial.status()).toBe(200)
    const dataPartial: HoldingDetailPaginatedResult = await resPartial.json()
    expect(dataPartial.totalCount).toBeGreaterThanOrEqual(1)
  })

  test('should filter holdings by herd mark with case-insensitivity (LKPR-326 AC 1, AC 7)', async ({
    apiClient
  }) => {
    // Herd mark exact
    const resHerd = await apiClient.getHoldings({ search: 'H3700003' })
    expect(resHerd.status()).toBe(200)
    const dataHerd: HoldingDetailPaginatedResult = await resHerd.json()
    expect(dataHerd.values?.length).toBe(1)
    expect(dataHerd.values![0].identifier).toBe('37/004/0004')

    // Herd mark lowercase
    const resHerdLower = await apiClient.getHoldings({ search: 'h3700003' })
    expect(resHerdLower.status()).toBe(200)
    const dataHerdLower: HoldingDetailPaginatedResult =
      await resHerdLower.json()
    expect(dataHerdLower.values?.length).toBe(1)
    expect(dataHerdLower.values![0].identifier).toBe('37/004/0004')

    // Another herd mark
    const resHerd1 = await apiClient.getHoldings({ search: 'H3700001' })
    expect(resHerd1.status()).toBe(200)
    const dataHerd1: HoldingDetailPaginatedResult = await resHerd1.json()
    expect(dataHerd1.values?.length).toBe(1)
    expect(dataHerd1.values![0].identifier).toBe('37/002/0002')
  })

  test('should paginate search results and calculate pagination metadata including pageSize 25 (LKPR-326 AC 13, AC 14)', async ({
    apiClient
  }) => {
    const page1Res = await apiClient.getHoldings({
      search: 'Feature',
      page: 1,
      pageSize: 2
    })
    expect(page1Res.status()).toBe(200)
    const page1Data: HoldingDetailPaginatedResult = await page1Res.json()

    expect(page1Data.page).toBe(1)
    expect(page1Data.pageSize).toBe(2)
    expect(page1Data.count).toBe(2)
    expect(page1Data.totalCount).toBeGreaterThanOrEqual(4)
    expect(page1Data.totalPages).toBe(Math.ceil(page1Data.totalCount / 2))
    expect(page1Data.hasNextPage).toBe(true)
    expect(page1Data.hasPreviousPage).toBe(false)

    const page2Res = await apiClient.getHoldings({
      search: 'Feature',
      page: 2,
      pageSize: 2
    })
    expect(page2Res.status()).toBe(200)
    const page2Data: HoldingDetailPaginatedResult = await page2Res.json()
    expect(page2Data.page).toBe(2)
    expect(page2Data.hasPreviousPage).toBe(true)

    // Ensure disjoint values between pages
    const idsPage1 = page1Data.values!.map((v) => v.identifier)
    const idsPage2 = page2Data.values!.map((v) => v.identifier)
    const intersection = idsPage1.filter((id) => idsPage2.includes(id))
    expect(intersection).toEqual([])

    // Verify pageSize=25 requirement (LKPR-326 AC 13)
    const res25 = await apiClient.getHoldings({
      search: 'Feature',
      pageSize: 25
    })
    expect(res25.status()).toBe(200)
    const data25: HoldingDetailPaginatedResult = await res25.json()
    expect(data25.pageSize).toBe(25)
    expect(data25.count).toBe(data25.totalCount)
    expect(data25.hasNextPage).toBe(false)
  })

  test('should sort search results in ascending and descending order and default to CPH ascending (LKPR-326 AC 12)', async ({
    apiClient
  }) => {
    // Default sort without order parameter: CPH numerically ascending (AC 12)
    const resDefault = await apiClient.getHoldings({ search: 'Feature' })
    expect(resDefault.status()).toBe(200)
    const dataDefault: HoldingDetailPaginatedResult = await resDefault.json()
    const defaultIds = dataDefault.values!.map((v) => v.identifier)
    const expectedAsc = [...defaultIds].sort((a, b) => a.localeCompare(b))
    expect(defaultIds).toEqual(expectedAsc)

    // Sort descending by CPH
    const resDesc = await apiClient.getHoldings({
      search: 'Feature',
      order: 'cph',
      sort: 'desc'
    })
    expect(resDesc.status()).toBe(200)
    const dataDesc: HoldingDetailPaginatedResult = await resDesc.json()
    const descIds = dataDesc.values!.map((v) => v.identifier)
    const expectedDesc = [...descIds].sort((a, b) => b.localeCompare(a))
    expect(descIds).toEqual(expectedDesc)

    // Sort ascending by name
    const resAscName = await apiClient.getHoldings({
      search: 'Feature',
      order: 'name',
      sort: 'asc'
    })
    expect(resAscName.status()).toBe(200)
    const dataAscName: HoldingDetailPaginatedResult = await resAscName.json()
    const names = dataAscName.values!.map((v) => v.name ?? '')
    const expectedNames = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(expectedNames)
  })

  test('should return 200 with empty values array and totalCount 0 when no holdings match search term', async ({
    apiClient
  }) => {
    const response = await apiClient.getHoldings({
      search: 'NonExistentHoldingQuery999'
    })
    expect(response.status()).toBe(200)
    const data: HoldingDetailPaginatedResult = await response.json()

    expect(data.count).toBe(0)
    expect(data.totalCount).toBe(0)
    expect(data.values).toEqual([])
    expect(data.totalPages).toBe(0)
    expect(data.hasNextPage).toBe(false)
    expect(data.hasPreviousPage).toBe(false)
  })

  test('should return all holdings when search parameter is empty or whitespace-only (LKPR-271 AC 9)', async ({
    apiClient
  }) => {
    const resDefault = await apiClient.getHoldings()
    expect(resDefault.status()).toBe(200)
    const defaultData: HoldingDetailPaginatedResult = await resDefault.json()

    const resEmpty = await apiClient.getHoldings({ search: '' })
    expect(resEmpty.status()).toBe(200)
    const emptyData: HoldingDetailPaginatedResult = await resEmpty.json()
    expect(emptyData.totalCount).toBe(defaultData.totalCount)

    const resWhitespace = await apiClient.getHoldings({ search: '   ' })
    expect(resWhitespace.status()).toBe(200)
    const whitespaceData: HoldingDetailPaginatedResult =
      await resWhitespace.json()
    expect(whitespaceData.totalCount).toBe(defaultData.totalCount)
  })

  test('should trim surrounding whitespace from search term', async ({
    apiClient
  }) => {
    const resPadded = await apiClient.getHoldings({ search: '  Town2  ' })
    expect(resPadded.status()).toBe(200)
    const data: HoldingDetailPaginatedResult = await resPadded.json()
    expect(data.values?.length).toBe(1)
    expect(data.values![0].identifier).toBe('37/003/0003')
  })

  test('should accept supported punctuation in search terms (hyphen, apostrophe, slash, dot, at-sign)', async ({
    apiClient
  }) => {
    const resHyphen = await apiClient.getHoldings({ search: 'Re-Updated' })
    expect(resHyphen.status()).toBe(200)
    const dataHyphen: HoldingDetailPaginatedResult = await resHyphen.json()
    expect(dataHyphen.values?.length).toBe(1)
    expect(dataHyphen.values![0].identifier).toBe('37/002/0002')

    const resSlash = await apiClient.getHoldings({ search: '37/004/0004' })
    expect(resSlash.status()).toBe(200)
    const dataSlash: HoldingDetailPaginatedResult = await resSlash.json()
    expect(dataSlash.values?.length).toBe(1)
    expect(dataSlash.values![0].identifier).toBe('37/004/0004')
  })

  test('should accept search parameter of exactly 200 characters (LKPR-271 AC 10 boundary)', async ({
    apiClient
  }) => {
    const exactMaxQuery = 'a'.repeat(200)
    const response = await apiClient.getHoldings({ search: exactMaxQuery })
    expect(response.status()).toBe(200)
    const data: HoldingDetailPaginatedResult = await response.json()
    expect(data.totalCount).toBe(0)
    expect(data.values).toEqual([])
  })

  test('should return 400 Bad Request when search parameter exceeds maximum length of 200 characters (LKPR-271 AC 10)', async ({
    apiClient
  }) => {
    const longQuery = 'a'.repeat(201)
    const response = await apiClient.getHoldings({ search: longQuery })

    await expect(response).toBeApiError(400, { field: 'search' })
  })

  test('should return 400 Bad Request when search contains only punctuation without letters or digits', async ({
    apiClient
  }) => {
    const punctuationOnlyQueries = ['/', '@', '.', ',', "'", '-', '()']

    for (const query of punctuationOnlyQueries) {
      const response = await apiClient.getHoldings({ search: query })
      await expect(response).toBeApiError(400, { field: 'search' })
      const body: ApiErrorResponse = await response.json()
      expect(body.errors?.search?.[0]).toContain('at least one letter or digit')
    }
  })

  test('should return 400 Bad Request when search contains unsupported expressions or wildcards (LKPR-271 AC 10)', async ({
    apiClient
  }) => {
    const unsupportedQueries = ['*', ':', '"', '%', '^', '~']

    for (const query of unsupportedQueries) {
      const response = await apiClient.getHoldings({ search: query })
      await expect(response).toBeApiError(400, { field: 'search' })
    }
  })

  test('should enforce consecutive whole-term matching within a single field (LKPR-326 AC 4)', async ({
    apiClient
  }) => {
    // Multi-word term appearing consecutively in the submitted order within holding name
    const resConsecutive = await apiClient.getHoldings({
      search: 'Feature 1 Re-Updated'
    })
    expect(resConsecutive.status()).toBe(200)
    const dataConsecutive: HoldingDetailPaginatedResult =
      await resConsecutive.json()
    expect(dataConsecutive.values?.length).toBe(1)
    expect(dataConsecutive.values![0].identifier).toBe('37/002/0002')

    // Non-consecutive words within the same field must return 0 results (AC 4)
    const resNonConsecutive = await apiClient.getHoldings({
      search: 'Feature Re-Updated'
    })
    expect(resNonConsecutive.status()).toBe(200)
    const dataNonConsecutive: HoldingDetailPaginatedResult =
      await resNonConsecutive.json()
    expect(dataNonConsecutive.totalCount).toBe(0)
    expect(dataNonConsecutive.values).toEqual([])

    // Terms spanning across different fields or holdings must return 0 results (AC 4)
    const resCrossField = await apiClient.getHoldings({
      search: 'Town1 Locality2'
    })
    expect(resCrossField.status()).toBe(200)
    const dataCrossField: HoldingDetailPaginatedResult =
      await resCrossField.json()
    expect(dataCrossField.totalCount).toBe(0)
    expect(dataCrossField.values).toEqual([])
  })

  test('should return unique holdings and accurate totalCount without duplication (LKPR-326 AC 11)', async ({
    apiClient
  }) => {
    // Term matching multiple fields on holding 37/002/0002 (name and address)
    const resUnique = await apiClient.getHoldings({ search: 'Feature 1' })
    expect(resUnique.status()).toBe(200)
    const dataUnique: HoldingDetailPaginatedResult = await resUnique.json()

    expect(dataUnique.values?.length).toBe(1)
    expect(dataUnique.totalCount).toBe(1)
    expect(dataUnique.values![0].identifier).toBe('37/002/0002')
  })

  test('should treat non-matching diacritics as distinct characters without error', async ({
    apiClient
  }) => {
    const resTown = await apiClient.getHoldings({ search: 'Töwn1' })
    expect(resTown.status()).toBe(200)
    const dataTown: HoldingDetailPaginatedResult = await resTown.json()
    expect(dataTown.totalCount).toBe(0)
    expect(dataTown.values).toEqual([])
  })

  test('should safely reject SQL injection and script probes without 500 server errors', async ({
    apiClient
  }) => {
    const resSql = await apiClient.getHoldings({ search: "' OR 1=1 --" })
    expect([400, 404]).toContain(resSql.status())

    const resScript = await apiClient.getHoldings({
      search: '<script>alert(1)</script>'
    })
    expect([400, 403]).toContain(resScript.status())
  })
})
