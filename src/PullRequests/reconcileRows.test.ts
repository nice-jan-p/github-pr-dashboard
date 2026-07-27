import { describe, it, expect } from 'vitest'
import { reconcileRows } from './reconcileRows'

const pr = (repository: string, number: number, createdAt: string) => ({
  id: number,
  number,
  repository,
  createdAt,
})

describe('reconcileRows', () => {
  it('returns the fetched rows unchanged when nothing disappeared', () => {
    const prev = [pr('repo-a', 1, '2024-01-02'), pr('repo-a', 2, '2024-01-01')]
    const fetched = [pr('repo-a', 1, '2024-01-02'), pr('repo-a', 2, '2024-01-01')]

    const { rows, removingKeys } = reconcileRows(prev, fetched)

    expect(removingKeys).toEqual([])
    expect(rows.map(r => r.number)).toEqual([1, 2])
    expect(rows.every(r => r._removing === undefined)).toBe(true)
  })

  it('keeps a disappeared PR flagged for fade-out', () => {
    const prev = [pr('repo-a', 1, '2024-01-02'), pr('repo-a', 2, '2024-01-01')]
    const fetched = [pr('repo-a', 1, '2024-01-02')]

    const { rows, removingKeys } = reconcileRows(prev, fetched)

    expect(removingKeys).toEqual(['repo-a/2'])
    const removed = rows.find(r => r.number === 2)
    expect(removed?._removing).toBe(true)
    // The still-present PR is not flagged
    expect(rows.find(r => r.number === 1)?._removing).toBeUndefined()
  })

  it('distinguishes PRs by repository, not just number', () => {
    const prev = [pr('repo-a', 1, '2024-01-02'), pr('repo-b', 1, '2024-01-01')]
    const fetched = [pr('repo-a', 1, '2024-01-02')]

    const { removingKeys } = reconcileRows(prev, fetched)

    expect(removingKeys).toEqual(['repo-b/1'])
  })

  it('sorts merged rows newest-first, placing a fading row by its createdAt', () => {
    const prev = [pr('repo-a', 1, '2024-01-03'), pr('repo-a', 2, '2024-01-02')]
    // PR 2 disappeared; a brand-new older PR 3 arrived
    const fetched = [pr('repo-a', 1, '2024-01-03'), pr('repo-a', 3, '2024-01-01')]

    const { rows } = reconcileRows(prev, fetched)

    expect(rows.map(r => r.number)).toEqual([1, 2, 3])
  })

  it('does not mutate the input rows', () => {
    const prev = [pr('repo-a', 2, '2024-01-01')]
    const fetched: any[] = []

    reconcileRows(prev, fetched)

    expect((prev[0] as any)._removing).toBeUndefined()
  })
})
