import { expect, APIResponse } from '@playwright/test'
import type { ApiErrorResponse } from './krds-client.js'

export interface ApiErrorMatcherOptions {
  field?: string
  title?: string
  detail?: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace PlaywrightTest {
    interface Matchers<R> {
      toBeApiError(
        expectedStatus: number,
        options?: ApiErrorMatcherOptions
      ): Promise<R>
      toBeIso8601Utc(options?: { allowUtcOffset?: boolean }): R
    }
  }
}

expect.extend({
  /**
   * Asserts that an APIResponse satisfies the RFC 7807 problem details specification
   * and contains the expected HTTP status, title, and optional validation error fields.
   */
  async toBeApiError(
    response: APIResponse,
    expectedStatus: number,
    options: ApiErrorMatcherOptions = {}
  ) {
    const actualStatus = response.status()
    if (actualStatus !== expectedStatus) {
      let bodyText = ''
      try {
        bodyText = await response.text()
      } catch {
        bodyText = '<unreadable body>'
      }
      return {
        pass: false,
        message: () =>
          `Expected response status ${expectedStatus} but received ${actualStatus}. Body: ${bodyText}`
      }
    }

    const contentType = response.headers()['content-type'] || ''
    if (!/application\/(problem\+)?json/i.test(contentType)) {
      return {
        pass: false,
        message: () =>
          `Expected Content-Type to match application/problem+json or application/json, but received "${contentType}".`
      }
    }

    let errorBody: ApiErrorResponse
    try {
      errorBody = await response.json()
    } catch {
      return {
        pass: false,
        message: () =>
          'Failed to parse response body as JSON for RFC 7807 problem details.'
      }
    }

    if (errorBody.status !== undefined && errorBody.status !== expectedStatus) {
      return {
        pass: false,
        message: () =>
          `Expected error body status to be ${expectedStatus} but received ${errorBody.status}.`
      }
    }

    if (!errorBody.title) {
      return {
        pass: false,
        message: () =>
          `Expected RFC 7807 problem details to contain a non-empty "title", but received: ${JSON.stringify(errorBody.title)}.`
      }
    }

    if (options.field) {
      const errors = errorBody.errors || {}
      // Check exact match or case-insensitive match for the field key
      const matchingKey = Object.keys(errors).find(
        (k) => k.toLowerCase() === options.field!.toLowerCase()
      )
      if (!matchingKey || !errors[matchingKey]) {
        return {
          pass: false,
          message: () =>
            `Expected error body to contain validation errors for field "${options.field}", but errors were: ${JSON.stringify(errors)}.`
        }
      }
    }

    if (
      options.title &&
      !errorBody.title.toLowerCase().includes(options.title.toLowerCase())
    ) {
      return {
        pass: false,
        message: () =>
          `Expected error title "${errorBody.title}" to contain "${options.title}".`
      }
    }

    return {
      pass: true,
      message: () =>
        `Response correctly satisfies RFC 7807 problem details specification for status ${expectedStatus}.`
    }
  },

  /**
   * Asserts that a value is a valid ISO-8601 UTC timestamp string (e.g. 2025-01-01T00:00:00Z or 2025-01-01T00:00:00+00:00).
   */
  toBeIso8601Utc(
    received: unknown,
    options: { allowUtcOffset?: boolean } = { allowUtcOffset: true }
  ) {
    if (typeof received !== 'string') {
      return {
        pass: false,
        message: () =>
          `Expected an ISO-8601 date string, but received ${typeof received} (${JSON.stringify(received)}).`
      }
    }

    const isoRegex =
      options.allowUtcOffset !== false
        ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
        : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

    if (!isoRegex.test(received)) {
      return {
        pass: false,
        message: () =>
          `Expected "${received}" to match ISO-8601 UTC format (${isoRegex.source}).`
      }
    }

    const parsed = Date.parse(received)
    if (Number.isNaN(parsed)) {
      return {
        pass: false,
        message: () =>
          `Expected "${received}" to be a semantically valid calendar date, but Date.parse returned NaN.`
      }
    }

    return {
      pass: true,
      message: () => `"${received}" is a valid ISO-8601 UTC timestamp.`
    }
  }
})
