import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import ImportantForYou from "./ImportantForYou";
import { buildCreatorTasks } from "../../lib/creatorTasks";

const tasks = buildCreatorTasks({
  invitations: [{ id: "i1", status: "pending_creator_acceptance", brand_name: "Skyline", campaign_title: "Winter launch", proposed_budget: 12000, deliverables: "2 Reels" }],
  kycStatus: null,
});

describe("Important for you card", () => {
  beforeEach(() => { cleanup(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("shows the count, rotates every 4 s, pauses on hover", () => {
    render(<ImportantForYou tasks={tasks} onAction={() => {}} />);
    expect(screen.getByText("2 tasks")).toBeTruthy();
    expect(screen.getByText(/1 of 2/)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByText(/2 of 2/)).toBeTruthy();
    fireEvent.mouseEnter(screen.getByTestId("important-for-you"));
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByText(/2 of 2 · paused/)).toBeTruthy();
  });

  it("arrows move and the CTA hands the task back", () => {
    const onAction = vi.fn();
    render(<ImportantForYou tasks={tasks} onAction={onAction} />);
    fireEvent.click(screen.getByLabelText("Next task"));
    expect(screen.getByText(/2 of 2/)).toBeTruthy();
    fireEvent.click(screen.getByText("Review invitation"));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "invite" }));
  });
});
