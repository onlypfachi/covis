import { useEffect } from "react";

/** Calls refetch every intervalMs while active. */
export function usePolling(active: boolean, refetch: () => void, intervalMs = 1500) {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(refetch, intervalMs);
    return () => clearInterval(t);
  }, [active, refetch, intervalMs]);
}
