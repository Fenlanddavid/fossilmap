import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: supabaseMocks.from,
  },
}))

function mockSharedFinds(data: unknown[]) {
  const chain = {
    select: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    abortSignal: vi.fn().mockResolvedValue({ data, error: null }),
  }
  supabaseMocks.from.mockReturnValue(chain)
  return chain
}

describe('getRecentCommunityFinds', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
    supabaseMocks.from.mockReset()
  })

  it('uses rounded approximate coordinates instead of falling back to exact locked coordinates', async () => {
    mockSharedFinds([{
      id: 'row-1',
      hrid: 'FM-2026-APPROX',
      taxon: 'Gryphaea',
      location_name: 'Lyme Regis',
      latitude: 50.725234,
      longitude: -2.934567,
      public_latitude: null,
      public_longitude: null,
      location_precision: '100m',
      precision_locked: true,
      coordinates_released: false,
      shared_at: '2026-02-21T12:00:00.000Z',
      photos: [],
    }])

    const { getRecentCommunityFinds } = await import('./communityFinds')
    const finds = await getRecentCommunityFinds()

    expect(finds[0]).toMatchObject({
      id: 'FM-2026-APPROX',
      lat: 50.725,
      lon: -2.935,
    })
  })

  it('hides locked exact rows when no public pin is available', async () => {
    mockSharedFinds([{
      id: 'row-1',
      hrid: 'FM-2026-LOCKED',
      taxon: 'Gryphaea',
      location_name: 'Lyme Regis',
      latitude: 50.725234,
      longitude: -2.934567,
      location_precision: 'exact',
      precision_locked: true,
      coordinates_released: false,
      shared_at: '2026-02-21T12:00:00.000Z',
      photos: [],
    }])

    const { getRecentCommunityFinds } = await import('./communityFinds')
    const finds = await getRecentCommunityFinds()

    expect(finds[0]).toMatchObject({
      id: 'FM-2026-LOCKED',
      lat: null,
      lon: null,
    })
  })
})
