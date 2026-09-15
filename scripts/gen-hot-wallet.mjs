// One-off: creates a Daily Cup hot wallet for pay-cup.
//
//   node scripts/gen-hot-wallet.mjs [--out <path>]
//
// Generates a new Nimiq key pair, writes its private key (64 hex characters) to <path>
// (default ~/.nimcade-hot.key) with mode 600, and prints only the address. Refuses to run if
// the file already exists, so an existing wallet is never replaced, and refuses paths inside
// this repository, so the key can't be committed by accident. The key is never printed.
import { closeSync, constants, fchmodSync, openSync, unlinkSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as core from '@nimiq/core'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function keyPathFromArgs(args) {
  let out = join(homedir(), '.nimcade-hot.key')
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg !== '--out' && !arg.startsWith('--out='))
      fail(`Unknown argument: ${arg}\nUsage: node scripts/gen-hot-wallet.mjs [--out <path>]`)
    const value = arg === '--out' ? args[++i] : arg.slice('--out='.length)
    if (!value)
      fail('--out needs a path.')
    out = resolve(value.replace(/^~(?=$|\/)/, homedir()))
  }
  const fromRepo = relative(REPO_ROOT, out)
  const outside = fromRepo === '..' || fromRepo.startsWith(`..${sep}`) || isAbsolute(fromRepo)
  if (!outside)
    fail(`${out} is inside the repository; write the key outside it.`)
  return out
}

const keyPath = keyPathFromArgs(process.argv.slice(2))
const Nimiq = core.default ?? core
const keyPair = Nimiq.KeyPair.generate()
const privateKeyHex = keyPair.privateKey.toHex()
if (!/^[0-9a-f]{64}$/.test(privateKeyHex))
  fail('Unexpected private key format; nothing was written.')

let fd
try {
  // O_EXCL: fail instead of overwriting, atomically.
  fd = openSync(keyPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
}
catch (error) {
  fail(error.code === 'EEXIST'
    ? `${keyPath} already exists; refusing to overwrite it.`
    : `Could not create ${keyPath} (${error.code ?? 'error'}).`)
}

try {
  fchmodSync(fd, 0o600) // the umask can't loosen it
  writeSync(fd, `${privateKeyHex}\n`)
  closeSync(fd)
}
catch (error) {
  try {
    closeSync(fd)
  }
  catch {}
  unlinkSync(keyPath)
  fail(`Could not write ${keyPath} (${error.code ?? 'error'}); removed the partial file.`)
}

console.log(keyPair.toAddress().toUserFriendlyAddress())
