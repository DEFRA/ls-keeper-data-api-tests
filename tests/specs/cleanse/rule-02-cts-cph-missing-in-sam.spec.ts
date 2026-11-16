import { test, expect } from '../../fixtures/base.fixture.js'
import {
  assertActiveCleanseIssue,
  readCleanseSetupState,
  type CleanseIssueDto,
  type CleansePagedResult,
  type CleanseRuleDto,
  type CleanseSetupState
} from '../../helpers/cleanse-client.js'

test.describe
  .serial('Cleanse Rule 2: Active CTS CPH Number Missing from SAM (LKPR-184)', () => {
  let setupState: CleanseSetupState

  test.beforeAll(() => {
    setupState = readCleanseSetupState()
  })

  test('should register Rule 2 as the priority 1 rule in the active rule book with errorCode 02 and description CTS-CPH-missing-in-Sam', async ({
    cleanseClient
  }) => {
    const response = await cleanseClient.getRules()
    expect(response.status()).toBe(200)

    const rules = (await response.json()) as CleanseRuleDto[]
    const rule02 = rules.find((r) => r.ruleId === '2')

    expect(rule02).toBeDefined()
    expect(rule02).toMatchObject({
      ruleId: '2',
      ruleNumber: '2',
      name: 'CTS CPH missing from Sam',
      errorCode: '02',
      errorDescription: 'CTS-CPH-missing-in-Sam',
      summary:
        'A non-slaughterhouse CTS open location whose CPH is absent from the SAM Holding dataset.',
      priority: 1,
      status: 'active'
    })
  })

  test('should raise active Rule 2 issues for all 3 English CTS Open Locations absent from SAM and resolve via GET /v1/issues/{id} (AC01)', async ({
    cleanseClient
  }) => {
    const response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '2',
      status: 'active',
      pageSize: 100
    })

    expect(response.status()).toBe(200)
    const body = (await response.json()) as CleansePagedResult<CleanseIssueDto>

    expect(body.pageNumber).toBe(1)
    expect(body.totalCount).toBe(3)
    expect(body.totalPages).toBe(1)
    expect(body.items).toHaveLength(3)

    const expectedByCph: Record<
      string,
      {
        ctsLocationNumber: string
        ctsCountyName: string
        ctsKeeperSurname: string
        ctsKeeperPostCode: string
      }
    > = {
      '05/301/0127': {
        ctsLocationNumber: 'AH-05/301/0127',
        ctsCountyName: 'DERWENTSHIRE North',
        ctsKeeperSurname: 'KEEPER8',
        ctsKeeperPostCode: 'SW1A 1AA'
      },
      '10/255/0082': {
        ctsLocationNumber: 'AH-10/255/0082',
        ctsCountyName: 'GARTHSHIRE South',
        ctsKeeperSurname: 'KEEPER9',
        ctsKeeperPostCode: 'SW1A 1AA'
      },
      '49/528/0126': {
        ctsLocationNumber: 'AH-49/528/0126',
        ctsCountyName: 'VALESHIRE North',
        ctsKeeperSurname: 'KEEPER6',
        ctsKeeperPostCode: 'SW1A 1AA'
      }
    }

    const actualCphs = body.items.map((item) => item.context.cph).sort()
    expect(actualCphs).toEqual(['05/301/0127', '10/255/0082', '49/528/0126'])

    for (const issue of body.items) {
      const cph = issue.context.cph!
      const expected = expectedByCph[cph]
      expect(expected).toBeDefined()

      assertActiveCleanseIssue(issue, {
        ruleId: '2',
        runId: setupState.runId
      })

      expect(issue.context).toMatchObject({
        cph,
        ruleNumber: '2',
        errorCode: '02',
        errorDescription: 'CTS-CPH-missing-in-Sam',
        ctsLocationNumber: expected.ctsLocationNumber,
        ctsPremisesType: 'AH',
        ctsCountyName: expected.ctsCountyName,
        ctsKeeperSurname: expected.ctsKeeperSurname,
        ctsKeeperPostCode: expected.ctsKeeperPostCode
      })

      // Rule 2 issues have no SAM record to attach
      expect(issue.context).not.toHaveProperty('samHoldingId')
      expect(issue.context).not.toHaveProperty('samFeatureName')
      expect(issue.context).not.toHaveProperty('samSpeciesCodes')
    }

    // Verify direct single-issue lookup endpoint returns the identical record
    const firstIssue = body.items[0]
    const detailResponse = await cleanseClient.getIssue(firstIssue.id)
    expect(detailResponse.status()).toBe(200)
    const detailIssue = (await detailResponse.json()) as CleanseIssueDto
    expect(detailIssue).toEqual(firstIssue)
  })

  test('should NOT raise a Rule 2 issue when an active CTS CPH matches a CPH in SAM', async ({
    cleanseClient
  }) => {
    const matchedInSamCphs = [
      '31/124/0042',
      '21/173/0011',
      '32/199/9001',
      '40/139/0012',
      '28/166/7000'
    ]

    for (const cph of matchedInSamCphs) {
      const rule02SearchRes = await cleanseClient.getIssues({
        groupId: 'cts-sam',
        ruleId: '2',
        status: 'active',
        searchTerm: cph
      })
      expect(rule02SearchRes.status()).toBe(200)
      const rule02SearchBody =
        (await rule02SearchRes.json()) as CleansePagedResult<CleanseIssueDto>
      expect(
        rule02SearchBody.totalCount,
        `Expected matched SAM holding ${cph} to raise 0 Rule 2 issues`
      ).toBe(0)
      expect(rule02SearchBody.items).toEqual([])
    }

    // False-positive guard: verify 21/173/0011 and 31/124/0042 were evaluated in this run (via Rule 1)
    const rule01Response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '1',
      status: 'active',
      pageSize: 100
    })
    expect(rule01Response.status()).toBe(200)
    const rule01Body =
      (await rule01Response.json()) as CleansePagedResult<CleanseIssueDto>
    const rule01Cphs = rule01Body.items
      .filter((item) => item.runId === setupState.runId)
      .map((item) => item.context.cph)
      .sort()
    expect(rule01Cphs).toEqual(['21/173/0011', '31/124/0042'])
  })

  test('should NOT raise any Cleanse issues across the cts-sam group for non-English CTS CPHs (county > 51) or SAM-only CPHs absent from CTS', async ({
    cleanseClient
  }) => {
    // Query across ALL rules in the cts-sam group (without ruleId filter)
    const allGroupIssuesRes = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      status: 'active',
      pageSize: 100
    })

    expect(allGroupIssuesRes.status()).toBe(200)
    const allGroupBody =
      (await allGroupIssuesRes.json()) as CleansePagedResult<CleanseIssueDto>

    // Non-vacuous positive control: the group has active issues from this run
    expect(allGroupBody.totalCount).toBeGreaterThanOrEqual(5)
    const allFlaggedCphs = allGroupBody.items.map((item) => item.context.cph)

    // Non-English CPHs present in CT_LOCATION_IDENTIFIERS_BASELINE.csv (counties 75 and 83 > 51)
    const nonEnglishCtsCphs = ['75/306/0062', '83/520/0029']
    for (const cph of nonEnglishCtsCphs) {
      expect(allFlaggedCphs).not.toContain(cph)
    }

    // SAM-only CPHs present in LITP_SAMCPHHOLDING_BASELINE.csv but absent from CTS
    const samOnlyCphs = [
      '37/002/0002',
      '37/003/0003',
      '37/004/0004',
      '37/005/0005',
      '37/006/0006'
    ]
    for (const cph of samOnlyCphs) {
      expect(allFlaggedCphs).not.toContain(cph)
    }
  })

  test('should ensure CPHs flagged by Rule 2 do not trigger any downstream SAM comparison rules (Rules 1, 3, or 10)', async ({
    cleanseClient
  }) => {
    const ctsOnlyCphs = ['05/301/0127', '10/255/0082', '49/528/0126']

    for (const cph of ctsOnlyCphs) {
      const response = await cleanseClient.getIssues({
        groupId: 'cts-sam',
        status: 'active',
        searchTerm: cph,
        pageSize: 100
      })

      expect(response.status()).toBe(200)
      const body =
        (await response.json()) as CleansePagedResult<CleanseIssueDto>

      // Exactly 1 issue exists across the entire cts-sam group for this CPH, and it is Rule 2
      expect(body.totalCount).toBe(1)
      expect(body.items).toHaveLength(1)
      expect(body.items[0].ruleId).toBe('2')
      expect(body.items[0].runId).toBe(setupState.runId)
      expect(body.items[0].context.cph).toBe(cph)
    }
  })
})
