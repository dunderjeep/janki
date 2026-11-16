import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/auth'
import { db } from '@/db'
import type { AccountType } from '@/db/schema/banki'
import { CODES, ensureChart } from '@/lib/banki/chart'
import { formatCents } from '@/lib/banki/money'
import { accountSummaries, natural, recentImports, type AccountSummary } from '@/lib/banki/reports'
import { ImportPanel } from '@/components/banki/ImportPanel'

export const metadata: Metadata = { title: 'Banki' }

const GROUPS: { type: AccountType; label: string }[] = [
  { type: 'asset', label: 'Assets' },
  { type: 'liability', label: 'Liabilities' },
  { type: 'equity', label: 'Equity' },
  { type: 'income', label: 'Income' },
  { type: 'expense', label: 'Expenses' },
]

export default async function BankiPage() {
  const session = await auth()
  const uid = session!.user.id

  await db.transaction((tx) => ensureChart(tx, uid))
  const [accounts, imports] = await Promise.all([accountSummaries(uid), recentImports(uid)])

  // Trial balance: each account's balance on its debit or credit side.
  const totalDebits = accounts.reduce((s, a) => s + Math.max(a.balance, 0), 0)
  const totalCredits = accounts.reduce((s, a) => s + Math.max(-a.balance, 0), 0)
  const hasEntries = accounts.some((a) => a.debits || a.credits)

  return (
    <div className="space-y-10">
      <ImportPanel
        statementAccounts={accounts
          .filter((a) => a.statementFormat)
          .map((a) => ({ code: a.code, name: a.name }))}
      />

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold">Trial balance</h2>
          {hasEntries && (
            <p className={`text-sm ${totalDebits === totalCredits ? 'text-green-700' : 'text-red-600'}`}>
              Debits {formatCents(totalDebits)} {totalDebits === totalCredits ? '=' : '≠'} credits{' '}
              {formatCents(totalCredits)} {totalDebits === totalCredits ? '✓' : '✗'}
            </p>
          )}
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium w-16">Code</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium text-right">Debit</th>
                <th className="px-3 py-2 font-medium text-right">Credit</th>
                <th className="px-3 py-2 font-medium">Check</th>
              </tr>
            </thead>
            {GROUPS.map((g) => (
              <tbody key={g.type} className="border-t border-gray-200">
                <tr>
                  <td colSpan={5} className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {g.label}
                  </td>
                </tr>
                {accounts.filter((a) => a.type === g.type).map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-gray-500">{a.code}</td>
                    <td className="px-3 py-1.5">
                      <Link href={`/banki/ledger?account=${a.code}`} className="hover:text-green-700 hover:underline">
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{a.balance > 0 ? formatCents(a.balance) : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{a.balance < 0 ? formatCents(-a.balance) : ''}</td>
                    <td className="px-3 py-1.5 text-xs"><Check account={a} /></td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot className="border-t-2 border-gray-300 font-semibold">
              <tr>
                <td />
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCents(totalDebits)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCents(totalCredits)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Imports</h2>
        {imports.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing imported yet.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Account</th>
                  <th className="px-3 py-2 font-medium">Covers</th>
                  <th className="px-3 py-2 font-medium text-right">Rows</th>
                  <th className="px-3 py-2 font-medium text-right">New</th>
                  <th className="px-3 py-2 font-medium text-right">Duplicate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {imports.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                      {i.createdAt.toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-1.5">{i.filename}{i.sheet && <span className="text-gray-400"> › {i.sheet}</span>}</td>
                    <td className="px-3 py-1.5">{i.accountName}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">{i.firstDate} → {i.lastDate}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{i.rowsRead}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{i.rowsNew}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{i.rowsDuplicate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

/** The evidence column: does this account agree with the outside world? */
function Check({ account: a }: { account: AccountSummary }) {
  if (a.reconciliation) {
    const { postedOn, statement, ledger } = a.reconciliation
    const diff = ledger - statement
    return diff === 0 ? (
      <span className="text-green-700">
        ✓ matches statement {formatCents(natural(a.type, statement))} on {postedOn}
      </span>
    ) : (
      <span className="text-red-600">
        ✗ statement says {formatCents(natural(a.type, statement))} on {postedOn}, ledger{' '}
        {formatCents(natural(a.type, ledger))}
      </span>
    )
  }
  if (a.code === CODES.transfersClearing && (a.debits || a.credits)) {
    return a.balance === 0 ? (
      <span className="text-green-700">✓ every card payment matched on both sides</span>
    ) : (
      <span className="text-amber-600">
        payments seen on one side only — import the other account&apos;s statement
      </span>
    )
  }
  if (a.statementFormat === 'pc_mastercard' && (a.debits || a.credits)) {
    return <span className="text-gray-400">export has no running balance — no opening balance posted</span>
  }
  return null
}
