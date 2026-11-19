# dsh-email

给 DSH agent 读写本机 **Mail.app** 邮件的插件：列出、读取、搜索、发送（发送默认关闭）。

> 为什么走 Mail.app：macOS 自带、复用你已登录的邮箱账户，不需要 IMAP 密码，也不把凭据交给插件。

## 工具

| 工具 | 作用 | 关键参数 |
|---|---|---|
| `email_list` | 列出收件箱邮件（id/发件人/主题/时间） | `limit`、`unreadOnly`、`mailbox` |
| `email_read` | 按 message id 读正文 | `id` |
| `email_search` | 按主题/发件人子串搜索 | `query`、`limit` |
| `email_send` | 通过 Mail.app 发送 | `to`、`subject`、`body`、`cc`、`confirm` |

## 安装（以 desktop profile 为例）

1. 把本仓库放到本机，例如 `~/code/dsh-email`。
2. 在 `~/.dsh/profiles/desktop/package.json` 的依赖里加：
   ```json
   "dsh-email": "link:/Users/<you>/code/dsh-email"
   ```
3. 在 `dsh.profile.bundles` 末尾加 `"dsh-email"`。
4. 建软链（desktop profile 被 Electron 独占，不能直接 pnpm）：
   ```bash
   cd ~/.dsh/profiles/desktop
   ln -sfn ../../../../code/dsh-email node_modules/dsh-email
   ```
5. 完全退出 DSH（⌘Q）再打开——插件只在启动时加载。

## 配置

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `DSH_EMAIL_ALLOW_SEND` | 未设置 | 设为 `1` 才允许 `email_send`；否则发送工具直接拒绝 |

发送还需要调用时传 `confirm: true`（双保险）。

## 安全边界

- 只通过 AppleScript 操作 Mail.app；不读取 Keychain，不保存邮件内容；
- 发送默认关闭；`confirm: true` 是必填；
- 读正文会截断到 20k 字符，避免把超长邮件塞进上下文；
- 不处理附件（v0.1 范围外）。

## 验证

```bash
node --test tests/*.test.mjs     # 10 个单测
node scripts/verify.mjs          # 用假 ctx 加载插件 + 真实 Mail.app 列 3 封
```

`verify.mjs` 不依赖 DSH 重启；真实“宿主内加载”需要按安装步骤重启一次 DSH。

## 范围与限制

- 只支持 macOS + Mail.app；
- 只支持纯文本正文（HTML 邮件读取为文本）；
- message id 由 Mail.app 提供，换邮件客户端对应实现要重写。

## License

MIT
