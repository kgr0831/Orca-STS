import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const config = require('../electron-builder-sts.config.cjs')

it('packages only to the personal fork with an independent Windows identity', () => {
  expect(config.appId).toBe('com.kgr0831.orca.sts')
  expect(config.productName).toBe('Orca-STS')
  expect(config.extraMetadata.name).toBe('orca-sts')
  expect(config.extraMetadata.version).toMatch(/^\d+\.\d+\.\d+-sts\.\d+$/)
  expect(config.win.executableName).toBe('Orca-STS')
  expect(config.protocols).toEqual([])
  expect(config.nsis.include).toBeUndefined()
  expect(config.nsis.runAfterFinish).toBe(false)
  expect(config.win.signtoolOptions.publisherName).toBeUndefined()
  expect(config.publish).toEqual({
    provider: 'github',
    owner: 'kgr0831',
    repo: 'Orca-STS',
    releaseType: 'draft'
  })
})
