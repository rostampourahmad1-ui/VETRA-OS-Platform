import { describe, expect, it } from "vitest";
import { formatJalali, persianNumber, toDate } from "../artifacts/vetra/src/lib/jalali";

describe("jalali utilities", () => {
  it("parses valid and invalid dates safely", () => {
    expect(toDate("2026-08-15")?.getUTCFullYear()).toBe(2026);
    expect(toDate("not-a-date")).toBeNull();
    expect(toDate(null)).toBeNull();
  });
  it("formats dates and converts digits", () => {
    expect(formatJalali("2026-08-15", "yyyy/MM/dd")).toMatch(/^1405\//);
    expect(persianNumber("Project 123")).toBe("Project ۱۲۳");
  });
});
