import { cn } from "@/lib/utils";

type EscaparLogoProps = {
  /** Render style. "full" shows mark + wordmark, "mark" is icon-only. */
  variant?: "full" | "mark";
  /** Optional className applied to the outer element. */
  className?: string;
  /** Tailwind text-* size token controlling overall scale. Default text-2xl. */
  size?: string;
};

/**
 * Escapar wordmark + icon. SVG-only so it scales crisply at every size and
 * inherits color from `currentColor` — drop a `text-*` class to recolor.
 *
 * The mark is a rounded square containing a stylized "E" — three horizontal
 * strokes echoing the brand initial. Clean, recognizable, professional.
 */
export const EscaparLogo = ({
  variant = "full",
  className,
  size = "text-2xl",
}: EscaparLogoProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight",
        size,
        className,
      )}
      aria-label="Escapar"
    >
      <svg
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="h-[1.25em] w-[1.25em] shrink-0"
      >
        <defs>
          <linearGradient id="escapar-mark-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.75" />
          </linearGradient>
        </defs>
        <rect
          x="1.5"
          y="1.5"
          width="29"
          height="29"
          rx="8"
          fill="url(#escapar-mark-gradient)"
        />
        <path
          d="M10.5 9.5 H21.5 M10.5 16 H19 M10.5 22.5 H21.5"
          stroke="white"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
      </svg>
      {variant === "full" && (
        <span className="font-semibold tracking-tight">
          Escapar
        </span>
      )}
    </span>
  );
};

export default EscaparLogo;
