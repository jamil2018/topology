"use client";

import { useEffect, useState } from "react";
import { StatusChip } from "./status-chip";

type ImplCard = {
  implementationId: string;
  type: string;
  externalKey: string | null;
  passRate: number | null;
  flakeProbability: number | null;
  durationP50: number | null;
  durationP95: number | null;
  lastStatus: string | null;
};

export function IntentReliabilityCards({ intentId }: { intentId: string }) {
  const [cards, setCards] = useState<ImplCard[] | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/intents/${intentId}/reliability`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        const reliability = data.reliability as {
          windowDays: number;
          implementations: ImplCard[];
        } | null;
        if (reliability?.implementations?.length) {
          setCards(reliability.implementations);
          setWindowDays(reliability.windowDays);
        } else {
          setCards(null);
        }
      })
      .catch(() => {
        if (!cancelled) setCards(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [intentId]);

  if (loading) {
    return (
      <p className="mt-4 text-xs text-[color:var(--topo-muted)]">
        Loading reliability…
      </p>
    );
  }

  if (!cards || cards.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
        Reliability · {windowDays}d
      </div>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {cards.map((card) => (
          <li
            key={card.implementationId}
            className="rounded-md border border-[color:var(--topo-line)] px-3 py-2 text-sm"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusChip mono>{card.type}</StatusChip>
              {card.lastStatus ? (
                <StatusChip mono>{card.lastStatus}</StatusChip>
              ) : null}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[color:var(--topo-muted)]">
              <div>
                <dt className="font-mono uppercase tracking-wide">Pass</dt>
                <dd className="text-[color:var(--topo-ink)]">
                  {card.passRate == null ? "—" : `${Math.round(card.passRate)}%`}
                </dd>
              </div>
              <div>
                <dt className="font-mono uppercase tracking-wide">Flake</dt>
                <dd className="text-[color:var(--topo-ink)]">
                  {card.flakeProbability == null
                    ? "—"
                    : `${Math.round(card.flakeProbability * 100)}%`}
                </dd>
              </div>
              <div>
                <dt className="font-mono uppercase tracking-wide">p50</dt>
                <dd className="text-[color:var(--topo-ink)]">
                  {card.durationP50 == null ? "—" : `${card.durationP50}ms`}
                </dd>
              </div>
              <div>
                <dt className="font-mono uppercase tracking-wide">p95</dt>
                <dd className="text-[color:var(--topo-ink)]">
                  {card.durationP95 == null ? "—" : `${card.durationP95}ms`}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
