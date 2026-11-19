import assert from 'node:assert/strict'
import test from 'node:test'
import { esc, listScript, parseRows, readScript, runAppleScript, searchScript, sendScript } from '../lib/mail.js'

test('esc escapes quotes and backslashes', () => {
  assert.equal(esc('a"b\\c'), 'a\\"b\\\\c')
  assert.equal(esc('line1\nline2'), 'line1 line2')
})

test('listScript builds inbox query with limit', () => {
  const script = listScript({ limit: 5, unreadOnly: true })
  assert.match(script, /messages of inbox whose read status is false/)
  assert.match(script, /greater than or equal to 5/)
})

test('listScript supports named mailbox', () => {
  const script = listScript({ mailbox: 'Archive', limit: 3 })
  assert.match(script, /mailbox "Archive"/)
})

test('readScript escapes id', () => {
  assert.match(readScript('abc"def'), /message id is "abc\\"def"/)
})

test('searchScript includes query', () => {
  assert.match(searchScript('invoice', 10), /s contains "invoice"/)
})

test('sendScript includes recipients and subject', () => {
  const script = sendScript({ to: 'a@b.com', subject: 'Hi', body: 'Body' })
  assert.match(script, /address:"a@b.com"/)
  assert.match(script, /subject:"Hi"/)
  assert.match(script, /send msg/)
})

test('parseRows parses delimiter lines', () => {
  const rows = parseRows('1\x1fa@b.com\x1fHello\x1f2026-11-18\n2\x1fc@d.com\x1fWorld\x1f2026-11-17\n')
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { id: '1', sender: 'a@b.com', subject: 'Hello', received: '2026-11-18' })
})

test('parseRows skips malformed lines', () => {
  assert.deepEqual(parseRows('garbage\n\n'), [])
})

test('runAppleScript uses injected runner', async () => {
  const runner = (cmd, args, opts, cb) => cb(null, 'ok', '')
  assert.equal(await runAppleScript('script', { runner }), 'ok')
})

test('runAppleScript rejects on error', async () => {
  const runner = (cmd, args, opts, cb) => cb(new Error('boom'))
  await assert.rejects(() => runAppleScript('script', { runner }), /osascript failed/)
})
