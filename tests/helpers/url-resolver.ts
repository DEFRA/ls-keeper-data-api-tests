/**
 * Resolves and normalizes base URLs for Data Bridge, Keeper Data API, and Cleanse API services
 */
export function resolveBaseUrl(service: 'bridge' | 'api' | 'cleanse'): string {
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

  if (service === 'cleanse') {
    if (process.env.CLEANSE_BASE_URL) {
      return process.env.CLEANSE_BASE_URL.replace(/\/$/, '') + '/'
    }

    if (
      process.env.BASE_URL &&
      (process.env.BASE_URL.includes('ls-cleanse-api') ||
        process.env.BASE_URL.includes('localhost') ||
        process.env.BASE_URL.includes('127.0.0.1'))
    ) {
      return process.env.BASE_URL.replace(/\/$/, '') + '/'
    }

    if (
      process.env.BRIDGE_BASE_URL?.includes('ephemeral-protected.api') ||
      process.env.API_BASE_URL?.includes('ephemeral-protected.api')
    ) {
      return `https://ephemeral-protected.api.${env}.cdp-int.defra.cloud/ls-cleanse-api/`
    }

    return `https://ls-cleanse-api.${env}.cdp-int.defra.cloud/`
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
export const resolveCleanseBaseUrl = (): string => resolveBaseUrl('cleanse')
