import { describe, it, expect } from "vitest";
import { parseFontGrade } from "./grades";

describe("parseFontGrade", () => {
  it("orders the real confirmed sample sequence correctly (data.csv: 5C, 6A, 6A+, 6B, 6C, 7A+, 7B)", () => {
    const sequence = ["5C", "6A", "6A+", "6B", "6C", "7A+", "7B"];
    const ranks = sequence.map((g) => parseFontGrade(g)!);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });

  it("orders low grades with no letter (1-5, 5+) below the lettered 6A+ range", () => {
    const sequence = ["3", "4", "5", "5+", "6A"];
    const ranks = sequence.map((g) => parseFontGrade(g)!);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });

  it("orders A < A+ < B < B+ < C < C+ within a number", () => {
    const sequence = ["7A", "7A+", "7B", "7B+", "7C", "7C+"];
    const ranks = sequence.map((g) => parseFontGrade(g)!);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });

  it("is case-insensitive", () => {
    expect(parseFontGrade("6a+")).toBe(parseFontGrade("6A+"));
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseFontGrade("  7A  ")).toBe(parseFontGrade("7A"));
  });

  it("returns undefined for grade strings that don't match the Font pattern", () => {
    expect(parseFontGrade("V5")).toBeUndefined(); // V-scale
    expect(parseFontGrade("5.10a")).toBeUndefined(); // YDS
    expect(parseFontGrade("")).toBeUndefined();
    expect(parseFontGrade("6D")).toBeUndefined(); // Font never uses D
  });
});
