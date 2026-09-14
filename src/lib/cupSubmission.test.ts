import { describe, expect, it, vi } from 'vitest'
import { allowedOrigin } from '../../supabase/functions/_shared/cors.ts'
import { hexToBytes, NIMIQ_MESSAGE_PREFIX, normalizeAddress, signedMessageData, toUserFriendlyAddress } from '../../supabase/functions/_shared/nimiqSignature.ts'
import { buildScoreMessage, CUP_GAME_IDS, utcDay } from '../../supabase/functions/_shared/scoreMessage.ts'
import { handleSubmission } from '../../supabase/functions/_shared/submitScore.ts'
import type { ScoreRow, SubmitDeps } from '../../supabase/functions/_shared/submitScore.ts'

const DEVICE = 'ab'.repeat(32)
const WALLET = 'NQ69 UX8B 3P7F 1L2K 9QX4 TCGF 3G8S B17D'
const NOW = new Date('2026-09-14T15:00:00Z')

type Body = Record<string, unknown>

/** A well-formed entry whose message matches its fields, with optional overrides. */
function entry(overrides: Body = {}): Body {
  const fields = { gameId: 'dodge', day: '2026-09-14', score: 321, wallet: WALLET, deviceId: DEVICE, name: 'minos', signature: '11'.repeat(64), publicKey: '22'.repeat(32), ...overrides }
  const message = buildScoreMessage({ gameId: String(fields.gameId), day: String(fields.day), score: Number(fields.score), deviceId: String(fields.deviceId) })
  return { message, ...fields }
}

function deps(verified = true, signer = WALLET) {
  const verifyMessage = vi.fn((_message: string, _signature: Uint8Array, _publicKey: Uint8Array) => verified)
  const addressOf = vi.fn((_publicKey: Uint8Array) => signer)
  const recordScore = vi.fn(async (row: ScoreRow) => Math.max(row.score, 250))
  const rankOf = vi.fn(async (_gameId: string, _day: string, _deviceId: string) => 4)
  const all: SubmitDeps = { verifier: { verifyMessage, addressOf }, now: () => NOW, recordScore, rankOf }
  return { all, verifyMessage, addressOf, recordScore, rankOf }
}

describe('score message', () => {
  it('builds the exact text the wallet signs', () => {
    expect(buildScoreMessage({ gameId: 'dodge', day: '2026-09-14', score: 321, deviceId: DEVICE })).toBe(`nimcade|dodge|2026-09-14|321|${DEVICE}`)
    expect(CUP_GAME_IDS).toEqual(['nimnom', 'build-up', 'void-run', 'dodge', 'tap-speed'])
    expect(utcDay(new Date('2026-09-14T23:59:59Z'))).toBe('2026-09-14')
    expect(utcDay(new Date('2026-09-15T00:00:00Z'))).toBe('2026-09-15')
  })

  it('prefixes it the Nimiq way: 0x16 prefix, byte length in decimal, then the message', () => {
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
    expect(NIMIQ_MESSAGE_PREFIX).toBe('\x16Nimiq Signed Message:\n')
    expect(decode(signedMessageData('hello'))).toBe('\x16Nimiq Signed Message:\n5hello')
    expect(signedMessageData('hello')[0]).toBe(0x16)
    expect(decode(signedMessageData('héllo'))).toBe('\x16Nimiq Signed Message:\n6héllo')
  })

  it('encodes addresses exactly like @nimiq/core', () => {
    // Generated with @nimiq/core 2.21: Address.serialize() -> toUserFriendlyAddress().
    const bytes = hexToBytes('d5a1522093e8dc28945301ff0d1bd3f4916d87d8')!
    expect(toUserFriendlyAddress(bytes)).toBe('NQ41 SNGM 484K V3E2 H52K 07YG S6XK XJ8N T1XQ')
    expect(normalizeAddress('nq41 sngm 484k v3e2 h52k 07yg s6xk xj8n t1xq')).toBe('NQ41SNGM484KV3E2H52K07YGS6XKXJ8NT1XQ')
  })

  it('parses hex strictly', () => {
    expect(Array.from(hexToBytes('00ff10') ?? [])).toEqual([0, 255, 16])
    expect(Array.from(hexToBytes('0xAB') ?? [])).toEqual([171])
    expect(hexToBytes('abc')).toBeNull()
    expect(hexToBytes('zz')).toBeNull()
  })
})

