// One-off: creates the Daily Cup hot wallet for pay-cup.
//
//   node scripts/gen-hot-wallet.mjs
//
// Generates a new Nimiq key pair, writes its private key (64 hex characters) to
// ~/.nimcade-hot.key with mode 600, and prints only the address. Refuses to run if the file
// already exists, so an existing wallet is never replaced. The key is never printed.
import { closeSync, constants, fchmodSync, openSync, unlinkSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as core from '@nimiq/core'

const Nimiq = core.default ?? core
const KEY_PATH = join(homedir(), '.nimcade-hot.key')

const keyPair = Nimiq.KeyPair.generate()
const privateKeyHex = keyPair.privateKey.toHex()
if (!/^[0-9a-f]{64}$/.test(privateKeyHex)) {
  console.error('Unexpected private key format; nothing was written.')
  process.exit(1)
}

let fd
try {
  // O_EXCL: fail instead of overwriting, atomically.
  fd = openSync(KEY_PATH, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
}
catch (error) {
  console.error(error.code === 'EEXIST'
    ? `${KEY_PATH} already exists; refusing to overwrite it.`
    : `Could not create ${KEY_PATH} (${error.code ?? 'error'}).`)
  process.exit(1)
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
  unlinkSync(KEY_PATH)
  console.error(`Could not write ${KEY_PATH} (${error.code ?? 'error'}); removed the partial file.`)
  process.exit(1)
}

console.log(keyPair.toAddress().toUserFriendlyAddress())
