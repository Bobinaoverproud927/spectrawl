#!/usr/bin/env node

/**
 * Camoufox binary installer for Spectrawl.
 * Downloads prebuilt anti-detect Firefox from Camoufox releases.
 * 
 * Usage: npx spectrawl install-stealth
 * 
 * Same model as `npx playwright install chromium` — downloads the
 * right binary for your OS/arch and stores it locally.
 */

const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

const CAMOUFOX_VERSION = 'v135.0.1-beta.24'
const INSTALL_DIR = path.join(os.homedir(), '.spectrawl', 'browsers', 'camoufox')

function getPlatformAsset() {
  const platform = os.platform()
  const arch = os.arch()

  if (platform === 'linux') {
    if (arch === 'x64') return `camoufox-135.0.1-beta.24-lin.x86_64.zip`
    if (arch === 'arm64') return `camoufox-135.0.1-beta.24-lin.arm64.zip`
    if (arch === 'ia32') return `camoufox-135.0.1-beta.24-lin.i686.zip`
  }
  if (platform === 'darwin') {
    return `camoufox-135.0.1-beta.24-mac.universal.zip`
  }
  // Windows not yet supported in Camoufox latest
  throw new Error(`Unsupported platform: ${platform}-${arch}. Camoufox supports Linux (x64/arm64) and macOS.`)
}

function downloadUrl(assetName) {
  return `https://github.com/daijro/camoufox/releases/download/${CAMOUFOX_VERSION}/${assetName}`
}

function followRedirects(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { headers: { 'User-Agent': 'spectrawl' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        followRedirects(res.headers.location).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`))
        return
      }
      resolve(res)
    }).on('error', reject)
  })
}

async function download(url, dest) {
  const dir = path.dirname(dest)
  fs.mkdirSync(dir, { recursive: true })

  console.log(`Downloading Camoufox ${CAMOUFOX_VERSION}...`)
  console.log(`  From: ${url}`)
  console.log(`  To: ${dest}`)

  const res = await followRedirects(url)
  const total = parseInt(res.headers['content-length'], 10) || 0
  let downloaded = 0
  let lastPercent = 0

  const file = fs.createWriteStream(dest)

  return new Promise((resolve, reject) => {
    res.on('data', (chunk) => {
      file.write(chunk)
      downloaded += chunk.length
      if (total) {
        const percent = Math.floor((downloaded / total) * 100)
        if (percent >= lastPercent + 10) {
          process.stdout.write(`  ${percent}%`)
          if (percent < 100) process.stdout.write(' ')
          lastPercent = percent
        }
      }
    })
    res.on('end', () => {
      file.end()
      console.log('\n  Download complete.')
      resolve()
    })
    res.on('error', reject)
    file.on('error', reject)
  })
}

async function install() {
  const asset = getPlatformAsset()
  const url = downloadUrl(asset)
  const zipPath = path.join(INSTALL_DIR, asset)
  const extractDir = INSTALL_DIR

  // Check if already installed
  const markerFile = path.join(INSTALL_DIR, '.version')
  if (fs.existsSync(markerFile)) {
    const installed = fs.readFileSync(markerFile, 'utf8').trim()
    if (installed === CAMOUFOX_VERSION) {
      console.log(`Camoufox ${CAMOUFOX_VERSION} already installed at ${INSTALL_DIR}`)
      return { path: INSTALL_DIR, version: CAMOUFOX_VERSION }
    }
  }

  // Download
  await download(url, zipPath)

  // Extract — try multiple methods (large zip64 files break some tools)
  console.log('  Extracting...')
  fs.mkdirSync(extractDir, { recursive: true })

  const extractMethods = [
    // 1. unzip (most common on Linux/Mac)
    () => execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' }),
    // 2. 7z (handles zip64 reliably)
    () => execSync(`7z x -o"${extractDir}" -y "${zipPath}"`, { stdio: 'pipe' }),
    // 3. bsdtar (available on many systems, handles zip64)
    () => execSync(`bsdtar -xf "${zipPath}" -C "${extractDir}"`, { stdio: 'pipe' }),
    // 4. Node.js built-in (no external deps, handles zip64)
    () => {
      const { execSync: es } = require('child_process')
      es(`node -e "
        const fs = require('fs');
        const zlib = require('zlib');
        const { execFileSync } = require('child_process');
        // Use jar if available (JDK)
        execFileSync('jar', ['xf', '${zipPath}'], { cwd: '${extractDir}', stdio: 'pipe' });
      "`, { stdio: 'pipe' })
    },
    // 5. Python with explicit zip64 support
    () => execSync(`python3 -c "
import zipfile, sys
try:
    z = zipfile.ZipFile('${zipPath}', allowZip64=True)
    z.extractall('${extractDir}')
    z.close()
except Exception as e:
    print(f'Python extract failed: {e}', file=sys.stderr)
    sys.exit(1)
"`, { stdio: 'pipe' }),
  ]

  let extracted = false
  for (const method of extractMethods) {
    try {
      method()
      extracted = true
      break
    } catch (e) {
      continue
    }
  }

  if (!extracted) {
    fs.unlinkSync(zipPath)
    throw new Error(
      'Could not extract Camoufox archive. Install one of: unzip, 7z, or bsdtar.\n' +
      '  Ubuntu/Debian: sudo apt-get install unzip\n' +
      '  macOS: brew install p7zip\n' +
      '  Alpine: apk add unzip'
    )
  }

  // Clean up zip
  fs.unlinkSync(zipPath)

  // Find the binary
  const binaryName = os.platform() === 'darwin' ? 'camoufox' : 'camoufox-bin'
  const possiblePaths = [
    path.join(extractDir, 'camoufox', binaryName),
    path.join(extractDir, binaryName),
  ]

  let binaryPath = null
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      binaryPath = p
      fs.chmodSync(p, 0o755)
      break
    }
  }

  // Write version marker
  fs.writeFileSync(markerFile, CAMOUFOX_VERSION)

  console.log(`\n✅ Camoufox ${CAMOUFOX_VERSION} installed.`)
  console.log(`   Binary: ${binaryPath || 'in ' + extractDir}`)
  console.log(`   Spectrawl will use it automatically for stealth browsing.`)

  return { path: extractDir, binary: binaryPath, version: CAMOUFOX_VERSION }
}

/**
 * Get the Camoufox binary path if installed.
 */
function getCamoufoxPath() {
  const binaryName = os.platform() === 'darwin' ? 'camoufox' : 'camoufox-bin'
  const possiblePaths = [
    path.join(INSTALL_DIR, 'camoufox', binaryName),
    path.join(INSTALL_DIR, binaryName),
  ]

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p
  }
  return null
}

/**
 * Check if Camoufox is installed.
 */
function isInstalled() {
  return getCamoufoxPath() !== null
}

// Run as CLI
if (require.main === module) {
  install().catch(err => {
    console.error('❌ Installation failed:', err.message)
    process.exit(1)
  })
}

module.exports = { install, getCamoufoxPath, isInstalled, INSTALL_DIR }
