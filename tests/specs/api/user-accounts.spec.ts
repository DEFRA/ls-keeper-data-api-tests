import fs from 'fs'
import path from 'path'
import { test, expect } from '../../fixtures/base.fixture.js'
import type { UserAccountDto } from '../../helpers/krds-client.js'

test.describe
  .serial('KRDS API: /api/v2/user-accounts — User account lifecycle and session management', () => {
  // Generate unique run identifiers to guarantee deterministic MongoDB and SQLite isolation
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  const testSub = `sub-farmer-${uniqueId}`
  const ownerEmail = `owner.${uniqueId}@example.test`
  const testEmail = `user.${uniqueId}@example.test`

  test.beforeAll(async ({ etlClient, apiClient }) => {
    test.setTimeout(180000)

    // Substitute single.owner@example.test with our unique ownerEmail so it dynamically links to CPH 37/004/0004
    const partyFilePath = path.resolve('tests/data/LITP_SAMPARTY_BASELINE.csv')
    const partyRaw = fs.readFileSync(partyFilePath, 'utf8')
    const dynamicPartyContent = partyRaw.replace(
      'single.owner@example.test',
      ownerEmail
    )

    // Upload SAM datasets (Holdings, Holders, Parties with dynamic email, Herds)
    await etlClient.uploadFile('LITP_SAMCPHHOLDING_BASELINE.csv')
    await etlClient.uploadFile('LITP_SAMCPHHOLDER_BASELINE.csv')
    await etlClient.uploadFile(
      'LITP_SAMPARTY_BASELINE.csv',
      undefined,
      dynamicPartyContent
    )
    await etlClient.uploadFile('LITP_SAMHERD_BASELINE.csv')

    // Ingest all uploaded datasets into DuckDB and export to SQLite read model
    await etlClient.importDataset()

    // Trigger SQLite read-model cache refresh so the API picks up the fresh database
    await apiClient.refreshSqliteCache('read-model', false)
  })

  // =========================================================================
  // Test Suite 1: Account Creation & Onboarding (POST /api/v2/user-accounts)
  // =========================================================================

  test('should create a new user account with populated CPH associations from SAM read model (AC 1)', async ({
    apiClient
  }) => {
    const response = await apiClient.ensureUserAccount({
      sub: testSub,
      email: ownerEmail,
      given_name: 'Jane',
      family_name: 'Farmer'
    })

    expect(response.status()).toBe(201)

    // Location header points to session lookup route
    const location = response.headers()['location']
    expect(location).toBe(`/api/v2/user-accounts/${testSub}`)

    const data: UserAccountDto = await response.json()
    expect(data.id).toBeTruthy()
    expect(data.subject).toBe(testSub)
    expect(data.email).toBe(ownerEmail)
    expect(data.firstName).toBe('Jane')
    expect(data.lastName).toBe('Farmer')
    expect(data.displayName).toBe('Jane Farmer')

    // CPH associations built from SAM read model
    expect(Array.isArray(data.cphAssociations)).toBe(true)
    expect(data.cphAssociations!.length).toBeGreaterThan(0)

    const association = data.cphAssociations!.find(
      (a) => a.cphNumber === '37/004/0004'
    )
    expect(association).toBeDefined()
    expect(association!.role).toBe('owner')
    expect(association!.partyId).toBe('C3700004')
    expect(association!.holdingName).toBe('Feature 3')

    // Timestamp validations
    expect(data.associationsRefreshedDate).toBeIso8601Utc()
    expect(data.lastUpdatedDate).toBeIso8601Utc()
  })

  test('should create account with empty CPH associations when email has no holdings in SAM (AC 3)', async ({
    apiClient
  }) => {
    const noHoldingsSub = `sub-noholdings-${uniqueId}`
    const noHoldingsEmail = `no.holdings.${uniqueId}@example.test`
    const response = await apiClient.ensureUserAccount({
      sub: noHoldingsSub,
      email: noHoldingsEmail,
      given_name: 'No',
      family_name: 'Holdings'
    })

    expect(response.status()).toBe(201)
    const data: UserAccountDto = await response.json()

    expect(data.subject).toBe(noHoldingsSub)
    expect(data.email).toBe(noHoldingsEmail)
    expect(Array.isArray(data.cphAssociations)).toBe(true)
    expect(data.cphAssociations).toEqual([])
  })

  test('should accept uppercase email on create and preserve casing', async ({
    apiClient
  }) => {
    const casingSub = `sub-casing-${uniqueId}`
    const rawEmail = `casing.user.${uniqueId}@example.test`.toUpperCase()
    const response = await apiClient.ensureUserAccount({
      sub: casingSub,
      email: rawEmail,
      given_name: 'Case',
      family_name: 'Insensitive'
    })

    expect(response.status()).toBe(201)
    const data: UserAccountDto = await response.json()

    expect(data.email).toBe(rawEmail)
    expect(Array.isArray(data.cphAssociations)).toBe(true)
  })

  // =========================================================================
  // Test Suite 2: Account Update & Snapshot Refresh (POST /api/v2/user-accounts)
  // =========================================================================

  test('should update profile fields and return 200 OK for an existing recognized subject (AC 2)', async ({
    apiClient
  }) => {
    const response = await apiClient.ensureUserAccount({
      sub: testSub,
      email: ownerEmail,
      given_name: 'Janet',
      family_name: 'Smith'
    })

    expect(response.status()).toBe(200)
    const data: UserAccountDto = await response.json()

    expect(data.subject).toBe(testSub)
    expect(data.firstName).toBe('Janet')
    expect(data.lastName).toBe('Smith')
    expect(data.displayName).toBe('Janet Smith')
    expect(data.associationsRefreshedDate).toBeIso8601Utc()
    expect(data.lastUpdatedDate).toBeIso8601Utc()
  })

  test('should fully replace CPH associations rather than append duplicate records on refresh (AC 2)', async ({
    apiClient
  }) => {
    const response = await apiClient.ensureUserAccount({
      sub: testSub,
      email: ownerEmail,
      given_name: 'Janet',
      family_name: 'Smith'
    })

    expect(response.status()).toBe(200)
    const data: UserAccountDto = await response.json()

    // Ensure CPHs are distinct without duplicates
    const cphNumbers = data.cphAssociations!.map((a) => a.cphNumber)
    const uniqueCphs = new Set(cphNumbers)
    expect(cphNumbers.length).toBe(uniqueCphs.size)
  })

  // =========================================================================
  // Test Suite 3: Session Lookup (GET /api/v2/user-accounts/{subject})
  // =========================================================================

  test('should retrieve existing user account session without recomputing associations (AC 5)', async ({
    apiClient
  }) => {
    const response = await apiClient.getUserAccount(testSub)

    expect(response.status()).toBe(200)
    const data: UserAccountDto = await response.json()

    expect(data.subject).toBe(testSub)
    expect(data.email).toBe(ownerEmail)
    expect(data.firstName).toBe('Janet')
    expect(data.lastName).toBe('Smith')
    expect(data.displayName).toBe('Janet Smith')
    expect(Array.isArray(data.cphAssociations)).toBe(true)
    expect(
      data.cphAssociations!.some((a) => a.cphNumber === '37/004/0004')
    ).toBe(true)
  })

  test('should retrieve user account session when subject contains forward slashes [LKPR-274]', async ({
    apiClient
  }) => {
    const slashSub = `provider/tenant/${uniqueId}`
    const slashEmail = `slash.${uniqueId}@example.test`

    // Create user with forward slash in subject
    const createRes = await apiClient.ensureUserAccount({
      sub: slashSub,
      email: slashEmail,
      given_name: 'Slash',
      family_name: 'Subject'
    })
    expect(createRes.status()).toBe(201)

    // Retrieve user session with URL-encoded slash in path
    const getRes = await apiClient.getUserAccount(slashSub)
    expect(getRes.status()).toBe(200)

    const data: UserAccountDto = await getRes.json()
    expect(data.subject).toBe(slashSub)
    expect(data.email).toBe(slashEmail)
  })

  test('should return 404 Not Found RFC 7807 problem details for an unknown subject (AC 5)', async ({
    apiClient
  }) => {
    const response = await apiClient.getUserAccount('unknown-subject-999999999')
    await expect(response).toBeApiError(404, { title: 'Not Found' })
  })

  // =========================================================================
  // Test Suite 4: Request Body Validation (422 Unprocessable Content - AC 4)
  // =========================================================================

  test('should return 422 Unprocessable Content when the subject claim is missing or empty', async ({
    apiClient
  }) => {
    const response = await apiClient.ensureUserAccount({
      sub: '',
      email: testEmail,
      given_name: 'Jane',
      family_name: 'Farmer'
    })

    await expect(response).toBeApiError(422, { field: 'Subject' })
  })

  test('should return 422 Unprocessable Content when the email claim is missing or empty', async ({
    apiClient
  }) => {
    const response = await apiClient.ensureUserAccount({
      sub: `sub-noemail-${uniqueId}`,
      email: '',
      given_name: 'Jane',
      family_name: 'Farmer'
    })

    await expect(response).toBeApiError(422, { field: 'Email' })
  })

  test('should return 422 Unprocessable Content when the email claim has an invalid format', async ({
    apiClient
  }) => {
    const response = await apiClient.ensureUserAccount({
      sub: `sub-bademail-${uniqueId}`,
      email: 'not-a-valid-email',
      given_name: 'Jane',
      family_name: 'Farmer'
    })

    await expect(response).toBeApiError(422, { field: 'Email' })
  })

  test('should return 422 Unprocessable Content when given_name or family_name is missing', async ({
    apiClient
  }) => {
    const resNoFirst = await apiClient.ensureUserAccount({
      sub: `sub-nofirst-${uniqueId}`,
      email: testEmail,
      given_name: '',
      family_name: 'Farmer'
    })
    await expect(resNoFirst).toBeApiError(422, { field: 'GivenName' })

    const resNoLast = await apiClient.ensureUserAccount({
      sub: `sub-nolast-${uniqueId}`,
      email: testEmail,
      given_name: 'Jane',
      family_name: ''
    })
    await expect(resNoLast).toBeApiError(422, { field: 'FamilyName' })
  })

  // =========================================================================
  // Test Suite 5: Security & Business Conflict Constraints
  // =========================================================================

  test('should return 409 Conflict when attempting to bind an email already associated with a different subject', async ({
    apiClient
  }) => {
    // Attempting to create an account with a DIFFERENT subject but ownerEmail (already bound to testSub)
    const conflictingSub = `sub-conflict-${uniqueId}`
    const response = await apiClient.ensureUserAccount({
      sub: conflictingSub,
      email: ownerEmail,
      given_name: 'Another',
      family_name: 'Person'
    })

    await expect(response).toBeApiError(409, { title: 'Conflict' })
  })

  test('should return 409 Conflict when attempting to bind an email already associated with a different subject even if whitespace-padded [LKPR-273]', async ({
    apiClient
  }) => {
    // Attempting to bind ownerEmail with whitespace padding to a different subject
    const paddedSub = `sub-padded-conflict-${uniqueId}`
    const response = await apiClient.ensureUserAccount({
      sub: paddedSub,
      email: `  ${ownerEmail}  `,
      given_name: 'Whitespace',
      family_name: 'Padded'
    })

    await expect(response).toBeApiError(409, { title: 'Conflict' })
  })

  test('should return 401 Unauthorized on POST /ensure when Authorization header is missing or invalid', async ({
    apiClient
  }) => {
    const gatewayKey = process.env.GATEWAY_API_KEY || process.env.API_KEY || ''

    // Missing Authorization
    const resNoAuth = await apiClient.post('api/v2/user-accounts', {
      headers: {
        'x-api-key': gatewayKey,
        'Content-Type': 'application/json'
      },
      data: {
        sub: `sub-auth-${uniqueId}`,
        email: testEmail,
        given_name: 'Auth',
        family_name: 'Test'
      }
    })
    expect(resNoAuth.status()).toBe(401)

    // Invalid Authorization
    const resInvalidAuth = await apiClient.post('api/v2/user-accounts', {
      headers: {
        'x-api-key': gatewayKey,
        Authorization: 'Basic aW52YWxpZC11c2VyOmludmFsaWQtcGFzcw==',
        'Content-Type': 'application/json'
      },
      data: {
        sub: `sub-auth-${uniqueId}`,
        email: testEmail,
        given_name: 'Auth',
        family_name: 'Test'
      }
    })
    expect(resInvalidAuth.status()).toBe(401)
  })

  test('should return 401 Unauthorized on GET /session when Authorization header is missing or invalid', async ({
    apiClient
  }) => {
    const gatewayKey = process.env.GATEWAY_API_KEY || process.env.API_KEY || ''

    // Missing Authorization
    const resNoAuth = await apiClient.get(`api/v2/user-accounts/${testSub}`, {
      headers: {
        'x-api-key': gatewayKey
      }
    })
    expect(resNoAuth.status()).toBe(401)

    // Invalid Authorization
    const resInvalidAuth = await apiClient.get(
      `api/v2/user-accounts/${testSub}`,
      {
        headers: {
          'x-api-key': gatewayKey,
          Authorization: 'Basic aW52YWxpZC11c2VyOmludmFsaWQtcGFzcw=='
        }
      }
    )
    expect(resInvalidAuth.status()).toBe(401)
  })
})
