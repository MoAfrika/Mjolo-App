import { describe, it, expect } from "vitest";
import { samePage, dateLabel, money, type Profile } from "../src/lib";
const p: Profile = {
  id: "1",
  username: "test",
  display_name: "Test",
  bio: "A thoughtful introduction.",
  age: 29,
  gender: "woman",
  seeking: "everyone",
  province: "Gauteng",
  city: "Johannesburg",
  area: "Rosebank",
  intentions: "A lasting relationship",
  interests: ["Hiking"],
  languages: ["English"],
  photos: [],
  budget_min: 0,
  budget_max: 300,
  availability: "Weekends",
};
describe("Shared facts and South African presentation", () => {
  it("explains only shared facts, without invented scores", () => {
    expect(
      samePage(p, {
        ...p,
        interests: ["Music"],
        intentions: "Exploring connections",
        availability: "Flexible",
        budget_min: 400,
        budget_max: 800,
      }),
    ).toEqual([]);
    expect(samePage(p, { ...p, interests: ["hiking"] })).toHaveLength(4);
  });
  it("formats dates in Johannesburg regardless of the browser timezone", () => {
    expect(dateLabel("2026-10-20T16:00:00Z")).toContain("18:00");
  });
  it("formats budgets in ZAR", () => expect(money(250)).toMatch(/250/));
});
