import { APIRequestContext, APIResponse } from '@playwright/test'
import { resolveApiBaseUrl } from './url-resolver.js'

export interface CphAssociation {
  cph: string
  role: string
}

export interface ApiErrorResponse {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string[]>
  [key: string]: unknown
}

export interface HoldingAddress {
  udprn: string | null
  addressLine1: string | null
  addressLine2: string | null
  postTown: string | null
  locality: string | null
  postcode: string | null
  country: string | null
}

export interface HoldingLocation {
  osMapReference: string | null
  easting: number | null
  northing: number | null
  address: HoldingAddress
}

export interface HoldingRole {
  code: string
  species: string[]
}

export interface HoldingAssociation {
  customerNumber: string
  title: string | null
  firstName: string | null
  lastName: string | null
  name: string | null
  partyType: string
  email: string | null
  mobile: string | null
  telephone: string | null
  roles: HoldingRole[]
}

export interface HoldingMark {
  mark: string
  startDate: string | null
  endDate: string | null
  species: string[]
}

export interface HoldingDetail {
  identifier: string
  holdingType: string | null
  name: string | null
  startDate: string | null
  endDate: string | null
  location: HoldingLocation
  associations: HoldingAssociation[]
  allowedSpecies: string[]
  marks: HoldingMark[]
}

export interface EnsureUserAccountRequest {
  sub?: string | null
  email?: string | null
  given_name?: string | null
  family_name?: string | null
}

export interface UserAccountCphAssociation {
  id?: string | null
  cphNumber?: string | null
  role?: string | null
  partyId?: string | null
  holdingId?: string | null
  holdingName?: string | null
}

export interface UserAccountDto {
  id?: string | null
  subject?: string | null
  email: string
  firstName?: string | null
  lastName?: string | null
  displayName?: string | null
  cphAssociations?: UserAccountCphAssociation[] | null
  associationsRefreshedDate?: string | null
  lastUpdatedDate: string
}

export interface HoldingDetailPaginatedResult {
  count: number
  totalCount: number
  values: HoldingDetail[] | null
  page: number
  pageSize: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  nextCursor?: string | null
}

export interface GetHoldingsOptions extends KrdsRequestOptions {
  page?: number
  pageSize?: number
  sort?: 'asc' | 'desc' | string
  order?:
    | 'cph'
    | 'identifier'
    | 'name'
    | 'holdingType'
    | 'startDate'
    | 'endDate'
    | string
}

export interface KrdsRequestOptions {
  headers?: Record<string, string>
  params?: Record<string, string>
}

export class KrdsApiClient {
  constructor(
    public readonly request: APIRequestContext,
    private baseUrl = resolveApiBaseUrl(),
    private apiKey = process.env.GATEWAY_API_KEY || process.env.API_KEY || '',
    private apiBasicAuth = process.env.KRDS_API_BASIC_AUTH ||
      process.env.API_BASIC_AUTH ||
      ''
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
   * Generates standard authentication headers for ls-keeper-data-api
   */
  getHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey
    }
    if (this.apiBasicAuth) {
      headers['Authorization'] = `Basic ${this.apiBasicAuth}`
    }
    return { ...headers, ...customHeaders }
  }

  /**
   * GET /api/v2/cph-associations
   * Retrieves CPH holdings associated with a user's email.
   *
   * @param email - The user's email address (optional for negative testing)
   * @param options - Optional headers, query params, or overrides
   */
  async getCphAssociations(
    email?: string,
    options: KrdsRequestOptions = {}
  ): Promise<APIResponse> {
    const params: Record<string, string> = {
      ...(email !== undefined ? { email } : {}),
      ...options.params
    }

    return this.get('api/v2/cph-associations', {
      headers: this.getHeaders(options.headers),
      params
    })
  }

  /**
   * GET /api/v2/holdings/{county}/{parish}/{holding}
   * Retrieves holding details for a CPH by its county, parish, and holding segments.
   */
  async getHolding(
    county: string,
    parish: string,
    holding: string,
    options: KrdsRequestOptions = {}
  ): Promise<APIResponse> {
    return this.get(`api/v2/holdings/${county}/${parish}/${holding}`, {
      headers: this.getHeaders(options.headers),
      params: options.params
    })
  }

  /**
   * GET /api/v2/holdings
   * Retrieves a paginated list of holding details from the cached SAM read model.
   */
  async getHoldings(options: GetHoldingsOptions = {}): Promise<APIResponse> {
    const { page, pageSize, sort, order, headers, params } = options
    const queryParams: Record<string, string> = {
      ...(page !== undefined ? { page: String(page) } : {}),
      ...(pageSize !== undefined ? { pageSize: String(pageSize) } : {}),
      ...(sort !== undefined ? { sort } : {}),
      ...(order !== undefined ? { order } : {}),
      ...params
    }

    return this.get('api/v2/holdings', {
      headers: this.getHeaders(headers),
      params: queryParams
    })
  }

  /**
   * POST /api/v2/user-accounts
   * Ensures a user account exists, refreshing claims and rebuilding CPH associations.
   */
  async ensureUserAccount(
    payload: EnsureUserAccountRequest,
    options: KrdsRequestOptions = {}
  ): Promise<APIResponse> {
    const headers = {
      ...this.getHeaders(options.headers),
      'Content-Type': 'application/json'
    }
    return this.post('api/v2/user-accounts', {
      headers,
      data: payload,
      params: options.params
    })
  }

  /**
   * GET /api/v2/user-accounts/{subject}
   * Retrieves a user account by identity provider subject claim.
   */
  async getUserAccount(
    subject: string,
    options: KrdsRequestOptions = {}
  ): Promise<APIResponse> {
    return this.get(`api/v2/user-accounts/${encodeURIComponent(subject)}`, {
      headers: this.getHeaders(options.headers),
      params: options.params
    })
  }

  /**
   * POST /api/admin/sqlite-cache/refresh
   * Forces the API to refresh its SQLite read-model and CPH caches from S3.
   */
  async refreshSqliteCache(
    cache: 'all' | 'cph' | 'read-model' = 'all',
    force = true,
    options: KrdsRequestOptions = {}
  ): Promise<APIResponse> {
    return this.post('api/admin/sqlite-cache/refresh', {
      headers: this.getHeaders(options.headers),
      params: { cache, force: String(force), ...options.params }
    })
  }
}
