import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Custom React hook for pull-to-refresh interactions.
 * Handles touch detection, top-scroll verification, damping physics, and haptics.
 */
export function usePullToRefresh({
  onRefresh,
  pullDownThreshold = 72,
  maxPull = 120,
  refreshingHeight = 56,
  disabled = false,
} = {}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const isPullingRef = useRef(false);
  const hasVibratedRef = useRef(false);

  const triggerHaptic = useCallback((pattern = 12) => {
    try {
      if (typeof window !== "undefined" && "navigator" in window && typeof window.navigator.vibrate === "function") {
        window.navigator.vibrate(pattern);
      }
    } catch {
      // Ignore
    }
  }, []);

  const isAtTop = useCallback(() => {
    const scroller = document.getElementById("app-scroll-container");
    if (scroller && scroller.scrollTop > 2) return false;
    const windowScroll = window.scrollY || document.documentElement.scrollTop || 0;
    if (windowScroll > 2) return false;
    return true;
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (isRefreshing || isSuccess) return;
    setIsRefreshing(true);
    setPullDistance(refreshingHeight);
    triggerHaptic([8, 25, 8]);

    try {
      if (typeof onRefresh === "function") {
        await onRefresh();
      }
    } catch (err) {
      console.warn("[usePullToRefresh] Refresh failed:", err);
    } finally {
      setIsSuccess(true);
      setLastRefreshedAt(new Date());
      triggerHaptic(18);

      setTimeout(() => {
        setIsSuccess(false);
        setIsRefreshing(false);
        setPullDistance(0);
      }, 750);
    }
  }, [isRefreshing, isSuccess, refreshingHeight, onRefresh, triggerHaptic]);

  const handleTouchStart = useCallback(
    (e) => {
      if (disabled || isRefreshing || isSuccess) return;
      if (!isAtTop()) {
        isPullingRef.current = false;
        return;
      }
      const touch = e.touches[0];
      startYRef.current = touch.clientY;
      startXRef.current = touch.clientX;
      isPullingRef.current = true;
      hasVibratedRef.current = false;
    },
    [disabled, isRefreshing, isSuccess, isAtTop]
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (!isPullingRef.current || disabled || isRefreshing || isSuccess) return;
      const touch = e.touches[0];
      const deltaY = touch.clientY - startYRef.current;
      const deltaX = touch.clientX - startXRef.current;

      if (deltaY <= 0 || Math.abs(deltaX) > deltaY) {
        if (pullDistance > 0) setPullDistance(0);
        return;
      }

      if (!isAtTop()) {
        isPullingRef.current = false;
        setPullDistance(0);
        return;
      }

      const damped = Math.min(maxPull, Math.pow(deltaY, 0.82) * 1.7);
      setPullDistance(damped);

      if (damped >= pullDownThreshold && !hasVibratedRef.current) {
        triggerHaptic(14);
        hasVibratedRef.current = true;
      } else if (damped < pullDownThreshold && hasVibratedRef.current) {
        hasVibratedRef.current = false;
      }

      if (deltaY > 10 && e.cancelable) {
        e.preventDefault();
      }
    },
    [disabled, isRefreshing, isSuccess, isAtTop, maxPull, pullDownThreshold, pullDistance, triggerHaptic]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isPullingRef.current) return;
    isPullingRef.current = false;

    if (pullDistance >= pullDownThreshold && !isRefreshing && !isSuccess) {
      triggerRefresh();
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, pullDownThreshold, isRefreshing, isSuccess, triggerRefresh]);

  return {
    isRefreshing,
    isSuccess,
    pullDistance,
    lastRefreshedAt,
    triggerRefresh,
    pullRatio: Math.min(1, Math.max(0, pullDistance / pullDownThreshold)),
    isReady: pullDistance >= pullDownThreshold,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
    },
  };
}

export default usePullToRefresh;
