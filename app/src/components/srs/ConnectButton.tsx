import Link from 'next/link'

export function ConnectButton() {
  return (
    <Link
      href="/srs/connect"
      className="flex items-center gap-1.5 px-4 py-2 bg-violet-100 hover:bg-violet-200 text-violet-700 font-semibold text-sm rounded-lg transition-colors"
    >
      <span>✦</span> Connect
    </Link>
  )
}
