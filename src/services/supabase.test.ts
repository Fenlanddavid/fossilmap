import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: supabaseMocks.from,
    functions: {
      invoke: supabaseMocks.invoke,
    },
  })),
}))

describe('shared find write service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    supabaseMocks.from.mockReset()
    supabaseMocks.invoke.mockReset()
  })

  it('uses insert-only sharing so anon writes do not require update RLS', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn(() => ({ insert }))
    supabaseMocks.from.mockImplementation(from)

    const { uploadSharedFind } = await import('./supabase')

    await uploadSharedFind({
      id: 'local-1',
      hrid: 'FM-2026-001',
      collectorName: 'D. Smith',
      collectorEmail: '',
      taxon: 'Gryphaea',
      element: '',
      period: 'Jurassic',
      stage: '',
      formation: '',
      member: '',
      bed: '',
      verification_status: 'community',
      locationName: 'Lyme Regis',
      latitude: 50.725234,
      longitude: -2.934567,
      publicLatitude: 50.73,
      publicLongitude: -2.93,
      locationPrecision: '1km',
      precisionLocked: true,
      coordinatesReleased: false,
      dateCollected: '2026-02-20',
      photos: [],
      measurements: {},
      repository: 'Private',
      accession_id: null,
      quality_score: 60,
      notes: '',
      sharedAt: '2026-02-21T12:00:00.000Z',
    })

    expect(from).toHaveBeenCalledWith('shared_finds')
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      fossilmap_id: 'local-1',
      coordinates_released: false,
      location_precision: '1km',
    })])
  })

  it('rejects share edits when no trusted function is configured', async () => {
    const { canEditSharedFinds, deleteSharedFind } = await import('./supabase')

    expect(canEditSharedFinds()).toBe(false)
    await expect(deleteSharedFind('local-1')).rejects.toThrow(/trusted Supabase Edge Function/)
    expect(supabaseMocks.invoke).not.toHaveBeenCalled()
  })

  it('routes precision edits through the configured trusted function', async () => {
    vi.stubEnv('VITE_SHARED_FINDS_WRITE_FUNCTION', 'shared-finds-write')
    supabaseMocks.invoke.mockResolvedValue({ data: { ok: true }, error: null })

    const { canEditSharedFinds, updateSharedFindPrecision } = await import('./supabase')

    expect(canEditSharedFinds()).toBe(true)
    await expect(updateSharedFindPrecision(' local-1 ', 'exact', false, 50.725234, -2.934567, true)).resolves.toBeUndefined()
    expect(supabaseMocks.invoke).toHaveBeenCalledWith('shared-finds-write', {
      body: {
        action: 'updateSharedFindPrecision',
        fossilmapId: 'local-1',
        locationPrecision: 'exact',
        precisionLocked: false,
        publicLatitude: 50.725234,
        publicLongitude: -2.934567,
        coordinatesReleased: true,
      },
    })
  })
})
