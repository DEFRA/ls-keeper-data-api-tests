/**
 * Resolves and normalizes base URLs for Data Bridge and Keeper Data API services
 */
export function resolveBaseUrl(service: 'bridge' | 'api'): string {
  const env = (process.env.ENVIRONMENT || 'dev').toLowerCase()

  if (service === 'bridge') {
    if (process.env.BRIDGE_BASE_URL) {
      return process.env.BRIDGE_BASE_URL.replace(/\/$/, '') + '/'
    }

    if (
      process.env.BASE_URL &&
      (process.env.BASE_URL.includes('ls-keeper-data-bridge-backend') ||
        process.env.BASE_URL.includes('localhost') ||
        process.env.BASE_URL.includes('127.0.0.1'))
    ) {
      return process.env.BASE_URL.replace(/\/$/, '') + '/'
    }

    return `https://ls-keeper-data-bridge-backend.${env}.cdp-int.defra.cloud/`
  }

  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL.replace(/\/$/, '') + '/'
  }

  if (
    process.env.BASE_URL &&
    (process.env.BASE_URL.includes('ls-keeper-data-api') ||
      process.env.BASE_URL.includes('localhost') ||
      process.env.BASE_URL.includes('127.0.0.1'))
  ) {
    return process.env.BASE_URL.replace(/\/$/, '') + '/'
  }

  return `https://ls-keeper-data-api.${env}.cdp-int.defra.cloud/`
}

export const resolveBridgeBaseUrl = (): string => resolveBaseUrl('bridge')
export const resolveApiBaseUrl = (): string => resolveBaseUrl('api')
