import type { NimiqVerifier } from './nimiqSignature.ts'
import { hexToBytes, normalizeAddress } from './nimiqSignature.ts'
import { validateName } from './playerName.ts'
import { buildScoreMessage, isCupGameId, MAX_SCORE, utcDay } from './scoreMessage.ts'

/** What submit-score stores for an accepted entry. */
export interface ScoreRow {
  gameId: string
  day: string
  score: number
  /** The address derived from the public key, user-friendly form. */
  wallet: string
  deviceId: string
  name: string | null
  signature: string
  publicKey: string
}

export interface SubmitDeps {
  verifier: Pick<NimiqVerifier, 'verifyMessage' | 'addressOf'>
  now: () => Date
  /** Stores the entry, keeping the device's best score for the game and day; resolves with that best. */
  recordScore: (row: ScoreRow) => Promise<number>
  /** The device's current rank on the day's board, or null when it has no score. */
  rankOf: (gameId: string, day: string, deviceId: string) => Promise<number | null>
}

export type SubmitResult =
  | { status: 200; body: { ok: true; rank: number | null; best: number } }
  | { status: 400 | 401 | 403; body: { ok: false; error: string } }

/** Nimiq Pay's device identifiers are 64 hex characters; anything with a "|" would break the message. */
const DEVICE_ID = /^[0-9a-f]{16,128}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

const fail = (status: 400 | 401 | 403, error: string): SubmitResult => ({ status, body: { ok: false, error } })

/**
 * Validates and records one signed Daily Cup entry. Pure apart from the injected dependencies,
 * so the checks are unit-tested with a mocked verifier and store.
 */
export async function handleSubmission(input: unknown, deps: SubmitDeps): Promise<SubmitResult> {
  if (!input || typeof input !== 'object')
    return fail(400, 'Expected a JSON body.')
  const body = input as Record<string, unknown>
  const { gameId, day, score, wallet, deviceId, message, signature, publicKey } = body

  if (!isCupGameId(gameId))
    return fail(400, 'Unknown game.')
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score >= MAX_SCORE)
    return fail(400, 'Invalid score.')
  const now = deps.now()
  if (typeof day !== 'string' || !DAY.test(day) || (day !== utcDay(now) && day !== utcDay(new Date(now.getTime() - DAY_MS))))
    return fail(400, 'Day must be today or yesterday (UTC).')
  if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId))
    return fail(400, 'Invalid device id.')
  if (typeof wallet !== 'string' || typeof message !== 'string' || typeof signature !== 'string' || typeof publicKey !== 'string')
    return fail(400, 'Missing wallet, message or signature.')
  if (message !== buildScoreMessage({ gameId, day, score, deviceId }))
    return fail(400, 'Message does not match the entry.')

  const signatureBytes = hexToBytes(signature)
  const publicKeyBytes = hexToBytes(publicKey)
  if (!signatureBytes || !publicKeyBytes || !deps.verifier.verifyMessage(message, signatureBytes, publicKeyBytes))
    return fail(401, 'Invalid signature.')
  const signer = deps.verifier.addressOf(publicKeyBytes)
  if (normalizeAddress(signer) !== normalizeAddress(wallet))
    return fail(403, 'The signature is not from this wallet.')

  const checkedName = typeof body.name === 'string' ? validateName(body.name) : null
  const best = await deps.recordScore({
    gameId,
    day,
    score,
    wallet: signer,
    deviceId: deviceId.toLowerCase(),
    name: checkedName?.ok ? checkedName.name : null,
    signature: signature.toLowerCase().replace(/^0x/, ''),
    publicKey: publicKey.toLowerCase().replace(/^0x/, ''),
  })
  const rank = await deps.rankOf(gameId, day, deviceId.toLowerCase())
  return { status: 200, body: { ok: true, rank, best } }
}
