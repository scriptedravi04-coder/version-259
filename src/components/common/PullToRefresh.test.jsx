import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import PullToRefresh from "./PullToRefresh";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";

describe("PullToRefresh Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children content accurately", () => {
    render(
      <PullToRefresh onRefresh={vi.fn()}>
        <div data-testid="feed-content">Collaboration Feed Content</div>
      </PullToRefresh>
    );

    expect(screen.getByTestId("feed-content")).toBeDefined();
    expect(screen.getByText("Collaboration Feed Content")).toBeDefined();
  });

  it("renders lastUpdatedText in pulling indicator", () => {
    render(
      <PullToRefresh onRefresh={vi.fn()} lastUpdatedText="Updated just now">
        <div>Feed Content</div>
      </PullToRefresh>
    );

    expect(screen.getByText("Updated just now")).toBeDefined();
  });

  it("triggers onRefresh callback when pulled past threshold and released", async () => {
    const onRefreshMock = vi.fn().mockResolvedValue(true);

    const { container } = render(
      <PullToRefresh
        onRefresh={onRefreshMock}
        pullDownThreshold={60}
        refreshingText="Fetching updates..."
      >
        <div>Feed Content</div>
      </PullToRefresh>
    );

    const rootElement = container.firstChild;

    // Simulate touch pull
    fireEvent.touchStart(rootElement, {
      touches: [{ clientY: 100, clientX: 100 }],
    });

    fireEvent.touchMove(rootElement, {
      touches: [{ clientY: 260, clientX: 100 }],
    });

    await act(async () => {
      fireEvent.touchEnd(rootElement);
    });

    expect(onRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("does not trigger onRefresh when pull distance is less than threshold", async () => {
    const onRefreshMock = vi.fn().mockResolvedValue(true);

    const { container } = render(
      <PullToRefresh onRefresh={onRefreshMock} pullDownThreshold={70}>
        <div>Feed Content</div>
      </PullToRefresh>
    );

    const rootElement = container.firstChild;

    fireEvent.touchStart(rootElement, {
      touches: [{ clientY: 100, clientX: 100 }],
    });

    // Small pull that won't cross threshold
    fireEvent.touchMove(rootElement, {
      touches: [{ clientY: 115, clientX: 100 }],
    });

    await act(async () => {
      fireEvent.touchEnd(rootElement);
    });

    expect(onRefreshMock).not.toHaveBeenCalled();
  });

  it("displays refreshing and success indicators correctly", async () => {
    let resolveRefresh;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    const onRefreshMock = vi.fn().mockReturnValue(refreshPromise);

    const { container } = render(
      <PullToRefresh
        onRefresh={onRefreshMock}
        pullDownThreshold={50}
        refreshingText="Updating collaborations feed..."
        successText="Collaborations synced"
      >
        <div>Feed Content</div>
      </PullToRefresh>
    );

    const rootElement = container.firstChild;

    fireEvent.touchStart(rootElement, {
      touches: [{ clientY: 50, clientX: 100 }],
    });

    fireEvent.touchMove(rootElement, {
      touches: [{ clientY: 220, clientX: 100 }],
    });

    await act(async () => {
      fireEvent.touchEnd(rootElement);
    });

    expect(screen.getByText("Updating collaborations feed...")).toBeDefined();

    // Resolve refresh
    await act(async () => {
      resolveRefresh();
      await refreshPromise;
    });

    expect(screen.getByText("Collaborations synced")).toBeDefined();
  });
});
