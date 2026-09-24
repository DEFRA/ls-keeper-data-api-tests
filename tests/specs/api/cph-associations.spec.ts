import { test, expect } from '../../fixtures/base.fixture.js'

test.describe
  .serial('KRDS API: GET /api/v2/cph-associations — User-role-CPH associations by email', () => {
  test.beforeAll(async ({ etlClient, apiClient }) => {
    test.setTimeout(180000)

    // Upload SAM datasets
    await etlClient.uploadFile('LITP_SAMCPHHOLDING_BASELINE.csv')
    await etlClient.uploadFile('LITP_SAMCPHHOLDER_BASELINE.csv')
    await etlClient.uploadFile('LITP_SAMPARTY_BASELINE.csv')
    await etlClient.uploadFile('LITP_SAMHERD_BASELINE.csv')

    // Ingest all uploaded datasets into DuckDB and export to SQLite read model
    await etlClient.importDataset()

    // Trigger SQLite read-model cache refresh so the API picks up the fresh database
    await apiClient.refreshSqliteCache('read-model', false)
  })

  test('should return all associated CPHs for an email with registered owner associations', async ({
    apiClient
  }) => {
    const response = await apiClient.getCphAssociations(
      'single.owner@example.test'
    )

    expect(response.status()).toBe(200)
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(1)
    expect(data[0].cph).toBe('37/004/0004')
    expect(data[0].role).toBe('owner')
  })

  test('should return the union of CPHs when an email is linked to multiple party records', async ({
    apiClient
  }) => {
    const response = await apiClient.getCphAssociations(
      'multi.owner@example.test'
    )

    expect(response.status()).toBe(200)
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(2)

    expect(data.map((item: { cph: string }) => item.cph)).toEqual([
      '37/005/0005',
      '37/006/0006'
    ])

    for (const item of data) {
      expect(item.role).toBe('owner')
    }
  })

  test('should return an empty list when an email has no owner associations', async ({
    apiClient
  }) => {
    // keeper.only@example.test is registered with role 'Keeper' only, not 'Owner'
    const response = await apiClient.getCphAssociations(
      'keeper.only@example.test'
    )

    expect(response.status()).toBe(200)
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data).toEqual([])
  })

  test('should return an empty list when an email does not exist in the system', async ({
    apiClient
  }) => {
    const response = await apiClient.getCphAssociations(
      'nonexistent.user@example.test'
    )

    expect(response.status()).toBe(200)
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data).toEqual([])
  })

  test('should return identical associations regardless of uppercase or lowercase email casing', async ({
    apiClient
  }) => {
    const response = await apiClient.getCphAssociations(
      'SINGLE.OWNER@EXAMPLE.TEST'
    )

    expect(response.status()).toBe(200)
    const data = await response.json()

    expect(data).toHaveLength(1)
    expect(data[0].cph).toBe('37/004/0004')
    expect(data[0].role).toBe('owner')
  })

  test('should trim surrounding whitespace from the email query parameter', async ({
    apiClient
  }) => {
    const response = await apiClient.getCphAssociations(
      '  single.owner@example.test  '
    )

    expect(response.status()).toBe(200)
    const data = await response.json()

    expect(data).toHaveLength(1)
    expect(data[0].cph).toBe('37/004/0004')
    expect(data[0].role).toBe('owner')
  })

  test('should handle URI-encoded email addresses containing special characters such as plus-addressing', async ({
    apiClient
  }) => {
    const response = await apiClient.getCphAssociations(
      'single.owner+alias@example.test'
    )

    expect(response.status()).toBe(200)
    const data = await response.json()

    expect(Array.isArray(data)).toBe(true)
    expect(data).toEqual([])
  })

  test('should return a 400 Bad Request API error response when the email parameter is missing', async ({
    apiClient
  }) => {
    const response = await apiClient.getCphAssociations(undefined)
    await expect(response).toBeApiError(400, { field: 'Email' })
  })

  test('should return a 400 Bad Request API error response when the email parameter is empty', async ({
    apiClient
  }) => {
    const response = await apiClient.getCphAssociations('')
    await expect(response).toBeApiError(400, { field: 'Email' })
  })

  test('should return a 400 Bad Request API error response when the email parameter contains only whitespace', async ({
    apiClient
  }) => {
    const response = await apiClient.getCphAssociations('   ')
    await expect(response).toBeApiError(400, { field: 'Email' })
  })

  test('should return a 401 Unauthorized response when the Authorization header is missing', async ({
    apiClient
  }) => {
    const gatewayKey = process.env.GATEWAY_API_KEY || process.env.API_KEY || ''
    const response = await apiClient.get('api/v2/cph-associations', {
      headers: {
        'x-api-key': gatewayKey
      },
      params: { email: 'single.owner@example.test' }
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
    const response = await apiClient.get('api/v2/cph-associations', {
      headers: {
        'x-api-key': gatewayKey,
        Authorization: `Basic ${invalidCredentials}`
      },
      params: { email: 'single.owner@example.test' }
    })

    expect(response.status()).toBe(401)
  })
})
