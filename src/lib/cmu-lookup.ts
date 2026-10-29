/**
 * CMU Pronouncing Dictionary lookup for `scoreReading`. The dictionary is ~4.5 MB:
 * import this only on the server (and in tests), never from client components.
 */
import { dictionary } from "cmu-pronouncing-dictionary";

import type { Lookup } from "./pronunciation-core";

/** Every pronunciation of the word: "read" → ["R IY1 D", "R EH1 D"]. */
export const cmuLookup: Lookup = (word) => {
  const variants: string[] = [];
  for (let i = 1; ; i++) {
    const entry = dictionary[i === 1 ? word : `${word}(${i})`];
    if (!entry) break;
    variants.push(entry);
  }
  return variants.length > 0 ? variants : undefined;
};
