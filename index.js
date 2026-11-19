/**
 * dsh-email —— 给 DSH agent 读写本机 Mail.app 的邮件。
 *
 * 工具：
 *   email_list    列出收件箱（或指定 mailbox）的邮件
 *   email_read    按 message id 读正文
 *   email_search  按主题/发件人搜索
 *   email_send    发送邮件（默认关闭，需 DSH_EMAIL_ALLOW_SEND=1 且 confirm=true）
 *
 * 设计：只走 Mail.app 的 AppleScript（macOS 自带、无需 IMAP 密码；用户已在 Mail.app 登录的账户即可）。
 */
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { listScript, parseRows, readScript, runAppleScript, searchScript, sendScript } from './lib/mail.js'

async function loadDefineTool() {
  try {
    const mod = await import('@deepseek-ai/dsh-tools')
    if (typeof mod?.defineTool === 'function') return mod.defineTool
  } catch {}
  const anchors = []
  for (const candidate of [process.argv[1], process.argv[0], process.execPath]) {
    if (typeof candidate !== 'string' || candidate === '') continue
    try { anchors.push(realpathSync(candidate)) } catch {}
  }
  anchors.push('/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js')
  for (const anchor of anchors) {
    try {
      const mod = await import(pathToFileURL(createRequire(anchor).resolve('@deepseek-ai/dsh-tools')).href)
      if (typeof mod?.defineTool === 'function') return mod.defineTool
    } catch {}
  }
  return null
}

const defineTool = await loadDefineTool()

export const name = 'dsh-email'
export const inject = []

const textOutput = {
  schema: {
    type: 'object', additionalProperties: false,
    properties: { ok: { type: 'boolean' }, text: { type: 'string' } },
  },
  render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
}

function rowsText(rows) {
  if (rows.length === 0) return '没有匹配的邮件。'
  return rows.map((row, index) => `${index + 1}. [${row.received}] ${row.sender} — ${row.subject}（id: ${row.id}）`).join('\n')
}

export function apply(ctx) {
  const tools = (() => {
    try { return ctx.get?.('tools') ?? ctx.tools } catch { return undefined }
  })()
  if (defineTool === null || tools?.register === undefined) {
    try { ctx.logger?.warn?.('[dsh-email] 未找到 tools 服务或 defineTool，工具未注册。') } catch {}
    return
  }

  tools.register(defineTool({
    name: 'email_list',
    description: '列出本机 Mail.app 收件箱的邮件（id/发件人/主题/时间）。用于查看未读或最近邮件。',
    parameters: {
      limit: { type: 'number', description: '最多返回多少封，默认 20，上限 100。' },
      unreadOnly: { type: 'boolean', description: '只看未读。' },
      mailbox: { type: 'string', description: '邮箱名，默认 inbox。' },
    },
    output: textOutput,
    execute: async (args) => {
      try {
        const rows = parseRows(await runAppleScript(listScript({ limit: args?.limit, unreadOnly: args?.unreadOnly === true, mailbox: args?.mailbox || 'inbox' })))
        return { ok: true, text: rowsText(rows) }
      } catch (error) {
        return { ok: false, text: `读取邮件失败：${error?.message ?? String(error)}` }
      }
    },
  }))

  tools.register(defineTool({
    name: 'email_read',
    description: '按 message id 读取一封邮件的正文（id 来自 email_list/email_search）。',
    parameters: {
      id: { type: 'string', required: true, description: '邮件 message id。' },
    },
    output: textOutput,
    execute: async (args) => {
      try {
        const content = await runAppleScript(readScript(args?.id ?? ''))
        return { ok: true, text: content.slice(0, 20000) }
      } catch (error) {
        return { ok: false, text: `读取失败：${error?.message ?? String(error)}` }
      }
    },
  }))

  tools.register(defineTool({
    name: 'email_search',
    description: '按主题或发件人子串搜索收件箱。',
    parameters: {
      query: { type: 'string', required: true, description: '搜索词（主题/发件人包含）。' },
      limit: { type: 'number', description: '最多返回多少封，默认 20。' },
    },
    output: textOutput,
    execute: async (args) => {
      const query = typeof args?.query === 'string' ? args.query.trim() : ''
      if (!query) return { ok: false, text: 'query 不能为空。' }
      try {
        const rows = parseRows(await runAppleScript(searchScript(query, args?.limit)))
        return { ok: true, text: rowsText(rows) }
      } catch (error) {
        return { ok: false, text: `搜索失败：${error?.message ?? String(error)}` }
      }
    },
  }))

  tools.register(defineTool({
    name: 'email_send',
    description: '通过 Mail.app 发送邮件。默认禁用；需环境变量 DSH_EMAIL_ALLOW_SEND=1，且调用时 confirm=true。',
    parameters: {
      to: { type: 'string', required: true, description: '收件人地址。' },
      subject: { type: 'string', required: true, description: '主题。' },
      body: { type: 'string', required: true, description: '正文（纯文本）。' },
      cc: { type: 'string', description: '抄送地址，可选。' },
      confirm: { type: 'boolean', required: true, description: '必须显式 true 才会真的发送。' },
    },
    output: textOutput,
    execute: async (args) => {
      if (process.env.DSH_EMAIL_ALLOW_SEND !== '1') return { ok: false, text: '发送被禁用：设置 DSH_EMAIL_ALLOW_SEND=1 后重启 DSH 才会启用。' }
      if (args?.confirm !== true) return { ok: false, text: '需要 confirm=true 才会发送。' }
      const to = String(args?.to ?? '').trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, text: '收件人地址无效。' }
      try {
        await runAppleScript(sendScript({ to, subject: args?.subject ?? '', body: args?.body ?? '', cc: args?.cc ?? '' }))
        return { ok: true, text: `已发送到 ${to}。` }
      } catch (error) {
        return { ok: false, text: `发送失败：${error?.message ?? String(error)}` }
      }
    },
  }))

  try { ctx.logger?.info?.('[dsh-email] 已注册工具：email_list、email_read、email_search、email_send') } catch {}
}
