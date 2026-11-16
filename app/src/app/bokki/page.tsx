import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/auth'
import { db } from '@/db'
import { ensureChart } from '@/lib/bokki/chart'
import { formatNok } from '@/lib/bokki/money'
import {
  MVA_THRESHOLD_ORE,
  missingReceipts,
  osloToday,
  trailingTurnover,
  voucherYears,
  yearReport,
  type AccountRow,
} from '@/lib/bokki/reports'

export const metadata: Metadata = { title: 'Bokki' }

export default async function BokkiPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const session = await auth()
  const uid = session!.user.id
  const today = osloToday()
  const thisYear = Number(today.slice(0, 4))
  const year = Number((await searchParams).year) || thisYear

  await db.transaction((tx) => ensureChart(tx, uid))
  const [report, turnover, missing, years] = await Promise.all([
    yearReport(uid, year),
    trailingTurnover(uid, today),
    missingReceipts(uid),
    voucherYears(uid),
  ])
  const yearChoices = [...new Set([thisYear, ...years])].sort((a, b) => b - a)

  const totalIncome = report.income.reduce((s, a) => s + a.amount, 0)
  const totalExpenses = report.expenses.reduce((s, a) => s + a.amount, 0)
  const totalAssets = report.assets.reduce((s, a) => s + a.amount, 0)
  const totalEquityLiab =
    report.equityAndLiabilities.reduce((s, a) => s + a.amount, 0) + report.priorResult + report.result
  const balances = totalAssets === totalEquityLiab
  const turnoverShare = Math.min(turnover / MVA_THRESHOLD_ORE, 1)

  return (
    <div className="space-y-10">
      {yearChoices.length > 1 && (
        <div className="flex gap-2 text-sm">
          {yearChoices.map((y) => (
            <Link
              key={y}
              href={`/bokki?year=${y}`}
              className={`px-2.5 py-1 rounded-lg border ${y === year ? 'border-red-500 bg-red-50 text-red-800' : 'border-gray-200 text-gray-600'}`}
            >
              {y}
            </Link>
          ))}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label={`Income ${year}`} value={formatNok(totalIncome)} />
        <Stat label={`Expenses ${year}`} value={formatNok(totalExpenses)} />
        <Stat
          label={`Result ${year} (${report.result >= 0 ? 'overskudd' : 'underskudd'})`}
          value={formatNok(report.result)}
          tone={report.result >= 0 ? 'text-green-700' : 'text-red-600'}
        />
      </section>

      <section className="rounded-2xl border border-gray-200 p-5 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">MVA registration threshold</h2>
          <p className="text-sm tabular-nums">
            {formatNok(turnover)} <span className="text-gray-400">of {formatNok(MVA_THRESHOLD_ORE)}</span>
          </p>
        </div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full ${turnoverShare >= 1 ? 'bg-red-500' : turnoverShare >= 0.8 ? 'bg-amber-500' : 'bg-green-500'}`}
            style={{ width: `${turnoverShare * 100}%` }}
          />
        </div>
        <p className="text-xs text-gray-500">
          Sales over the twelve months to {today}. Once sales pass NOK 50 000 within any twelve months the
          business must register in Merverdiavgiftsregisteret and start charging MVA (15 % on food). Until
          then no MVA is charged and none is deducted.
          {turnoverShare >= 1 && <strong className="text-red-600"> The threshold is passed — register now.</strong>}
        </p>
      </section>

      {missing.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <h2 className="font-semibold text-amber-800">
            {missing.length} expense{missing.length === 1 ? '' : 's'} without a receipt
          </h2>
          <p className="text-sm text-gray-600 mb-2">
            An expense needs its documentation (bilag) to be deductible. Attach a photo of the receipt, or the
            card statement line if the receipt is lost.
          </p>
          <ul className="text-sm space-y-0.5">
            {missing.slice(0, 10).map((v) => (
              <li key={v.voucherNo}>
                <Link href={`/bokki/bilag/${v.voucherNo}`} className="hover:underline">
                  <span className="font-mono text-gray-400">#{v.voucherNo}</span> {v.postedOn} · {v.description} ·{' '}
                  {formatNok(v.amount)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold mb-1">Income statement {year}</h2>
          <p className="text-sm text-gray-500 mb-3">Resultatregnskap · 1 Jan – 31 Dec</p>
          <Statement
            year={year}
            groups={[
              { label: 'Income (driftsinntekter)', rows: report.income, total: totalIncome },
              { label: 'Expenses (driftskostnader)', rows: report.expenses, total: totalExpenses },
            ]}
            footer={[{ label: 'Result (årsresultat)', amount: report.result }]}
          />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-1">Balance sheet 31 Dec {year}</h2>
          <p className="text-sm text-gray-500 mb-3">
            Balanse ·{' '}
            <span className={balances ? 'text-green-700' : 'text-red-600'}>
              assets {formatNok(totalAssets)} {balances ? '=' : '≠'} equity + liabilities {formatNok(totalEquityLiab)}{' '}
              {balances ? '✓' : '✗'}
            </span>
          </p>
          <Statement
            year={year}
            groups={[
              { label: 'Assets (eiendeler)', rows: report.assets, total: totalAssets },
              {
                label: 'Equity & liabilities (egenkapital og gjeld)',
                rows: report.equityAndLiabilities,
                extra: [
                  ...(report.priorResult ? [{ label: 'Result of earlier years', amount: report.priorResult }] : []),
                  { label: `Result ${year}`, amount: report.result },
                ],
                total: totalEquityLiab,
              },
            ]}
          />
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'text-gray-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}

function Statement({
  year,
  groups,
  footer = [],
}: {
  year: number
  groups: { label: string; rows: AccountRow[]; extra?: { label: string; amount: number }[]; total: number }[]
  footer?: { label: string; amount: number }[]
}) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-xl">
      <table className="w-full text-sm">
        {groups.map((g) => (
          <tbody key={g.label} className="border-t border-gray-200 first:border-t-0">
            <tr>
              <td colSpan={2} className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {g.label}
              </td>
            </tr>
            {g.rows.filter((r) => r.amount !== 0).map((r) => (
              <tr key={r.code} className="hover:bg-gray-50">
                <td className="px-3 py-1">
                  <Link href={`/bokki/bilag?year=${year}&account=${r.code}`} className="hover:text-red-700 hover:underline">
                    <span className="font-mono text-gray-400">{r.code}</span> {r.nameEn}{' '}
                    <span className="text-gray-400">· {r.name}</span>
                  </Link>
                </td>
                <td className="px-3 py-1 text-right tabular-nums">{formatNok(r.amount)}</td>
              </tr>
            ))}
            {g.extra?.map((x) => (
              <tr key={x.label}>
                <td className="px-3 py-1 italic text-gray-600">{x.label}</td>
                <td className="px-3 py-1 text-right tabular-nums">{formatNok(x.amount)}</td>
              </tr>
            ))}
            {g.rows.every((r) => r.amount === 0) && !g.extra && (
              <tr><td colSpan={2} className="px-3 py-1 text-gray-400">Nothing yet</td></tr>
            )}
            <tr className="font-medium border-t border-gray-100">
              <td className="px-3 py-1.5">Total</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatNok(g.total)}</td>
            </tr>
          </tbody>
        ))}
        {footer.map((f) => (
          <tfoot key={f.label} className="border-t-2 border-gray-300 font-semibold">
            <tr>
              <td className="px-3 py-2">{f.label}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${f.amount < 0 ? 'text-red-600' : ''}`}>{formatNok(f.amount)}</td>
            </tr>
          </tfoot>
        ))}
      </table>
    </div>
  )
}
