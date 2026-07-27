import { makePrKey } from '../notifications/seenPrStore'

export interface ReconcileResult {
  // Rows to display: the freshly fetched rows plus any PR that just disappeared,
  // the latter flagged `_removing` so the table can fade it out. Sorted newest-first.
  rows: any[]
  // Keys of the rows currently in the `_removing` (fading-out) state.
  removingKeys: string[]
}

/**
 * Diff the previously-displayed rows against a fresh fetch. Any PR that was on
 * screen but is absent from the fetch is kept (flagged `_removing`) so it can be
 * faded out before being dropped, rather than vanishing on the next sync.
 */
export function reconcileRows(prevRows: any[], fetchedRows: any[]): ReconcileResult {
  const fetchedKeys = new Set(
    fetchedRows.map(row => makePrKey(row.repository, row.number))
  )

  const removingRows = prevRows
    .filter(row => !fetchedKeys.has(makePrKey(row.repository, row.number)))
    .map(row => ({ ...row, _removing: true }))

  const rows = [...fetchedRows, ...removingRows].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1
  )

  return {
    rows,
    removingKeys: removingRows.map(row => makePrKey(row.repository, row.number)),
  }
}
