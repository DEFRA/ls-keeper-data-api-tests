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
  .serial('Cleanse Rule 10: Correspondence Address Mismatch in CTS and SAM (LKPR-142)', () => {
  let setupState: CleanseSetupState

  test.beforeAll(() => {
    setupState = readCleanseSetupState()
  })

  test('should register Rule 10 as the priority 4 rule in the active rule book with errorCode 10 and description Inconsistent-correspondence-addresses-in-CTS-and-Sam', async ({
    cleanseClient
  }) => {
    const response = await cleanseClient.getRules()
    expect(response.status()).toBe(200)

    const rules = (await response.json()) as CleanseRuleDto[]
    const rule10 = rules.find((r) => r.ruleId === '10')

    expect(rule10).toBeDefined()
    expect(rule10).toMatchObject({
      ruleId: '10',
      ruleNumber: '10',
      name: 'Correspondence address mismatch',
      errorCode: '10',
      errorDescription: 'Inconsistent-correspondence-addresses-in-CTS-and-Sam',
      summary:
        "The postcode of the SAM CPH holder's correspondence address differs from the postcode CTS sends correspondence to: its correspondence address, or the location address when it has none.",
      priority: 4,
      status: 'active'
    })
  })

  test('should raise an active Rule 10 issue when SAM holder postcode differs from CTS correspondence postcode and resolve via GET /v1/issues/{id} (AC01)', async ({
    cleanseClient
  }) => {
    const response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '10',
      status: 'active',
      searchTerm: '32/199/9001'
    })

    expect(response.status()).toBe(200)
    const body = (await response.json()) as CleansePagedResult<CleanseIssueDto>

    expect(body.pageNumber).toBe(1)
    expect(body.totalCount).toBe(1)
    expect(body.totalPages).toBe(1)
    expect(body.items).toHaveLength(1)

    const issue = body.items[0]
    assertActiveCleanseIssue(issue, {
      ruleId: '10',
      runId: setupState.runId
    })

    expect(issue.context).toMatchObject({
      cph: '32/199/9001',
      ruleNumber: '10',
      errorCode: '10',
      errorDescription: 'Inconsistent-correspondence-addresses-in-CTS-and-Sam',
      ctsLocationNumber: 'AH-32/199/9001',
      ctsPremisesType: 'AH',
      ctsCountyName: 'PENSHIRE East',
      ctsKeeperSurname: 'KEEPER4',
      ctsKeeperPostCode: 'SW1A 1AA',
      samFeatureName: 'Land At Farm 4',
      samCorrespondencePostcode: 'EC1A 1BB',
      samCorrespondencePartyId: 'C9900001',
      samCorrespondencePartyRole: 'holder',
      samHoldingPostcode: 'SW1A 1AA',
      samCorrespondenceIsHoldingAddress: 'false',
      ctsCorrespondencePostcode: 'SW1A 1AA',
      ctsCorrespondenceSource: 'location',
      samPostcodeKnownToCts: 'false',
      addressMismatchReason: 'postcode'
    })
    expect(issue.context.samHoldingId).toMatch(UUID_REGEX)
    expect(issue.context.samCorrespondenceAddress).toContain('EC1A 1BB')
    expect(issue.context.ctsCorrespondenceAddress).toContain('SW1A 1AA')

    // Verify direct single-issue lookup endpoint returns the identical record
    const detailResponse = await cleanseClient.getIssue(issue.id)
    expect(detailResponse.status()).toBe(200)
    const detailIssue = (await detailResponse.json()) as CleanseIssueDto
    expect(detailIssue).toEqual(issue)
  })

  test('should NOT raise a Rule 10 issue when holder postcode matches CTS after normalisation, when any of multiple holders matches, or when SAM has no party postcode', async ({
    cleanseClient
  }) => {
    const rule10Response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '10',
      status: 'active',
      pageSize: 100
    })

    expect(rule10Response.status()).toBe(200)
    const rule10Body =
      (await rule10Response.json()) as CleansePagedResult<CleanseIssueDto>

    // Non-vacuous positive control: only 32/199/9001 is flagged by Rule 10 in this run
    expect(rule10Body.totalCount).toBe(1)
    expect(rule10Body.items).toHaveLength(1)
    expect(rule10Body.items[0].runId).toBe(setupState.runId)
    expect(rule10Body.items[0].context.cph).toBe('32/199/9001')

    // 40/139/0012 ('sw1a1aa' == 'SW1A 1AA'), 28/166/7000 (1 of 2 holders matches), 31/124/0042 & 21/173/0011 (no party) must NOT raise Rule 10
    const silentHoldings = [
      '40/139/0012',
      '28/166/7000',
      '31/124/0042',
      '21/173/0011'
    ]
    const flaggedCphs = rule10Body.items.map((item) => item.context.cph)
    for (const cph of silentHoldings) {
      expect(flaggedCphs).not.toContain(cph)
    }
  })

  test('should NOT raise a Rule 10 issue when a CTS location CPH is absent from SAM (subordinate to Rule 2)', async ({
    cleanseClient
  }) => {
    const ctsOnlyCph = '49/528/0126'

    const rule10Response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '10',
      status: 'active',
      searchTerm: ctsOnlyCph
    })

    expect(rule10Response.status()).toBe(200)
    const rule10Body =
      (await rule10Response.json()) as CleansePagedResult<CleanseIssueDto>

    expect(rule10Body.totalCount).toBe(0)
    expect(rule10Body.items).toEqual([])

    // False-positive guard: prove 49/528/0126 WAS scanned in this run via Rule 2
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
