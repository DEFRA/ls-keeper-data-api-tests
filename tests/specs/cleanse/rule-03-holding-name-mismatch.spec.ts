import { test, expect } from '../../fixtures/base.fixture.js'
import {
  assertActiveCleanseIssue,
  readCleanseSetupState,
  type CleanseIssueDto,
  type CleansePagedResult,
  type CleanseRuleDto,
  type CleanseSetupState
} from '../../helpers/cleanse-client.js'

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

test.describe
  .serial('Cleanse Rule 3: Holding Name Mismatch in SAM (LKPR-185)', () => {
  let setupState: CleanseSetupState

  test.beforeAll(() => {
    setupState = readCleanseSetupState()
  })

  test('should register Rule 3 as the priority 3 rule in the active rule book with errorCode 03 and description Holding-name-mismatch-in-Sam', async ({
    cleanseClient
  }) => {
    const response = await cleanseClient.getRules()
    expect(response.status()).toBe(200)

    const rules = (await response.json()) as CleanseRuleDto[]
    const rule03 = rules.find((r) => r.ruleId === '3')

    expect(rule03).toBeDefined()
    expect(rule03).toMatchObject({
      ruleId: '3',
      ruleNumber: '3',
      name: 'Holding name mismatch',
      errorCode: '03',
      errorDescription: 'Holding-name-mismatch-in-Sam',
      summary:
        'The SAM Holding has no usable FeatureName, or it does not identify the same place as the CTS open location name.',
      priority: 3,
      status: 'active'
    })
  })

  test('should raise an active Rule 3 issue with nameMismatchReason missing when SAM FeatureName is Not Known (normalised to null in SQLite) and resolve via GET /v1/issues/{id} (AC01)', async ({
    cleanseClient
  }) => {
    const response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '3',
      status: 'active',
      searchTerm: '40/139/0012'
    })

    expect(response.status()).toBe(200)
    const body = (await response.json()) as CleansePagedResult<CleanseIssueDto>

    expect(body.pageNumber).toBe(1)
    expect(body.totalCount).toBe(1)
    expect(body.totalPages).toBe(1)
    expect(body.items).toHaveLength(1)

    const issue = body.items[0]
    assertActiveCleanseIssue(issue, {
      ruleId: '3',
      runId: setupState.runId
    })

    expect(issue.context).toMatchObject({
      cph: '40/139/0012',
      ruleNumber: '3',
      errorCode: '03',
      errorDescription: 'Holding-name-mismatch-in-Sam',
      ctsLocationNumber: 'AH-40/139/0012',
      ctsPremisesType: 'AH',
      ctsCountyName: 'PENSHIRE East',
      ctsKeeperSurname: 'KEEPER5',
      ctsKeeperPostCode: 'SW1A 1AA',
      ctsLocationName: 'FARM 5',
      ctsLocationAddress2: 'FARM LANE',
      samAddressName: 'FARM 5',
      samAddressNameMatchesCts: 'true',
      nameMismatchReason: 'missing'
    })
    expect(issue.context.samHoldingId).toMatch(UUID_REGEX)
    expect(issue.context).not.toHaveProperty('samFeatureName')
    expect(issue.context).not.toHaveProperty('nameSimilarity')

    // Verify direct single-issue lookup endpoint returns the identical record
    const detailResponse = await cleanseClient.getIssue(issue.id)
    expect(detailResponse.status()).toBe(200)
    const detailIssue = (await detailResponse.json()) as CleanseIssueDto
    expect(detailIssue).toEqual(issue)
  })

  test('should raise an active Rule 3 issue with nameMismatchReason different and nameSimilarity score when SAM FeatureName does not match CTS location name (AC01)', async ({
    cleanseClient
  }) => {
    const response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '3',
      status: 'active',
      searchTerm: '28/166/7000'
    })

    expect(response.status()).toBe(200)
    const body = (await response.json()) as CleansePagedResult<CleanseIssueDto>

    expect(body.pageNumber).toBe(1)
    expect(body.totalCount).toBe(1)
    expect(body.totalPages).toBe(1)
    expect(body.items).toHaveLength(1)

    const issue = body.items[0]
    assertActiveCleanseIssue(issue, {
      ruleId: '3',
      runId: setupState.runId
    })

    expect(issue.context).toMatchObject({
      cph: '28/166/7000',
      ruleNumber: '3',
      errorCode: '03',
      errorDescription: 'Holding-name-mismatch-in-Sam',
      ctsLocationNumber: 'AH-28/166/7000',
      ctsPremisesType: 'AH',
      ctsCountyName: 'PENSHIRE North',
      ctsKeeperSurname: 'KEEPER7',
      ctsKeeperPostCode: 'SW1A 1AA',
      ctsLocationName: 'FARM 7',
      ctsLocationAddress2: 'FARM LANE',
      samFeatureName: 'Oakwood Grange',
      samAddressName: 'Oakwood Grange',
      samAddressNameMatchesCts: 'false',
      nameMismatchReason: 'different',
      nameSimilarity: '0.23'
    })
    expect(issue.context.samHoldingId).toMatch(UUID_REGEX)
  })

  test('should NOT raise a Rule 3 issue when SAM FeatureName matches CTS location name directly or after Land At prefix normalisation (AC02)', async ({
    cleanseClient
  }) => {
    const rule03Response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '3',
      status: 'active',
      pageSize: 100
    })

    expect(rule03Response.status()).toBe(200)
    const rule03Body =
      (await rule03Response.json()) as CleansePagedResult<CleanseIssueDto>

    // Non-vacuous positive control: exactly the 2 mismatched/placeholder holdings are flagged by Rule 3 in this run
    expect(rule03Body.totalCount).toBe(2)
    expect(rule03Body.items).toHaveLength(2)
    for (const item of rule03Body.items) {
      expect(item.runId).toBe(setupState.runId)
    }

    const rule03FlaggedCphs = rule03Body.items
      .map((item) => item.context.cph)
      .sort()
    expect(rule03FlaggedCphs).toEqual(['28/166/7000', '40/139/0012'])

    // 32/199/9001 ('Land At Farm 4' vs 'FARM 4'), 31/124/0042 ('FARM 1' vs 'FARM 1'), and 21/173/0011 ('FARM 2' vs 'FARM 2') must NOT raise Rule 3
    const matchingHoldings = ['32/199/9001', '31/124/0042', '21/173/0011']
    for (const cph of matchingHoldings) {
      expect(rule03FlaggedCphs).not.toContain(cph)
    }

    // False-positive guard: verify these 3 holdings were NOT absent from SAM (which would have raised Rule 2 instead of evaluating Rule 3)
    const rule02Response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '2',
      status: 'active',
      pageSize: 100
    })
    expect(rule02Response.status()).toBe(200)
    const rule02Body =
      (await rule02Response.json()) as CleansePagedResult<CleanseIssueDto>
    const rule02FlaggedCphs = rule02Body.items.map((item) => item.context.cph)

    for (const cph of matchingHoldings) {
      expect(
        rule02FlaggedCphs,
        `Expected holding ${cph} to exist in SAM and not raise Rule 2`
      ).not.toContain(cph)
    }
  })

  test('should NOT raise a Rule 3 issue when a CTS location CPH is absent from SAM (subordinate to Rule 2)', async ({
    cleanseClient
  }) => {
    const ctsOnlyCph = '49/528/0126'

    // 1. Verify Rule 3 does NOT fire for a CTS location that is missing from SAM
    const rule03Response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '3',
      status: 'active',
      searchTerm: ctsOnlyCph
    })

    expect(rule03Response.status()).toBe(200)
    const rule03Body =
      (await rule03Response.json()) as CleansePagedResult<CleanseIssueDto>

    expect(rule03Body.totalCount).toBe(0)
    expect(rule03Body.items).toEqual([])

    // 2. False-positive guard: prove 49/528/0126 WAS present in CtsOpenLocation and scanned in this run by verifying it raised Rule 2 (02)
    const rule02Response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '2',
      status: 'active',
      searchTerm: ctsOnlyCph
    })

    expect(rule02Response.status()).toBe(200)
    const rule02Body =
      (await rule02Response.json()) as CleansePagedResult<CleanseIssueDto>

    expect(rule02Body.totalCount).toBe(1)
    expect(rule02Body.items).toHaveLength(1)
    expect(rule02Body.items[0].runId).toBe(setupState.runId)
    expect(rule02Body.items[0].ruleId).toBe('2')
  })
})
