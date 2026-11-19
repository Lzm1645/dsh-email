/**
 * 独立验证：用假的 ctx 加载插件，确认 4 个工具注册成功，并用真实 Mail.app 跑一次 email_list。
 * 不需要重启 DSH。
 */
import { apply } from '../index.js'

const registered = []
const ctx = {
  get(name) {
    if (name === 'tools') return { register: (tool) => registered.push(tool) }
    return undefined
  },
  logger: { info: () => {}, warn: (msg) => console.error(msg) },
}

apply(ctx)
console.log(`registered: ${registered.map((tool) => tool.name).join(', ')}`)

const list = registered.find((tool) => tool.name === 'email_list')
if (!list) {
  console.error('email_list not registered')
  process.exit(1)
}
const result = await list.execute({ limit: 3 })
console.log(`ok=${result.ok}`)
console.log(result.text.slice(0, 600))
