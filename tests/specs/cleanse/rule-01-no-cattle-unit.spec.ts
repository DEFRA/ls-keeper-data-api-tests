import fs from 'fs'
import path from 'path'
import { test, expect } from '../../fixtures/base.fixture.js'
import type {
  CleanseIssueDto,
  CleansePagedResult,
  CleanseRuleDto
} from '../../helpers/cleanse-client.js'

interface CleanseSetupState {
  runId: string
  recordsProcessed: number
  completedAtUtc: string
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RULE_01_ISSUE_ID_REGEX = /^1-[A-Z2-7]{16}$/

function readCleanseSetupState(): CleanseSetupState {
  const statePath = path.resolve('.cache', 'cleanse-setup.json')
  expect(
    fs.existsSync(statePath),
    `Expected Cleanse setup state file at ${statePath}. Run cleanse-setup first.`
  ).toBe(true)
  return JSON.parse(fs.readFileSync(statePath, 'utf8')) as CleanseSetupState
}

test.describe
  .serial('Cleanse Rule 1: No Cattle Unit in SAM — BSN, CTT, BFF (LKPR-182)', () => {
  let setupState: CleanseSetupState

  test.beforeAll(() => {
    setupState = readCleanseSetupState()
    expect(setupState.runId).toBeTruthy()
    expect(setupState.recordsProcessed).toBe(8)
  })

  test('should register Rule 1 in the active rule book with errorCode 01, priority 2, and description No-cattle-unit-in-Sam', async ({
    cleanseClient
  }) => {
    const response = await cleanseClient.getRules()
    expect(response.status()).toBe(200)

    const rules = (await response.json()) as CleanseRuleDto[]
    const rule01 = rules.find((r) => r.ruleId === '1')

    expect(rule01).toBeDefined()
    expect(rule01).toMatchObject({
      ruleId: '1',
      ruleNumber: '1',
      name: 'No cattle unit in Sam',
      errorCode: '01',
      errorDescription: 'No-cattle-unit-in-Sam',
      summary:
        'The SAM Holding record has no animal species code of Bison, Cattle or Buffalo (BSN, CTT, BFF).',
      priority: 2,
      status: 'active'
    })
  })

  test('should raise an active Rule 1 issue when a SAM holding exists with only non-cattle species (SHP) and resolve via GET /v1/issues/{id}', async ({
    cleanseClient
  }) => {
    const response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '1',
      status: 'active',
      searchTerm: '31/124/0042'
    })

    expect(response.status()).toBe(200)
    const body = (await response.json()) as CleansePagedResult<CleanseIssueDto>

    expect(body.pageNumber).toBe(1)
    expect(body.totalCount).toBe(1)
    expect(body.totalPages).toBe(1)
    expect(body.items).toHaveLength(1)

    const issue = body.items[0]
    expect(issue.id).toMatch(RULE_01_ISSUE_ID_REGEX)
    expect(issue.groupId).toBe('cts-sam')
    expect(issue.ruleId).toBe('1')
    expect(issue.runId).toBe(setupState.runId)
    expect(issue.status).toBe('active')
    expect(issue.workflowStatus).toBe('todo')
    expect(issue.createdAtUtc).toBeIso8601Utc()
    expect(issue.updatedAtUtc).toBeIso8601Utc()
    expect(issue.activatedAtUtc).toBeIso8601Utc()
    expect(issue.deactivatedAtUtc).toBeNull()

    expect(issue.context).toMatchObject({
      cph: '31/124/0042',
      ruleNumber: '1',
      errorCode: '01',
      errorDescription: 'No-cattle-unit-in-Sam',
      ctsLocationNumber: 'AH-31/124/0042',
      ctsPremisesType: 'AH',
      ctsCountyName: 'ASHSHIRE Vale',
      ctsKeeperSurname: 'KEEPER1',
      ctsKeeperPostCode: 'SW1A 1AA',
      samFeatureName: 'FARM 1',
      samSpeciesCodes: 'SHP'
    })
    expect(issue.context.samHoldingId).toMatch(UUID_REGEX)

    // Verify direct single-issue lookup endpoint returns the identical record
    const detailResponse = await cleanseClient.getIssue(issue.id)
    expect(detailResponse.status()).toBe(200)
    const detailIssue = (await detailResponse.json()) as CleanseIssueDto
    expect(detailIssue).toEqual(issue)
  })

