/**
 * Mail's HTTP API. A host mounts it at /api/mail/[...path]:
 *
 *   export { GET, POST, PUT, PATCH, DELETE } from 'mail/api'
 */
import { createApi, AppError, type Route } from '@janki/app-kit/api'
import { mailHost } from './host'
import {
  accountFolders, addAccount, addRule, getMessage, listAccounts, listMessages, listRules, messageAction, processMessage, PROVIDERS,
  removeAccount, removeRule, syncNow, testLogin, toProcess, updateAccount, type Decision,
} from './lib/store'
import type { Action } from './lib/imap'

/** Everything the Mail page starts with. */
export async function mailPageData(uid: string) {
  const [accounts, messages, rules, waiting] = await Promise.all([listAccounts(uid), listMessages(uid, { todo: true }), listRules(uid), toProcess(uid)])
  return { accounts, messages, rules, waiting, providers: PROVIDERS, targets: mailHost().send?.targets ?? [] }
}

const ACTIONS: Action[] = ['seen', 'unseen', 'archive', 'trash']

/** A decision from a request, checked: anything unknown is refused, never taken as a delete. */
function decisionFrom(v: unknown): Decision {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  if (d.kind === 'archive' || d.kind === 'trash' || d.kind === 'keep') return { kind: d.kind }
  if (d.kind === 'send' && typeof d.target === 'string') {
    return {
      kind: 'send', target: d.target,
      title: typeof d.title === 'string' ? d.title : undefined,
      when: typeof d.when === 'string' && d.when ? d.when : undefined,
      archive: d.archive !== false,
    }
  }
  throw new AppError('No such decision')
}

const routes: Route[] = [
  ['GET', 'state', async ({ uid }) => mailPageData(uid)],
  ['GET', 'messages', async ({ uid, q }) => ({
    messages: await listMessages(uid, {
      q: q.get('q') ?? undefined, accountId: q.get('account') ?? undefined,
      unread: q.get('unread') === '1', todo: q.get('todo') === '1', before: q.get('before') ?? undefined,
    }),
    waiting: await toProcess(uid),
  })],
  ['GET', 'messages/:id', async ({ uid, p }) => getMessage(uid, p.id)],
  // body: { decision: Decision, always?: boolean }
  ['POST', 'messages/:id/process', async ({ uid, p, body }) => {
    const b = await body()
    return processMessage(uid, p.id, decisionFrom(b.decision), b.always === true)
  }],
  ['GET', 'rules', async ({ uid }) => ({ rules: await listRules(uid) })],
  ['POST', 'rules', async ({ uid, body }) => ({ rules: await addRule(uid, await body()) })],
  ['DELETE', 'rules/:id', async ({ uid, p }) => ({ rules: await removeRule(uid, p.id) })],
  ['POST', 'messages/:id/:action', async ({ uid, p }) => {
    if (!ACTIONS.includes(p.action as Action)) throw new AppError('No such action', 404)
    return messageAction(uid, p.id, p.action as Action)
  }],

  ['POST', 'accounts/test', async ({ body }) => ({ folders: await testLogin(await body()) })],
  ['POST', 'accounts', async ({ uid, body }) => addAccount(uid, await body())],
  ['PATCH', 'accounts/:id', async ({ uid, p, body }) => updateAccount(uid, p.id, await body())],
  ['DELETE', 'accounts/:id', async ({ uid, p }) => removeAccount(uid, p.id)],
  ['GET', 'accounts/:id/folders', async ({ uid, p }) => ({ folders: await accountFolders(uid, p.id) })],
  ['POST', 'accounts/:id/sync', async ({ uid, p }) => syncNow(uid, p.id)],
]

export const { GET, POST, PUT, PATCH, DELETE } = createApi('mail', mailHost, routes)
