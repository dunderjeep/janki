/**
 * Mail's server side, for a host app: set the host, load the page, sync on a
 * timer, and search mail on behalf of other apps. The HTTP API is in 'mail/api'.
 */
export { setMailHost, mailHost, type MailHost, type MailDb, type Send, type SendTarget } from './host'
export { mailPageData } from './api'
export { syncAll, searchMail, listAccounts, listMessages, toProcess, listRules, addRule, PROVIDERS, type RuleView, type AccountView, type MessageSummary, type MessageView } from './lib/store'
