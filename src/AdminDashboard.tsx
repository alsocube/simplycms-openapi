import { useCallback, useEffect, useState, type CSSProperties } from 'react'

type DashboardData = {
  website: {
    posts: number
    users: number
    activity: string
  }
  r2: R2Metrics
}

type AdminDashboardProps = {
  onNavigate: (path: string) => void
  currentUser: string | null
}

type DashboardPost = {
  user_id: string
  display_name: string
  created_at: string
}

type R2Object = {
  key: string
  size: number
  lastModified?: string
}

type R2Metrics = {
  objectCount: number
  payloadSize: number
  averageObjectSize: number
  largestObject: R2Object
  newestObject: R2Object
  oldestObject: R2Object
  zeroByteObjectCount: number
  sizeByExtension: Record<string, number>
  countByExtension: Record<string, number>
  sizeByPrefix: Record<string, number>
  topLargestObjects: R2Object[]
  ageDistribution: {
    lessThanOneDay: number
    oneToThirtyDays: number
    thirtyToThreeSixtyFiveDays: number
    overThreeSixtyFiveDays: number
  }
}

function isDashboardPostArray(value: unknown): value is DashboardPost[] {
  return (
    Array.isArray(value) &&
    value.every(
      (post) =>
        typeof post === 'object' &&
        post !== null &&
        'user_id' in post &&
        typeof post.user_id === 'string' &&
        'display_name' in post &&
        typeof post.display_name === 'string' &&
        'created_at' in post &&
        typeof post.created_at === 'string',
    )
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

function isR2Object(value: unknown): value is R2Object {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    (value.lastModified === undefined || typeof value.lastModified === 'string')
  )
}

function isR2Metrics(value: unknown): value is R2Metrics {
  if (!isRecord(value) || !isRecord(value.ageDistribution)) {
    return false
  }

  const ageDistribution = value.ageDistribution

  return (
    typeof value.objectCount === 'number' &&
    Number.isFinite(value.objectCount) &&
    typeof value.payloadSize === 'number' &&
    Number.isFinite(value.payloadSize) &&
    typeof value.averageObjectSize === 'number' &&
    Number.isFinite(value.averageObjectSize) &&
    isR2Object(value.largestObject) &&
    isR2Object(value.newestObject) &&
    isR2Object(value.oldestObject) &&
    typeof value.zeroByteObjectCount === 'number' &&
    Number.isFinite(value.zeroByteObjectCount) &&
    isNumberRecord(value.sizeByExtension) &&
    isNumberRecord(value.countByExtension) &&
    isNumberRecord(value.sizeByPrefix) &&
    Array.isArray(value.topLargestObjects) &&
    value.topLargestObjects.every(isR2Object) &&
    typeof ageDistribution.lessThanOneDay === 'number' &&
    typeof ageDistribution.oneToThirtyDays === 'number' &&
    typeof ageDistribution.thirtyToThreeSixtyFiveDays === 'number' &&
    typeof ageDistribution.overThreeSixtyFiveDays === 'number'
  )
}

function isR2Response(value: unknown): value is { success: boolean; result: R2Metrics } {
  return isRecord(value) && value.success === true && isR2Metrics(value.result)
}

function getPostsUrl() {
  return import.meta.env.DEV ? '/api/posts' : 'https://api.simplycms.my.id/posts'
}

function getR2MetricsUrl() {
  return import.meta.env.DEV
    ? '/api/r2/metrics'
    : 'https://api.simplycms.my.id/r2/metrics'
}

async function fetchDashboardData(signal: AbortSignal): Promise<DashboardData> {
  const [postsResponse, r2Response] = await Promise.all([
    fetch(getPostsUrl(), { signal }),
    fetch(getR2MetricsUrl(), { signal }),
  ])

  if (!postsResponse.ok) {
    throw new Error(`The posts request failed (${postsResponse.status}).`)
  }

  if (!r2Response.ok) {
    throw new Error(`The R2 metrics request failed (${r2Response.status}).`)
  }

  const [postsPayload, r2Payload] = await Promise.all([
    postsResponse.json() as Promise<unknown>,
    r2Response.json() as Promise<unknown>,
  ])

  if (!isDashboardPostArray(postsPayload)) {
    throw new Error('The posts API returned data in an unexpected format.')
  }

  if (!isR2Response(r2Payload)) {
    throw new Error('The R2 metrics API returned data in an unexpected format.')
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentPosts = postsPayload.filter(
    (post) => new Date(post.created_at).getTime() >= weekAgo,
  ).length
  const users = new Set(postsPayload.map((post) => post.user_id)).size

  return {
    website: {
      posts: postsPayload.length,
      users,
      activity: `${recentPosts} new ${recentPosts === 1 ? 'post' : 'posts'} this week`,
    },
    r2: r2Payload.result,
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes.toLocaleString()} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = -1

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[unitIndex]}`
}

function formatDate(value: string) {
  if (!value) {
    return 'Unknown'
  }

  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatExtension(extension: string) {
  return extension === '(none)' ? 'Other' : extension.toUpperCase().replace('.', '')
}

function AdminDashboard({ onNavigate, currentUser }: AdminDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)

  const loadDashboard = useCallback(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    void fetchDashboardData(controller.signal)
      .then(setData)
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'An unexpected error occurred while loading the dashboard.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => loadDashboard(), [loadDashboard, refreshCount])

  function retry() {
    setRefreshCount((count) => count + 1)
  }

  return (
    <main className="page-shell dashboard-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="SimplyCMS home" onClick={(event) => {
          event.preventDefault()
          onNavigate('/')
        }}>
          <span className="brand-mark" aria-hidden="true">
            s
          </span>
          <span>simplycms</span>
        </a>
        <div className="header-actions">
          <span className="welcome-message">Welcome, {currentUser ?? 'admin'}</span>
          <button className="header-link" onClick={() => onNavigate('/admin/content')} type="button">
            Manage content
          </button>
          <button className="header-link" onClick={() => onNavigate('/')} type="button">
            View gallery
          </button>
        </div>
      </header>

      <section className="dashboard-section" aria-labelledby="dashboard-title">
        <div className="dashboard-heading">
          <div>
            <p className="eyebrow">Admin overview</p>
            <h1 id="dashboard-title">Good morning.</h1>
            <p className="dashboard-intro">
              A quick read on what is happening across your SimplyCMS site.
            </p>
          </div>
          <button
            className="dashboard-refresh"
            disabled={isLoading}
            onClick={retry}
            type="button"
          >
            <span aria-hidden="true">↻</span>
            {isLoading ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>

        {isLoading && (
          <div className="dashboard-status" role="status">
            <span className="dashboard-spinner" aria-hidden="true" />
            Loading your latest overview…
          </div>
        )}

        {error && (
          <div className="dashboard-status dashboard-status-error" role="alert">
            <strong>We couldn’t load the dashboard.</strong>
            <span>{error}</span>
            <button className="retry-button" onClick={retry} type="button">
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && data && (
          <div className="dashboard-content">
            <div className="dashboard-summary-grid">
              <article className="metric-card metric-card-accent">
                <div className="metric-card-topline">
                  <span className="metric-label">Published posts</span>
                  <span className="metric-icon" aria-hidden="true">✦</span>
                </div>
                <strong>{data.website.posts.toLocaleString()}</strong>
                <span className="metric-caption">{data.website.activity}</span>
              </article>
              <article className="metric-card">
                <div className="metric-card-topline">
                  <span className="metric-label">Community members</span>
                  <span className="metric-icon metric-icon-muted" aria-hidden="true">◌</span>
                </div>
                <strong>{data.website.users.toLocaleString()}</strong>
                <span className="metric-caption">People with an account</span>
              </article>
              <article className="metric-card">
                <div className="metric-card-topline">
                  <span className="metric-label">R2 objects</span>
                  <span className="metric-icon metric-icon-green" aria-hidden="true">◫</span>
                </div>
                <strong>{data.r2.objectCount.toLocaleString()}</strong>
                <span className="metric-caption">{data.r2.zeroByteObjectCount} empty objects</span>
              </article>
              <article className="metric-card">
                <div className="metric-card-topline">
                  <span className="metric-label">R2 storage used</span>
                  <span className="metric-icon metric-icon-blue" aria-hidden="true">◫</span>
                </div>
                <strong>{formatBytes(data.r2.payloadSize)}</strong>
                <span className="metric-caption">Average {formatBytes(data.r2.averageObjectSize)} per object</span>
              </article>
            </div>

            <div className="dashboard-main-grid">
              <article className="dashboard-panel traffic-panel r2-breakdown-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">R2 contents</p>
                    <h2>Storage by file type</h2>
                  </div>
                  <span className="panel-period">{data.r2.objectCount.toLocaleString()} objects</span>
                </div>
                <div className="extension-list">
                  {Object.entries(data.r2.sizeByExtension)
                    .sort(([, sizeA], [, sizeB]) => sizeB - sizeA)
                    .map(([extension, size]) => {
                      const percentage = data.r2.payloadSize > 0
                        ? (size / data.r2.payloadSize) * 100
                        : 0
                      return (
                        <div className="extension-row" key={extension}>
                          <div className="extension-row-heading">
                            <strong>{formatExtension(extension)}</strong>
                            <span>{formatBytes(size)} · {(data.r2.countByExtension[extension] ?? 0).toLocaleString()} objects</span>
                          </div>
                          <div className="extension-bar"><span style={{ width: `${percentage}%` }} /></div>
                        </div>
                      )
                    })}
                </div>
              </article>

              <article className="dashboard-panel health-panel r2-age-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Object age</p>
                    <h2>When files were added</h2>
                  </div>
                  <span className="health-badge"><i />Live</span>
                </div>
                <div className="age-list">
                  {[
                    ['Less than a day', data.r2.ageDistribution.lessThanOneDay],
                    ['1–30 days', data.r2.ageDistribution.oneToThirtyDays],
                    ['31–365 days', data.r2.ageDistribution.thirtyToThreeSixtyFiveDays],
                    ['Over a year', data.r2.ageDistribution.overThreeSixtyFiveDays],
                  ].map(([label, count]) => (
                    <div className="age-row" key={label}>
                      <span>{label}</span>
                      <strong>{count.toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
                <p className="panel-note">Based on the last-modified date of each object.</p>
              </article>
            </div>

            <article className="dashboard-panel storage-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Cloudflare R2 bucket</p>
                  <h2>Storage at a glance</h2>
                </div>
                <span className="panel-period">{Object.keys(data.r2.sizeByPrefix).length} prefix</span>
              </div>
              <div className="storage-details">
                <div className="storage-visual">
                  <div className="storage-ring" style={{ '--storage-progress': '100%' } as CSSProperties}>
                    <div><strong>{formatBytes(data.r2.payloadSize)}</strong><span>used</span></div>
                  </div>
                </div>
                <div className="storage-copy">
                  <div className="storage-value"><strong>{data.r2.largestObject.key}</strong></div>
                  <p>Largest object · {formatBytes(data.r2.largestObject.size)}. Newest upload: {formatDate(data.r2.newestObject.lastModified ?? '')}.</p>
                  <div className="storage-highlights">
                    <span>Oldest object <strong>{formatDate(data.r2.oldestObject.lastModified ?? '')}</strong></span>
                    <span>Largest file <strong>{formatBytes(data.r2.largestObject.size)}</strong></span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        )}
      </section>

      <footer className="site-footer">
        <span>Made for things worth keeping.</span>
        <span>SimplyCMS</span>
      </footer>
    </main>
  )
}

export default AdminDashboard
