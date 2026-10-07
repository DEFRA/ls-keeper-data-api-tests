import { test, expect } from '../../fixtures/base.fixture.js'
import type {
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

  test('should return 403 Forbidden when gateway x-api-key header is missing', async ({
    apiClient
  }) => {
    const response = await apiClient.get('api/v2/holdings', {
      headers: {
        Authorization: `Basic ${process.env.KRDS_API_BASIC_AUTH || ''}`
      }
    })

    expect(response.status()).toBe(403)
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
      expect.arrayContaining(['page', 'pageSize', 'sort', 'order'])
    )

    const statusCodes = Object.keys(operation.responses || {})
    expect(statusCodes).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '503'])
    )
  })
})
