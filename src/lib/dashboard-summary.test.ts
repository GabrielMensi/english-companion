import { describe, expect, it } from "vitest";
import { dashboardDetail, dashboardHeadline } from "@/lib/dashboard-summary";

describe("dashboardHeadline", () => {
  it("compares with the previous period of the same length", () => {
    expect(dashboardHeadline({ per100Words: 6.43, previousPer100Words: 6.83 }, 30)).toBe(
      "6.43 mistakes per 100 words, 0.4 fewer than the previous 30 days.",
    );
    expect(dashboardHeadline({ per100Words: 7, previousPer100Words: 5.5 }, 7)).toBe(
      "7 mistakes per 100 words, 1.5 more than the previous 7 days.",
    );
    expect(dashboardHeadline({ per100Words: 5, previousPer100Words: 5 }, 90)).toBe(
      "5 mistakes per 100 words, the same as the previous 90 days.",
    );
  });

  it("has no comparison for all time or without a previous period", () => {
    expect(dashboardHeadline({ per100Words: 6.43, previousPer100Words: 6 }, null)).toBe("6.43 mistakes per 100 words.");
    expect(dashboardHeadline({ per100Words: 6.43, previousPer100Words: null }, 30)).toBe("6.43 mistakes per 100 words.");
  });
});

describe("dashboardDetail", () => {
  const totals = { messages: 40, cleanMessagesPct: 12.5, words: 1914, typos: 25 };

  it("mentions typos only when they don't count", () => {
    expect(dashboardDetail(totals, false)).toBe(
      "13% of your 40 messages had no mistakes. 1,914 words written, 25 typos not counted.",
    );
    expect(dashboardDetail(totals, true)).toBe("13% of your 40 messages had no mistakes. 1,914 words written.");
    expect(dashboardDetail({ messages: 1, cleanMessagesPct: 100, words: 12, typos: 1 }, false)).toBe(
      "100% of your 1 message had no mistakes. 12 words written, 1 typo not counted.",
    );
  });
});
