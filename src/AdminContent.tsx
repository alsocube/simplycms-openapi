import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { getStoredToken } from './auth'

type AdminContentProps = {
  onNavigate: (path: string) => void
  currentUser: string | null
}

type Post = {
  post_id: string
  user_id: string
  display_name: string
  title: string
  contents: string | null
  created_at: string
  file_path: string
  updated_at: string
  file_name: string
}

type R2Object = {
  key: string
  size: number
  lastModified?: string
}

type R2Metrics = {
  objectCount: number
  payloadSize: number
  topLargestObjects: R2Object[]
  sizeByExtension: Record<string, number>
  countByExtension: Record<string, number>
}

type Tab = 'users' | 'posts' | 'media'

function getPostsUrl() {
  return import.meta.env.DEV ? '/api/posts' : 'https://api.simplycms.my.id/posts'
}

function getR2MetricsUrl() {
  return import.meta.env.DEV
    ? '/api/r2/metrics'
    : 'https://api.simplycms.my.id/r2/metrics'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPostArray(value: unknown): value is Post[] {
  return Array.isArray(value) && value.every((item) => {
    if (!isRecord(item)) return false
    return typeof item.post_id === 'string'
      && typeof item.user_id === 'string'
      && typeof item.display_name === 'string'
      && typeof item.title === 'string'
      && (typeof item.contents === 'string' || item.contents === null)
      && typeof item.created_at === 'string'
      && typeof item.file_path === 'string'
      && typeof item.updated_at === 'string'
      && typeof item.file_name === 'string'
  })
}

function isR2Metrics(value: unknown): value is R2Metrics {
  if (!isRecord(value) || !Array.isArray(value.topLargestObjects)) return false
  if (!isRecord(value.sizeByExtension) || !isRecord(value.countByExtension)) return false
  return typeof value.objectCount === 'number'
    && typeof value.payloadSize === 'number'
    && value.topLargestObjects.every((item) =>
      isRecord(item) && typeof item.key === 'string' && typeof item.size === 'number',
    )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 'KB'
  for (const candidate of units) {
    value /= 1024
    unit = candidate
    if (value < 1024) break
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`
}

function formatDate(value: string) {
  if (!value) return 'Unknown'
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getAuthHeaders() {
  const token = getStoredToken()
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function getUpdateError(status: number) {
  if (status === 400) return 'The post details were rejected. Check the fields and try again.'
  if (status === 404) return 'This post no longer exists.'
  if (status === 413) return 'The replacement image exceeds the 10 MiB size limit.'
  if (status === 415) return 'The replacement file is not a supported image.'
  return `The update failed (${status}). Please try again.`
}

function AdminContent({ onNavigate, currentUser }: AdminContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [media, setMedia] = useState<R2Metrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [selectedImageName, setSelectedImageName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const editDialogRef = useRef<HTMLDialogElement>(null)
  const savingRef = useRef(false)

  const loadContent = useCallback(async () => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    try {
      const [postsResponse, r2Response] = await Promise.all([
        fetch(getPostsUrl(), { signal: controller.signal, headers: getAuthHeaders() }),
        fetch(getR2MetricsUrl(), { signal: controller.signal, headers: getAuthHeaders() }),
      ])
      if (!postsResponse.ok) throw new Error(`The posts request failed (${postsResponse.status}).`)
      if (!r2Response.ok) throw new Error(`The R2 metrics request failed (${r2Response.status}).`)

      const postsPayload: unknown = await postsResponse.json()
      const r2Payload: unknown = await r2Response.json()
      if (!isPostArray(postsPayload)) throw new Error('The posts API returned unexpected data.')
      if (!isRecord(r2Payload) || r2Payload.success !== true || !isR2Metrics(r2Payload.result)) {
        throw new Error('The R2 metrics API returned unexpected data.')
      }

      setPosts([...postsPayload].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ))
      setMedia(r2Payload.result)
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load admin content.')
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }

    return () => controller.abort()
  }, [])

  useEffect(() => {
    void loadContent()
  }, [loadContent])

  const users = [...new Map(posts.map((post) => [
    post.user_id,
    {
      userId: post.user_id,
      displayName: post.display_name,
      postCount: posts.filter((item) => item.user_id === post.user_id).length,
      latestPost: posts
        .filter((item) => item.user_id === post.user_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at,
    },
  ])).values()]

  const normalizedSearch = search.trim().toLowerCase()
  const filteredPosts = posts.filter((post) =>
    `${post.title} ${post.display_name} ${post.contents ?? ''}`.toLowerCase().includes(normalizedSearch),
  )
  const filteredUsers = users.filter((user) =>
    `${user.userId} ${user.displayName}`.toLowerCase().includes(normalizedSearch),
  )
  const filteredMedia = media?.topLargestObjects.filter((item) =>
    item.key.toLowerCase().includes(normalizedSearch),
  ) ?? []

  function openEditor(post: Post) {
    setEditingPost(post)
    setSelectedImageName('')
    setSaveError(null)
    setSaveSuccess(null)
    editDialogRef.current?.showModal()
  }

  async function updatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingPost || savingRef.current) return

    const form = event.currentTarget
    const formData = new FormData(form)
    const image = formData.get('file')
    formData.set('post_id', editingPost.post_id)
    if (typeof formData.get('contents') === 'string' && String(formData.get('contents')).trim() === '') {
      formData.delete('contents')
    }
    if (image instanceof File && image.size === 0) formData.delete('file')

    if (image instanceof File && image.size > 0) {
      if (!image.type.startsWith('image/')) {
        setSaveError('Choose a supported replacement image.')
        return
      }
      if (image.size > 10 * 1024 * 1024) {
        setSaveError('The replacement image exceeds the 10 MiB size limit.')
        return
      }
    }

    savingRef.current = true
    setIsSaving(true)
    setSaveError(null)

    try {
      const response = await fetch(getPostsUrl(), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: formData,
      })
      if (!response.ok) throw new Error(getUpdateError(response.status))

      setSaveSuccess('The post was updated successfully.')
      editDialogRef.current?.close()
      await loadContent()
    } catch (updateError) {
      setSaveError(updateError instanceof Error ? updateError.message : 'Unable to update this post.')
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <main className="page-shell dashboard-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="SimplyCMS home" onClick={(event) => {
          event.preventDefault()
          onNavigate('/')
        }}>
          <span className="brand-mark" aria-hidden="true">s</span>
          <span>simplycms</span>
        </a>
        <div className="header-actions">
          <span className="welcome-message">Welcome, {currentUser ?? 'admin'}</span>
          <button className="header-link" onClick={() => onNavigate('/admin')} type="button">Dashboard</button>
          <button className="header-link" onClick={() => onNavigate('/')} type="button">View gallery</button>
        </div>
      </header>

      <section className="dashboard-section" aria-labelledby="admin-content-title">
        <div className="dashboard-heading">
          <div>
            <p className="eyebrow">Admin content</p>
            <h1 id="admin-content-title">Manage.</h1>
            <p className="dashboard-intro">Review users, edit posts, and inspect saved media.</p>
          </div>
          <button className="dashboard-refresh" disabled={isLoading} onClick={() => void loadContent()} type="button">
            <span aria-hidden="true">↻</span>
            {isLoading ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>

        {isLoading && (
          <div className="dashboard-status" role="status">
            <span className="dashboard-spinner" aria-hidden="true" />
            Loading admin content…
          </div>
        )}
        {error && (
          <div className="dashboard-status dashboard-status-error" role="alert">
            <strong>We couldn’t load the content.</strong>
            <span>{error}</span>
            <button className="retry-button" onClick={() => void loadContent()} type="button">Try again</button>
          </div>
        )}

        {!isLoading && !error && (
          <div className="admin-content">
            {saveSuccess && <p className="upload-feedback upload-success" role="status">{saveSuccess}</p>}
            <nav className="admin-tabs" aria-label="Content sections">
              <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')} type="button">Users <span>{users.length}</span></button>
              <button className={activeTab === 'posts' ? 'active' : ''} onClick={() => setActiveTab('posts')} type="button">Posts <span>{posts.length}</span></button>
              <button className={activeTab === 'media' ? 'active' : ''} onClick={() => setActiveTab('media')} type="button">Media <span>{media?.objectCount ?? 0}</span></button>
            </nav>

            <label className="admin-search">
              <span>Search</span>
              <input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder={`Search ${activeTab}`} />
            </label>

            {activeTab === 'users' && (
              <article className="dashboard-panel admin-table-panel">
                <div className="panel-heading"><div><p className="eyebrow">Post authors</p><h2>Users</h2></div></div>
                <p className="admin-data-note">Derived from published posts because the API does not expose a dedicated users endpoint.</p>
                <div className="admin-table">
                  <div className="admin-table-row admin-table-head"><span>Display name</span><span>Posts</span><span>Latest post</span></div>
                  {filteredUsers.map((user) => (
                    <div className="admin-table-row" key={user.userId}>
                      <span><strong>{user.displayName}</strong><small>{user.userId}</small></span>
                      <span>{user.postCount}</span>
                      <span>{formatDate(user.latestPost ?? '')}</span>
                    </div>
                  ))}
                  {filteredUsers.length === 0 && <p className="admin-empty">No users match your search.</p>}
                </div>
              </article>
            )}

            {activeTab === 'posts' && (
              <article className="dashboard-panel admin-table-panel">
                <div className="panel-heading"><div><p className="eyebrow">Published content</p><h2>Posts</h2></div></div>
                <div className="admin-post-list">
                  {filteredPosts.map((post) => (
                    <article className="admin-post-row" key={post.post_id}>
                      <img src={post.file_path} alt="" loading="lazy" />
                      <div className="admin-post-copy">
                        <strong>{post.title}</strong>
                        <span>by {post.display_name} · updated {formatDate(post.updated_at)}</span>
                        {post.contents && <p>{post.contents}</p>}
                      </div>
                      <button className="admin-edit-button" onClick={() => openEditor(post)} type="button">Edit</button>
                    </article>
                  ))}
                  {filteredPosts.length === 0 && <p className="admin-empty">No posts match your search.</p>}
                </div>
              </article>
            )}

            {activeTab === 'media' && (
              <article className="dashboard-panel admin-table-panel">
                <div className="panel-heading">
                  <div><p className="eyebrow">Cloudflare R2</p><h2>Largest saved media</h2></div>
                  <span className="panel-period">{formatBytes(media?.payloadSize ?? 0)} total</span>
                </div>
                <p className="admin-data-note">The API exposes R2 metrics and largest objects, not a complete saved-media listing endpoint.</p>
                <div className="admin-media-grid">
                  {filteredMedia.map((item) => (
                    <article className="admin-media-card" key={item.key}>
                      {/\.(png|jpe?g|gif|webp|avif)$/i.test(item.key) && (
                        <img src={item.key.startsWith('http') ? item.key : `https://api.simplycms.my.id/${item.key.replace(/^\/+/, '')}`} alt="" loading="lazy" />
                      )}
                      <strong title={item.key}>{item.key.split('/').pop()}</strong>
                      <span>{formatBytes(item.size)} · {formatDate(item.lastModified ?? '')}</span>
                    </article>
                  ))}
                  {filteredMedia.length === 0 && <p className="admin-empty">No media matches your search.</p>}
                </div>
              </article>
            )}
          </div>
        )}
      </section>

      <dialog
        ref={editDialogRef}
        className="upload-dialog"
        aria-labelledby="edit-post-title"
        onCancel={(event) => { if (isSaving) event.preventDefault() }}
      >
        {editingPost && (
          <form className="upload-form admin-edit-form" onSubmit={updatePost}>
            <div className="upload-dialog-header">
              <div><p className="eyebrow">Post editor</p><h2 id="edit-post-title">Edit post</h2></div>
              <button className="dialog-close" aria-label="Close edit form" disabled={isSaving} onClick={() => editDialogRef.current?.close()} type="button">×</button>
            </div>
            <label className="form-field"><span>Display name</span><input name="display_name" defaultValue={editingPost.display_name} disabled={isSaving} required /></label>
            <label className="form-field"><span>Title</span><input name="title" defaultValue={editingPost.title} disabled={isSaving} required /></label>
            <label className="form-field"><span>Contents <span className="optional-label">(optional)</span></span><textarea name="contents" defaultValue={editingPost.contents ?? ''} disabled={isSaving} rows={5} /></label>
            <div className="form-field">
              <label htmlFor="replace-post-image">Replacement image <span className="optional-label">(optional)</span></label>
              <input id="replace-post-image" name="file" accept="image/*" type="file" disabled={isSaving} onChange={(event) => setSelectedImageName(event.currentTarget.files?.[0]?.name ?? '')} />
              {selectedImageName && <p className="selected-image">Selected: {selectedImageName}</p>}
            </div>
            {saveError && <p className="upload-feedback upload-error" role="alert">{saveError}</p>}
            <div className="upload-actions">
              <button className="cancel-upload" disabled={isSaving} onClick={() => editDialogRef.current?.close()} type="button">Cancel</button>
              <button className="submit-upload" disabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </dialog>

      <footer className="site-footer"><span>Made for things worth keeping.</span><span>SimplyCMS</span></footer>
    </main>
  )
}

export default AdminContent
