/**
 * Resolves and normalizes base URLs for Data Bridge and Keeper Data API services
 */
export function resolveBaseUrl(service: 'bridge' | 'api'): string {
  const env = (process.env.ENVIRONMENT || 'dev').toLowerCase()

  if (service === 'bridge') {
    const url =
      process.env.BRIDGE_BASE_URL ||
      process.env.BASE_URL ||
      `https://ls-keeper-data-bridge-backend.${env}.cdp-int.defra.cloud/`
    return url.replace(/\/$/, '') + '/'
  }

  const url =
    process.env.API_BASE_URL ||
    `https://ls-keeper-data-api.${env}.cdp-int.defra.cloud/`
  return url.replace(/\/$/, '') + '/'
}

export const resolveBridgeBaseUrl = (): string => resolveBaseUrl('bridge')
export const resolveApiBaseUrl = (): string => resolveBaseUrl('api')
