/**
 * Mail.app 的 AppleScript 封装：脚本构建、解析、执行。
 * 纯函数单独导出，便于测试；执行层只依赖 osascript。
 */
import { execFile } from 'node:child_process'

const DELIM = '\u001f'

/** 转义 AppleScript 字符串字面量里的反斜杠与双引号。 */
export function esc(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')
}

export function listScript({ mailbox = 'inbox', limit = 20, unreadOnly = false } = {}) {
  const box = esc(mailbox)
  const filter = unreadOnly ? 'whose read status is false' : ''
  const n = Math.max(1, Math.min(Number(limit) || 20, 100))
  return `tell application "Mail"
set d to (ASCII character 31)
set output to ""
set msgs to (messages of ${box === 'inbox' ? 'inbox' : `mailbox "${box}"`} ${filter})
set n to 0
repeat with m in msgs
  if n is greater than or equal to ${n} then exit repeat
  set output to output & (message id of m) & d & (sender of m) & d & (subject of m) & d & ((date received of m) as string) & linefeed
  set n to n + 1
end repeat
return output
end tell`
}

export function readScript(id) {
  return `tell application "Mail"
set m to first message of inbox whose message id is "${esc(id)}"
return (content of m)
end tell`
}

export function searchScript(query, limit = 20) {
  const q = esc(query)
  const n = Math.max(1, Math.min(Number(limit) || 20, 50))
  return `tell application "Mail"
set d to (ASCII character 31)
set output to ""
set n to 0
repeat with m in (messages of inbox)
  if n is greater than or equal to ${n} then exit repeat
  set s to (subject of m)
  set f to (sender of m)
  ignoring case
    if (s contains "${q}") or (f contains "${q}") then
      set output to output & (message id of m) & d & f & d & s & d & ((date received of m) as string) & linefeed
      set n to n + 1
    end if
  end ignoring
end repeat
return output
end tell`
}

export function sendScript({ to, subject, body, cc = '', from = '' }) {
  const fromLine = from ? `set sender of msg to "${esc(from)}"\n` : ''
  const ccLine = cc ? `make new cc recipient at end of cc recipients of msg with properties {address:"${esc(cc)}"}\n` : ''
  return `tell application "Mail"
set msg to make new outgoing message with properties {subject:"${esc(subject)}", content:"${esc(body)}", visible:false}
tell msg
  make new to recipient at end of to recipients with properties {address:"${esc(to)}"}
  ${ccLine}${fromLine}tell content
    delay 0.2
  end tell
end tell
send msg
return "sent"
end tell`
}

/** 把 list/search 的 stdout 解析为结构化行。 */
export function parseRows(stdout) {
  const rows = []
  for (const line of String(stdout ?? '').split('\n')) {
    const parts = line.split(DELIM).map((part) => part.trim())
    if (parts.length < 3 || !parts[2]) continue
    rows.push({ id: parts[0] || parts[2], sender: parts[1] || '', subject: parts[2] || '', received: parts[3] || '' })
  }
  return rows
}

/** 执行 AppleScript（可注入 runner 以便测试）。 */
export function runAppleScript(script, { timeout = 60000, runner = execFile } = {}) {
  return new Promise((resolve, reject) => {
    runner('osascript', ['-e', script], { timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`osascript failed: ${String(stderr || error.message || error).slice(0, 400)}`))
        return
      }
      resolve(String(stdout ?? '').trim())
    })
  })
}