  test('should raise an active Rule 1 issue with no samSpeciesCodes when a SAM holding has no animal species code recorded', async ({
    cleanseClient
  }) => {
    const response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '1',
      status: 'active',
      searchTerm: '21/173/0011'
    })

    expect(response.status()).toBe(200)
    const body = (await response.json()) as CleansePagedResult<CleanseIssueDto>

    expect(body.pageNumber).toBe(1)
    expect(body.totalCount).toBe(1)
    expect(body.totalPages).toBe(1)
    expect(body.items).toHaveLength(1)

    const issue = body.items[0]
    expect(issue.id).toMatch(RULE_01_ISSUE_ID_REGEX)
    expect(issue.groupId).toBe('cts-sam')
    expect(issue.ruleId).toBe('1')
    expect(issue.runId).toBe(setupState.runId)
    expect(issue.status).toBe('active')
    expect(issue.workflowStatus).toBe('todo')
    expect(issue.createdAtUtc).toBeIso8601Utc()
    expect(issue.updatedAtUtc).toBeIso8601Utc()
    expect(issue.activatedAtUtc).toBeIso8601Utc()
    expect(issue.deactivatedAtUtc).toBeNull()

    expect(issue.context).toMatchObject({
      cph: '21/173/0011',
      ruleNumber: '1',
      errorCode: '01',
      errorDescription: 'No-cattle-unit-in-Sam',
      ctsLocationNumber: 'AH-21/173/0011',
      ctsPremisesType: 'AH',
      ctsCountyName: 'BRACKENSHIRE North',
      ctsKeeperSurname: 'KEEPER2',
      ctsKeeperPostCode: 'SW1A 1AA',
      samFeatureName: 'FARM 2'
    })
    expect(issue.context.samHoldingId).toMatch(UUID_REGEX)
    expect(issue.context).not.toHaveProperty('samSpeciesCodes')
  })

  test('should NOT raise a Rule 1 issue when a SAM holding has a valid cattle species code (CTT, BSN, or BFF)', async ({
    cleanseClient
  }) => {
    const rule01Response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '1',
      status: 'active',
      pageSize: 100
    })

    expect(rule01Response.status()).toBe(200)
    const rule01Body =
      (await rule01Response.json()) as CleansePagedResult<CleanseIssueDto>

    // Non-vacuous positive control: exactly the 2 non-cattle holdings are flagged by Rule 1 in this run
    expect(rule01Body.totalCount).toBe(2)
    expect(rule01Body.items).toHaveLength(2)
    for (const item of rule01Body.items) {
      expect(item.runId).toBe(setupState.runId)
    }

    const rule01FlaggedCphs = rule01Body.items
      .map((item) => item.context.cph)
      .sort()
    expect(rule01FlaggedCphs).toEqual(['21/173/0011', '31/124/0042'])

    // 32/199/9001 (CTT), 40/139/0012 (BSN), and 28/166/7000 (BFF) must not be flagged by Rule 1
    const cattleHoldings = ['32/199/9001', '40/139/0012', '28/166/7000']
    for (const cph of cattleHoldings) {
      expect(rule01FlaggedCphs).not.toContain(cph)
    }

    // False-positive guard: verify these 3 CPHs were NOT absent from SAM (which would have raised Rule 2 instead of evaluating Rule 1)
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

    for (const cph of cattleHoldings) {
      expect(
        rule02FlaggedCphs,
        `Expected cattle holding ${cph} to exist in SAM and not raise Rule 2`
      ).not.toContain(cph)
    }
  })

  test('should NOT raise a Rule 1 issue when a CTS location CPH is absent from SAM (subordinate to Rule 2)', async ({
    cleanseClient
  }) => {
    const ctsOnlyCph = '49/528/0126'

    // 1. Verify Rule 1 does NOT fire for a CTS location that is missing from SAM
    const rule01Response = await cleanseClient.getIssues({
      groupId: 'cts-sam',
      ruleId: '1',
      status: 'active',
      searchTerm: ctsOnlyCph
    })

    expect(rule01Response.status()).toBe(200)
    const rule01Body =
      (await rule01Response.json()) as CleansePagedResult<CleanseIssueDto>

    expect(rule01Body.totalCount).toBe(0)
    expect(rule01Body.items).toEqual([])

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
    expect(rule02Body.items[0].context).toMatchObject({
      cph: ctsOnlyCph,
      errorCode: '02',
      errorDescription: 'CTS-CPH-missing-in-Sam',
      ctsLocationNumber: `AH-${ctsOnlyCph}`
    })
  })
})
