import { APIRequestContext, APIResponse, expect } from '@playwright/test'
import { resolveCleanseBaseUrl } from './url-resolver.js'

export interface CleansePagedResult<T> {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface CleanseRuleDto {
  ruleId: string
  ruleNumber: string
  name: string
  errorCode: string
  errorDescription: string
  summary: string
  priority: number
  status: 'active' | 'onhold' | string
}

export interface CleanseIssueDto {
  id: string
  groupId: string
  ruleId: string
  runId: string
  status: 'active' | 'inactive' | string
  workflowStatus:
    | 'todo'
    | 'in-progress'
    | 'resolved'
    | 'ignored'
    | 'suppressed'
    | string
  assignedTo: string | null
  notes: string | null
  externalNotes: string | null
  priority: string | null
  externalReceivedAtUtc: string | null
  suppressionExpiresAtUtc: string | null
  context: Record<string, string | undefined>
  createdAtUtc: string
  updatedAtUtc: string
  activatedAtUtc: string
  deactivatedAtUtc: string | null
  version: number
  assignedUserId?: string | null
  assignedUserFullName?: string | null
  assignmentDetachedAtUtc?: string | null
}

export interface CleanseRuleRunDto {
  runId: string
  groupId: string
  state: 'running' | 'completed' | 'failed' | 'abandoned' | 'cancelled' | string
  startedAtUtc: string
  finishedAtUtc: string | null
  abandonReason: string | null
  detectionsProcessed: number
  issuesCreated: number
  issuesReactivated: number
  issuesUpdated: number
  issuesUnchanged: number
  issuesDeactivated: number
  currentStage: string | null
  recordsProcessed: number
  recordsTotal: number
  progressPercent: number
  elapsedSeconds: number
  estimatedCompletionAtUtc: string | null
  heartbeatAtUtc: string | null
  cancellationRequested: boolean
  failureMessage: string | null
  failureDetail?: string | null
}

export interface CleanseRequestOptions {
  headers?: Record<string, string>
  params?: Record<string, string>
}

export interface GetCleanseIssuesOptions extends CleanseRequestOptions {
  groupId?: string
  ruleId?: string
  runId?: string
  status?: 'active' | 'inactive' | string
  workflowStatus?: string
  assignedTo?: string
  unassigned?: boolean
  searchTerm?: string
  sortBy?: string
  sortDirection?: 'Ascending' | 'Descending' | string
  pageNumber?: number
  pageSize?: number
}

export class CleanseApiClient {
  constructor(
    public readonly request: APIRequestContext,
    private baseUrl = resolveCleanseBaseUrl(),
    private gatewayApiKey = process.env.GATEWAY_API_KEY ||
      process.env.API_KEY ||
      '',
    private cleanseApiKey = process.env.CLEANSE_API_KEY || ''
  ) {}

