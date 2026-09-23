import { APIRequestContext, APIResponse, expect } from '@playwright/test'
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
   * Helper that retrieves CPH associations and asserts HTTP 200 OK, returning the parsed array.
   */
  async getCphAssociationsData(email: string): Promise<CphAssociation[]> {
    const response = await this.getCphAssociations(email)
    expect(
      response.ok(),
      `GET cph-associations failed with HTTP ${response.status()} at [${response.url()}]: ${await response.text()}`
    ).toBeTruthy()
    return response.json()
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
