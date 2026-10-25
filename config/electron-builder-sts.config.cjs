const base = require('./electron-builder.config.cjs')
const manifest = require('../package.json')

const version = process.env.ORCA_STS_VERSION ?? `${manifest.version}-sts.2`
if (!/^\d+\.\d+\.\d+-sts\.\d+$/.test(version)) {
  throw new Error('Orca-STS versions must use <upstream version>-sts.<number>')
}

module.exports = {
  ...base,
  appId: 'com.kgr0831.orca.sts',
  productName: 'Orca-STS',
  protocols: [],
  forceCodeSigning: false,
  extraMetadata: {
    ...base.extraMetadata,
    name: 'orca-sts',
    productName: 'Orca-STS',
    homepage: 'https://github.com/kgr0831/Orca-STS',
    version
  },
  win: {
    ...base.win,
    executableName: 'Orca-STS',
    target: [{ target: 'nsis', arch: ['x64'] }],
    signtoolOptions: {}
  },
  nsis: {
    ...base.nsis,
    include: undefined,
    artifactName: 'Orca-STS-${version}-windows-x64.${ext}',
    runAfterFinish: false
  },
  publish: {
    provider: 'github',
    owner: 'kgr0831',
    repo: 'Orca-STS',
    releaseType: 'draft'
  }
}