describe('submit-score with a mocked verifier', () => {
  it('accepts a valid entry and returns the rank and best', async () => {
    const d = deps()
    const result = await handleSubmission(entry({ wallet: WALLET.replace(/ /g, '').toLowerCase(), signature: 'AA'.repeat(64) }), d.all)
    expect(result).toEqual({ status: 200, body: { ok: true, rank: 4, best: 321 } })
    expect(d.verifyMessage).toHaveBeenCalledWith(`nimcade|dodge|2026-09-14|321|${DEVICE}`, expect.any(Uint8Array), expect.any(Uint8Array))
    expect(d.recordScore).toHaveBeenCalledWith({ gameId: 'dodge', day: '2026-09-14', score: 321, wallet: WALLET, deviceId: DEVICE, name: 'minos', signature: 'aa'.repeat(64), publicKey: '22'.repeat(32) })
    expect(d.rankOf).toHaveBeenCalledWith('dodge', '2026-09-14', DEVICE)
  })

  it('rejects a message that does not match the entry, before verifying', async () => {
    const d = deps()
    const result = await handleSubmission({ ...entry(), score: 9999 }, d.all)
    expect(result).toEqual({ status: 400, body: { ok: false, error: 'Message does not match the entry.' } })
    expect(d.verifyMessage).not.toHaveBeenCalled()
  })

  it('rejects a bad signature and a signature from another wallet', async () => {
    expect((await handleSubmission(entry(), deps(false).all)).status).toBe(401)
    expect((await handleSubmission(entry({ signature: 'zz' }), deps().all)).status).toBe(401)
    const other = deps(true, 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000')
    expect(await handleSubmission(entry(), other.all)).toEqual({ status: 403, body: { ok: false, error: 'The signature is not from this wallet.' } })
    expect(other.recordScore).not.toHaveBeenCalled()
  })

  it('validates the game, score, device id and day', async () => {
    const status = async (overrides: Body) => (await handleSubmission(entry(overrides), deps().all)).status
    expect(await status({ gameId: 'dot-rush' })).toBe(400)
    expect(await status({ score: -1 })).toBe(400)
    expect(await status({ score: 1.5 })).toBe(400)
    expect(await status({ score: 10_000_000 })).toBe(400)
    expect(await status({ score: 9_999_999 })).toBe(200)
    expect(await status({ deviceId: 'a|b' })).toBe(400)
    expect(await status({ day: '2026-09-13' })).toBe(200)
    expect(await status({ day: '2026-09-12' })).toBe(400)
    expect(await status({ day: '2026-09-15' })).toBe(400)
    expect((await handleSubmission('nope', deps().all)).status).toBe(400)
  })

  it('stores a name only when it passes the name rules', async () => {
    const d = deps()
    await handleSubmission(entry({ name: 'ab' }), d.all)
    expect(d.recordScore.mock.calls[0][0].name).toBeNull()
  })
})

describe('CORS', () => {
  it('allows localhost, private-network dev servers and the configured origins only', () => {
    const configured = 'https://nimcade.vercel.app, https://nimcade.app/'
    expect(allowedOrigin('http://localhost:5173', configured)).toBe('http://localhost:5173')
    expect(allowedOrigin('http://192.168.1.42:5173', configured)).toBe('http://192.168.1.42:5173')
    expect(allowedOrigin('https://nimcade.vercel.app', configured)).toBe('https://nimcade.vercel.app')
    expect(allowedOrigin('https://nimcade.app', configured)).toBe('https://nimcade.app')
    expect(allowedOrigin('https://evil.example', configured)).toBeNull()
    expect(allowedOrigin('http://172.32.0.1:5173', configured)).toBeNull()
    expect(allowedOrigin(null, configured)).toBeNull()
  })
})
