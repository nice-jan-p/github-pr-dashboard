import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPullRequests } from '../PullRequests/fetchPullRequests'
import { isPollingPaused } from '../GitHub/Api'
import { loadSeenPrKeys, saveSeenPrKeys, makePrKey } from '../notifications/seenPrStore'
import { showPrNotification } from '../notifications/notificationService'
import { reconcileRows } from '../PullRequests/reconcileRows'

const POLL_INTERVAL_MS = 60_000
// Keep a PR that disappeared from the results visible briefly so it can fade out
// before being removed. Must match the animation duration in PullRequestTable.
const FADE_OUT_MS = 600

interface UsePollingResult {
  rows: any[]
  isLoading: boolean
  lastPollTime: Date | null
  error: string | null
}

export function usePolling(filters: string): UsePollingResult {
  const [rows, setRows] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const seenKeysRef = useRef<Set<string> | null>(null)
  const isFirstFetchRef = useRef(true)
  const filtersRef = useRef(filters)
  const isFetchingRef = useRef(false)
  // Mirror of the currently-displayed rows (incl. rows mid-fade-out) so poll()
  // can diff against them without depending on React state closures.
  const rowsRef = useRef<any[]>([])
  // Pending fade-out timers keyed by PR, so we can cancel a removal if the PR
  // reappears before its timer fires.
  const removalTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Keep filtersRef in sync
  filtersRef.current = filters

  // Replace the displayed rows with the freshly fetched ones, but keep any PR that
  // vanished from the results on screen for a short moment (flagged `_removing`)
  // so the table can fade it out before it's actually dropped.
  const reconcileDisplayedRows = useCallback((fetchedRows: any[], isFilterChange: boolean) => {
    // A filter change swaps the whole set — replace immediately, no fade-outs.
    if (isFilterChange) {
      removalTimersRef.current.forEach(timer => clearTimeout(timer))
      removalTimersRef.current.clear()
      rowsRef.current = fetchedRows
      setRows(fetchedRows)
      return
    }

    const { rows: merged, removingKeys } = reconcileRows(rowsRef.current, fetchedRows)
    const removingKeySet = new Set(removingKeys)

    // Cancel fade-outs for PRs no longer removing (reappeared, or already dropped).
    removalTimersRef.current.forEach((timer, key) => {
      if (!removingKeySet.has(key)) {
        clearTimeout(timer)
        removalTimersRef.current.delete(key)
      }
    })

    // Schedule the actual removal for newly-disappeared PRs once the fade has played.
    removingKeys.forEach(key => {
      if (removalTimersRef.current.has(key)) return
      const timer = setTimeout(() => {
        removalTimersRef.current.delete(key)
        setRows(current => {
          const next = current.filter(
            (r: any) => makePrKey(r.repository, r.number) !== key
          )
          rowsRef.current = next
          return next
        })
      }, FADE_OUT_MS)
      removalTimersRef.current.set(key, timer)
    })

    rowsRef.current = merged
    setRows(merged)
  }, [])

  const poll = useCallback(async (isFilterChange: boolean) => {
    if (isFetchingRef.current) return
    if (isPollingPaused()) {
      console.log('[Polling] Skipped — GitHub rate limit low')
      return
    }
    isFetchingRef.current = true
    setIsLoading(true)

    try {
      const fetchedRows = await fetchPullRequests(filtersRef.current).catch((e: unknown) => {
        console.error('[Polling] Fetch failed:', e)
        setError(e instanceof Error ? e.message : String(e))
        return null
      })
      if (fetchedRows === null) return

      setError(null)
      setLastPollTime(new Date())
      reconcileDisplayedRows(fetchedRows, isFilterChange)

      // Build set of fetched PR keys
      const fetchedKeys = new Set(
        fetchedRows.map((row: any) => makePrKey(row.repository, row.number))
      )

      // Load seen keys on first call
      if (seenKeysRef.current === null) {
        const stored = loadSeenPrKeys()
        seenKeysRef.current = stored ?? new Set()
      }

      const isFirstEver = isFirstFetchRef.current && seenKeysRef.current.size === 0
      isFirstFetchRef.current = false

      if (isFirstEver) {
        // First load with no prior history: seed with currently visible PRs
        console.log('[Polling] Seeding', fetchedKeys.size, 'PRs as seen (firstEver)')
        fetchedKeys.forEach(key => seenKeysRef.current!.add(key))
      } else if (isFilterChange) {
        // Filter changed: reset seen to exactly the currently-visible set so a PR
        // that later enters this filter view notifies, even if it was seen under a prior filter
        console.log('[Polling] Resetting seen to', fetchedKeys.size, 'PRs (filterChange)')
        seenKeysRef.current = new Set(fetchedKeys)
      } else {
        // Notify for genuinely new PRs
        const newPrs: string[] = []
        for (const row of fetchedRows) {
          const key = makePrKey(row.repository, row.number)
          if (!seenKeysRef.current.has(key)) {
            seenKeysRef.current.add(key)
            newPrs.push(key)
            showPrNotification(row).catch(e => console.error('[Notifications] Error:', e))
          }
        }
        if (newPrs.length > 0) {
          console.log('[Polling] New PRs detected:', newPrs)
        } else {
          console.log('[Polling] No new PRs (', fetchedKeys.size, 'fetched,', seenKeysRef.current.size, 'seen)')
        }
      }

      saveSeenPrKeys(seenKeysRef.current)
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }, [reconcileDisplayedRows])

  // Start/restart polling when filters change
  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
    }

    // Fetch immediately (filter change = merge into seen, no notifications)
    const isFilterChange = !isFirstFetchRef.current
    poll(isFilterChange)

    // Set up recurring poll
    intervalRef.current = setInterval(() => poll(false), POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
      }
    }
  }, [filters, poll])

  // Poll immediately when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        poll(false)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [poll])

  // Clear any pending fade-out timers on unmount
  useEffect(() => {
    const timers = removalTimersRef.current
    return () => {
      timers.forEach(timer => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  return { rows, isLoading, lastPollTime, error }
}
