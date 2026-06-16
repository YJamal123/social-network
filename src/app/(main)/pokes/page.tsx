import Link from "next/link"
import { timeAgo } from "@/lib/time"
import { PokeBackButton } from "@/components/PokeBackButton"
import { PokesAck } from "@/components/PokesAck"
import { getPokers } from "./actions"

export default async function PokesPage() {
  const pokers = await getPokers()

  return (
    <main className="mx-auto max-w-2xl p-6">
      {/* Marks pokes acknowledged on mount so the header indicator clears. */}
      <PokesAck />
      <h1 className="mb-6 text-2xl font-bold">Pokes</h1>

      <div className="space-y-3">
        {pokers.length === 0 ? (
          <p className="py-8 text-center text-gray-400">
            No one has poked you yet.
          </p>
        ) : (
          pokers.map((p) => (
            <div
              key={p.poker_id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-semibold text-white">
                {p.poker_username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/profile/${p.poker_username}`}
                  className="font-semibold text-gray-800 hover:underline"
                >
                  {p.poker_username}
                </Link>
                <p className="mt-0.5 text-sm text-gray-500">
                  poked you · {timeAgo(p.created_at)}
                </p>
              </div>
              <PokeBackButton pokerId={p.poker_id} />
            </div>
          ))
        )}
      </div>
    </main>
  )
}
