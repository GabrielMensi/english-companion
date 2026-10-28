"use client";

import { StatusBadge } from "@/components/status-badge";
import type { PhonemeCheckResult } from "@/lib/phonemes-core";
import type { ReadAloudResult } from "@/lib/pronunciation-core";
import { PRONUNCIATION_LABELS, PRONUNCIATION_TIPS } from "@/lib/taxonomy";
import { escapeRegExp } from "@/lib/text";

export type Language = "es" | "en";

/** The sentence before reading it, with the words to watch underlined. */
export function TargetSentence({ text, targets }: { text: string; targets: string[] }) {
  const words = targets.filter((t) => t.trim());
  if (words.length === 0) return <p className="font-serif text-reading">{text}</p>;
  const parts = text.split(new RegExp(`(\\b(?:${words.map(escapeRegExp).join("|")})\\b)`, "i"));
  return (
    <p className="font-serif text-reading">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="underline decoration-dotted decoration-2 underline-offset-4">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

/** The sentence after reading it: words heard differently marked, with the number of their note. */
export function ScoredSentence({ result }: { result: ReadAloudResult }) {
  return (
    <p className="font-serif text-reading whitespace-pre-wrap">
      {result.tokens.map((token, i) => {
        if (token.status === "wrong") {
          return (
            <span key={i} className="rounded-sm bg-mark-wrong/10 px-0.5 text-mark-wrong">
              {token.text}
              {token.issue !== null && <sup className="ml-0.5 font-sans text-xs">{token.issue + 1}</sup>}
            </span>
          );
        }
        if (token.status === "missed") {
          return (
            <span key={i} className="text-muted-foreground line-through decoration-mark-wrong" title="Not heard">
              {token.text}
            </span>
          );
        }
        return <span key={i}>{token.text}</span>;
      })}
    </p>
  );
}

export function ResultDetails({
  result,
  transcript,
  language,
  soundCheck,
}: {
  result: ReadAloudResult;
  transcript: string;
  language: Language;
  /** The beta sound check (from the audio); undefined where it isn't asked for. */
  soundCheck?: PhonemeCheckResult | "pending" | null;
}) {
  const checks =
    soundCheck && soundCheck !== "pending" && soundCheck.status === "ready" ? soundCheck.analysis.checks : [];
  const perfect = result.issues.length === 0 && result.missedWords.length === 0;
  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge tone={perfect ? "good" : result.correctWords / result.totalWords >= 0.8 ? "warn" : "bad"}>
          {result.correctWords} of {result.totalWords} words
        </StatusBadge>
        <span className="text-muted-foreground">
          Heard: <span className="font-serif italic">{transcript}</span>
        </span>
      </div>

      {perfect && <p className="text-sm">Every word came through as written.</p>}

      {result.issues.length > 0 && (
        <ol className="space-y-3">
          {result.issues.map((issue, i) => (
            <li key={i} className="space-y-1">
              <p>
                <sup className="mr-1 text-xs text-mark-wrong">{i + 1}</sup>
                <span className="font-serif">{issue.expected}</span>{" "}
                <span className="text-muted-foreground">sounded like</span>{" "}
                <span className="font-serif text-mark-wrong">{issue.heard}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {PRONUNCIATION_LABELS[issue.category]}
                  {issue.detail && <> · {issue.detail}</>}
                </span>
              </p>
              <p className="max-w-[68ch] text-sm text-muted-foreground">
                {PRONUNCIATION_TIPS[issue.category][language]}
              </p>
              <IssueCheckNote check={checks.find((c) => c.issue === i)} />
            </li>
          ))}
        </ol>
      )}

      {soundCheck !== undefined && <SoundCheck check={soundCheck} language={language} />}

      {result.missedWords.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Not heard: {result.missedWords.join(", ")}. Skipped words aren’t counted as pronunciation mistakes.
        </p>
      )}
    </div>
  );
}

/** What the sounds said about a mistake found from the transcript. */
function IssueCheckNote({
  check,
}: {
  check: { verdict: "confirmed" | "not_heard" | "unclear"; detail: string | null } | undefined;
}) {
  if (!check || check.verdict === "unclear") return null;
  return (
    <p className="text-xs text-muted-foreground">
      Sound check (beta):{" "}
      {check.verdict === "confirmed"
        ? `the sounds say the same${check.detail ? `, ${check.detail}` : ""}.`
        : "the sounds came out right, so the transcript may have misheard this word."}
    </p>
  );
}

/** The beta check from the audio: weak vowels said in full, and th or b/v the transcript missed. */
function SoundCheck({ check, language }: { check: PhonemeCheckResult | "pending" | null; language: Language }) {
  const title = (
    <span className="flex items-center gap-2 text-sm font-medium">
      Sound check <StatusBadge tone="optional">Beta</StatusBadge>
    </span>
  );
  if (check === null) return null;
  if (check === "pending") {
    return (
      <div className="space-y-1">
        {title}
        <p className="text-sm text-muted-foreground">Listening to the sounds…</p>
      </div>
    );
  }
  if (check.status === "preparing") {
    const percent = check.progress === null ? "" : ` (${Math.round(check.progress * 100)}%)`;
    return (
      <div className="space-y-1">
        {title}
        <p className="text-sm text-muted-foreground">
          Getting the sound model ready{percent}: a one-time download of about 320 MB. It starts working on your next
          reading.
        </p>
      </div>
    );
  }
  if (check.status === "unavailable") {
    return (
      <div className="space-y-1">
        {title}
        <p className="text-sm text-muted-foreground">{check.reason}</p>
      </div>
    );
  }
  const { hints } = check.analysis;
  return (
    <div className="space-y-2">
      {title}
      {hints.length === 0 ? (
        <p className="text-sm text-muted-foreground">No weak-vowel problems or other sound changes heard.</p>
      ) : (
        <ul className="space-y-2">
          {hints.map((hint, i) => (
            <li key={i} className="space-y-0.5">
              <p>
                <span className="font-serif">{hint.word}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {PRONUNCIATION_LABELS[hint.category]} · {hint.detail}
                </span>
              </p>
              <p className="max-w-[68ch] text-sm text-muted-foreground">
                {PRONUNCIATION_TIPS[hint.category][language]}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Beta: found from the audio, not saved and not counted in your stats yet.
      </p>
    </div>
  );
}