  private resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path
    }
    return `${this.baseUrl}${path.replace(/^\//, '')}`
  }

  get(
    path: string,
    options?: Parameters<APIRequestContext['get']>[1]
  ): Promise<APIResponse> {
    return this.request.get(this.resolveUrl(path), options)
  }

  post(
    path: string,
    options?: Parameters<APIRequestContext['post']>[1]
  ): Promise<APIResponse> {
    return this.request.post(this.resolveUrl(path), options)
  }

  /**
   * Generates authentication headers for ls-cleanse-api
   */
  getHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {}
    if (this.gatewayApiKey) {
      headers['x-api-key'] = this.gatewayApiKey
    }
    if (this.cleanseApiKey) {
      headers['x-cleanse-api-key'] = this.cleanseApiKey
    }
    return { ...headers, ...customHeaders }
  }

  /**
   * GET /v1/rules
   * Retrieves the registered Cleanse rule book in execution order.
   */
  async getRules(options: CleanseRequestOptions = {}): Promise<APIResponse> {
    return this.get('v1/rules', {
      headers: this.getHeaders(options.headers),
      params: options.params
    })
  }

  /**
   * GET /v1/issues
   * Searches Cleanse issues with optional filtering and pagination.
   */
  async getIssues(options: GetCleanseIssuesOptions = {}): Promise<APIResponse> {
    const {
      groupId,
      ruleId,
      runId,
      status,
      workflowStatus,
      assignedTo,
      unassigned,
      searchTerm,
      sortBy,
      sortDirection,
      pageNumber,
      pageSize,
      headers,
      params
    } = options

    const queryParams: Record<string, string> = {
      ...(groupId !== undefined ? { groupId } : {}),
      ...(ruleId !== undefined ? { ruleId } : {}),
      ...(runId !== undefined ? { runId } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(workflowStatus !== undefined ? { workflowStatus } : {}),
      ...(assignedTo !== undefined ? { assignedTo } : {}),
      ...(unassigned !== undefined ? { unassigned: String(unassigned) } : {}),
      ...(searchTerm !== undefined ? { searchTerm } : {}),
      ...(sortBy !== undefined ? { sortBy } : {}),
      ...(sortDirection !== undefined ? { sortDirection } : {}),
      ...(pageNumber !== undefined ? { pageNumber: String(pageNumber) } : {}),
      ...(pageSize !== undefined ? { pageSize: String(pageSize) } : {}),
      ...params
    }

    return this.get('v1/issues', {
      headers: this.getHeaders(headers),
      params: queryParams
    })
  }

  /**
   * GET /v1/issues/{id}
   * Retrieves a single Cleanse issue by its deterministic ID.
   */
  async getIssue(
    id: string,
    options: CleanseRequestOptions = {}
  ): Promise<APIResponse> {
    return this.get(`v1/issues/${encodeURIComponent(id)}`, {
      headers: this.getHeaders(options.headers),
      params: options.params
    })
  }

  /**
   * GET /v1/runs
   * Searches rule run history.
   */
  async getRuns(
    params: {
      groupId?: string
      state?: string
      pageNumber?: number
      pageSize?: number
    } = {},
    options: CleanseRequestOptions = {}
  ): Promise<APIResponse> {
    const queryParams: Record<string, string> = {
      ...(params.groupId !== undefined ? { groupId: params.groupId } : {}),
      ...(params.state !== undefined ? { state: params.state } : {}),
      ...(params.pageNumber !== undefined
        ? { pageNumber: String(params.pageNumber) }
        : {}),
      ...(params.pageSize !== undefined
        ? { pageSize: String(params.pageSize) }
        : {}),
      ...options.params
    }

    return this.get('v1/runs', {
      headers: this.getHeaders(options.headers),
      params: queryParams
    })
  }

  /**
   * GET /v1/runs/{runId}
   * Retrieves status and counters for a single Cleanse rule run.
   */
  async getRun(
    runId: string,
    options: CleanseRequestOptions = {}
  ): Promise<APIResponse> {
    return this.get(`v1/runs/${encodeURIComponent(runId)}`, {
      headers: this.getHeaders(options.headers),
      params: options.params
    })
  }

  /**
   * POST /v1/runs/trigger
   * Triggers the built-in Cleanse rules engine in the background.
   */
  async triggerRun(options: CleanseRequestOptions = {}): Promise<APIResponse> {
    return this.post('v1/runs/trigger', {
      headers: this.getHeaders(options.headers),
      params: options.params
    })
  }

  /**
   * Polls a Cleanse rule run until it reaches 'completed'.
   */
  async pollRunUntilComplete(
    runId: string,
    timeout = 120000,
    interval = 1500
  ): Promise<CleanseRuleRunDto> {
    let latestRun: CleanseRuleRunDto | undefined

    await expect
      .poll(
        async () => {
          const response = await this.getRun(runId)
          expect(
            response.ok(),
            `Get run ${runId} failed with HTTP ${response.status()} at [${response.url()}]: ${await response.text()}`
          ).toBeTruthy()

          latestRun = (await response.json()) as CleanseRuleRunDto

          if (
            latestRun.state === 'failed' ||
            latestRun.state === 'abandoned' ||
            latestRun.state === 'cancelled'
          ) {
            throw new Error(
              `Cleanse run ${runId} ended in state '${latestRun.state}': ${latestRun.failureMessage || latestRun.abandonReason || JSON.stringify(latestRun)}`
            )
          }

          return latestRun.state === 'completed'
        },
        {
          message: `Cleanse run ${runId} did not reach 'completed' state within ${timeout}ms.`,
          timeout,
          intervals: [interval]
        }
      )
      .toBeTruthy()

    return latestRun!
  }

  /**
   * Waits for any in-flight run to finish, triggers a fresh Cleanse rule run, and polls until completed.
   */
  async triggerAndWaitForRun(
    timeout = 120000,
    interval = 1500
  ): Promise<CleanseRuleRunDto> {
    // If a run is currently in flight, wait for it to finish before triggering a new pass
    const runningRes = await this.getRuns({
      groupId: 'cts-sam',
      state: 'running',
      pageSize: 1
    })
    if (runningRes.ok()) {
      const runningBody =
        (await runningRes.json()) as CleansePagedResult<CleanseRuleRunDto>
      if (runningBody.items.length > 0) {
        await this.pollRunUntilComplete(
          runningBody.items[0].runId,
          timeout,
          interval
        )
      }
    }

    const triggerRes = await this.triggerRun()
    expect(
      triggerRes.status(),
      `Trigger Cleanse run failed with HTTP ${triggerRes.status()} at [${triggerRes.url()}]: ${await triggerRes.text()}`
    ).toBe(202)

    const triggered = (await triggerRes.json()) as CleanseRuleRunDto
    return this.pollRunUntilComplete(triggered.runId, timeout, interval)
  }
}
