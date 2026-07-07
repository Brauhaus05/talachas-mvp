"use client";

import { useState } from "react";
import { Star } from "lucide-react";

/** Controlled-by-hidden-input 1–5 star selector. Writes the chosen value into a
 * hidden <input name={name}> so it posts with the surrounding <form>. */
export function RatingInput({
  name,
  ariaLabel,
  labelledBy,
}: {
  name: string;
  ariaLabel: (n: number) => string;
  labelledBy?: string;
}) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div
      className="flex items-center gap-1"
      role="radiogroup"
      aria-labelledby={labelledBy}
    >
      <input type="hidden" name={name} value={value} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={ariaLabel(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => setValue(n)}
          className="text-text-primary p-0.5"
        >
          <Star
            className="h-7 w-7"
            aria-hidden
            fill={n <= active ? "currentColor" : "none"}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}
