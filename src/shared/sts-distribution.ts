export const STS_APP_NAME = 'Orca-STS'
export const STS_APP_ID = 'com.kgr0831.orca.sts'
export const STS_RELEASES_URL = 'https://github.com/kgr0831/Orca-STS/releases'

export function isStsDistributionVersion(version: string | undefined): boolean {
  return typeof version === 'string' && /^\d+\.\d+\.\d+-sts\.\d+$/.test(version)
}
