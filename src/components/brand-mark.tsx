import Image from "next/image";

const MARK_SRC = "/brand/mark.png";

type BrandMarkProps = {
  /** Pixel size of the TF mark (square). */
  size?: number;
  /** Show the Topology wordmark beside the mark. */
  showWordmark?: boolean;
  /** Optional mono eyebrow (e.g. TCM) after the name. */
  eyebrow?: string;
  /** Use a heading element for the wordmark (login). */
  as?: "span" | "h1";
  className?: string;
  priority?: boolean;
};

export function BrandMark({
  size = 28,
  showWordmark = true,
  eyebrow,
  as = "span",
  className = "",
  priority = false,
}: BrandMarkProps) {
  const Word = as;

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 ${className}`}
    >
      <Image
        src={MARK_SRC}
        alt={showWordmark ? "" : "Topology"}
        width={size}
        height={size}
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
        priority={priority}
      />
      {showWordmark ? (
        <span className="flex min-w-0 items-baseline gap-2">
          <Word
            className={
              as === "h1"
                ? "truncate text-2xl font-semibold tracking-tight text-[color:var(--topo-ink)]"
                : "truncate text-base font-semibold tracking-tight text-[color:var(--topo-ink)]"
            }
          >
            Topology
          </Word>
          {eyebrow ? (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
              {eyebrow}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
