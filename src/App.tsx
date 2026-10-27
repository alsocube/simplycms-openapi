import { type FormEvent, useEffect, useRef, useState } from 'react'
import './App.css'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024

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

function isPostArray(value: unknown): value is Post[] {
  return (
    Array.isArray(value) &&
    value.every(
      (post) =>
        typeof post === 'object' &&
        post !== null &&
        'post_id' in post &&
        typeof post.post_id === 'string' &&
        'user_id' in post &&
        typeof post.user_id === 'string' &&
        'display_name' in post &&
        typeof post.display_name === 'string' &&
        'title' in post &&
        typeof post.title === 'string' &&
        'contents' in post &&
        (typeof post.contents === 'string' || post.contents === null) &&
        'created_at' in post &&
        typeof post.created_at === 'string' &&
        'updated_at' in post &&
        typeof post.updated_at === 'string' &&
        'file_path' in post &&
        typeof post.file_path === 'string' &&
        'file_name' in post &&
        typeof post.file_name === 'string',
    )
  )
}

function getPostsUrl() {
  return import.meta.env.DEV
    ? '/api/posts'
    : 'https://api.simplycms.my.id/posts'
}

function getUploadErrorMessage(status: number) {
  if (status === 400) {
    return 'The post details or image were rejected. Check your fields and try again.'
  }

  if (status === 413) {
    return 'The image exceeds the 10 MiB size limit. Choose a smaller image.'
  }

  if (status === 415) {
    return 'This image format is not supported. Choose another image.'
  }

  return `The upload failed (${status}). Please try again.`
}

function getMasonryColumnCount() {
  if (window.matchMedia('(max-width: 440px)').matches) {
    return 1
  }

  if (window.matchMedia('(max-width: 760px)').matches) {
    return 2
  }

  return 4
}

function distributePosts(posts: Post[], columnCount: number) {
  const columns = Array.from({ length: columnCount }, () => [] as Post[])

  posts.forEach((post, index) => {
    columns[index % columnCount].push(post)
  })

  return columns
}

function App() {
  const [posts, setPosts] = useState<Post[]>([])
  const [masonryColumnCount, setMasonryColumnCount] = useState(getMasonryColumnCount)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)
  const [showJumpToTop, setShowJumpToTop] = useState(false)
  const [selectedImageName, setSelectedImageName] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const uploadDialogRef = useRef<HTMLDialogElement>(null)
  const submissionInProgressRef = useRef(false)
  const masonryColumns = distributePosts(posts, masonryColumnCount)

  useEffect(() => {
    const updateMasonryColumnCount = () => {
      setMasonryColumnCount(getMasonryColumnCount())
    }

    window.addEventListener('resize', updateMasonryColumnCount)

    return () => {
      window.removeEventListener('resize', updateMasonryColumnCount)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadPosts() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(getPostsUrl(), { signal: controller.signal })

        if (!response.ok) {
          throw new Error(`The posts request failed (${response.status}).`)
        }

        const data: unknown = await response.json()

        if (!isPostArray(data)) {
          throw new Error('The posts API returned data in an unexpected format.')
        }

        const sortedPosts = [...data].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )

        setPosts(sortedPosts)
      } catch (loadError) {
        if (controller.signal.aborted) {
          return
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'An unexpected error occurred while loading posts.',
        )
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void loadPosts()

    return () => controller.abort()
  }, [reloadCount])

  useEffect(() => {
    const handleScroll = () => {
      setShowJumpToTop(window.scrollY > 260)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submissionInProgressRef.current) {
      return
    }

    const form = event.currentTarget
    const formData = new FormData(form)
    const image = formData.get('file')

    if (!(image instanceof File)) {
      setUploadError('Choose an image to upload.')
      return
    }

    if (!image.type.startsWith('image/')) {
      setUploadError('Choose a supported image file.')
      return
    }

    if (image.size > MAX_IMAGE_SIZE) {
      setUploadError('The image exceeds the 10 MiB size limit. Choose a smaller image.')
      return
    }

    setUploadError(null)
    submissionInProgressRef.current = true
    setIsUploading(true)

    try {
      const response = await fetch(getPostsUrl(), {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(getUploadErrorMessage(response.status))
      }

      form.reset()
      setSelectedImageName('')
      setUploadSuccess('Your post was uploaded successfully.')
      setReloadCount((count) => count + 1)
      uploadDialogRef.current?.close()
    } catch (submitError) {
      setUploadError(
        submitError instanceof Error
          ? submitError.message
          : 'An unexpected error occurred while uploading your post.',
      )
    } finally {
      submissionInProgressRef.current = false
      setIsUploading(false)
    }
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="SimplyCMS home">
          <span className="brand-mark" aria-hidden="true">
            s
          </span>
          <span>simplycms</span>
        </a>
        <p className="header-note">A little inspiration, collected.</p>
        <button
          className="share-button"
          onClick={() => {
            setUploadError(null)
            setUploadSuccess(null)
            uploadDialogRef.current?.showModal()
          }}
          type="button"
        >
          <span aria-hidden="true">+</span>
          Share a post
        </button>
      </header>

      <section className="gallery-section" aria-labelledby="gallery-title">
        <div className="gallery-heading">
          <div>
            <p className="eyebrow">The community collection</p>
            <h1 id="gallery-title">Discover</h1>
          </div>
          {!isLoading && !error && (
            <p className="post-count">
              {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            </p>
          )}
        </div>

        {uploadSuccess && (
          <p className="upload-feedback upload-success" role="status">
            {uploadSuccess}
          </p>
        )}

        {isLoading && (
          <p className="status-message" role="status">
            Loading posts…
          </p>
        )}

        {error && (
          <div className="status-panel" role="alert">
            <p>We couldn’t load the posts.</p>
            <span>{error}</span>
            <button
              className="retry-button"
              onClick={() => setReloadCount((count) => count + 1)}
              type="button"
            >
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && posts.length === 0 && (
          <p className="status-message">There are no posts to show yet.</p>
        )}

        {!isLoading && !error && posts.length > 0 && (
          <div className="masonry-grid">
            {masonryColumns.map((column, columnIndex) => (
              <div className="masonry-column" key={columnIndex}>
                {column.map((post) => (
                  <article className="post-card" key={post.post_id}>
                    <img
                      className="post-image"
                      src={post.file_path}
                      alt={post.title ? `${post.title} by ${post.display_name}` : post.file_name}
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="post-details">
                      <div className="post-byline">
                        <span className="post-avatar" aria-hidden="true">
                          {post.display_name.charAt(0).toUpperCase()}
                        </span>
                        <span>{post.display_name}</span>
                      </div>
                      <h2>{post.title}</h2>
                      {post.contents && <p className="post-content">{post.contents}</p>}
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <dialog
        aria-describedby="upload-description"
        aria-labelledby="upload-title"
        className="upload-dialog"
        onClick={(event) => {
          if (!isUploading && event.target === event.currentTarget) {
            event.currentTarget.close()
          }
        }}
        onCancel={(event) => {
          if (isUploading) {
            event.preventDefault()
          }
        }}
        ref={uploadDialogRef}
      >
        <div className="upload-dialog-header">
          <div>
            <p className="eyebrow">Community contribution</p>
            <h2 id="upload-title">Share something</h2>
          </div>
          <button
            aria-label="Close upload form"
            className="dialog-close"
            onClick={() => uploadDialogRef.current?.close()}
            disabled={isUploading}
            type="button"
          >
            ×
          </button>
        </div>
        <p className="upload-description" id="upload-description">
          Add a little context and an image to share with the community. Images
          can be up to 10 MiB.
        </p>
        <form className="upload-form" onSubmit={submitPost}>
          <label className="form-field">
            <span>Display name</span>
            <input
              autoComplete="name"
              disabled={isUploading}
              name="display_name"
              required
            />
          </label>
          <label className="form-field">
            <span>Title</span>
            <input
              disabled={isUploading}
              name="title"
              required
            />
          </label>
          <label className="form-field">
            <span>
              Contents <span className="optional-label">(optional)</span>
            </span>
            <textarea disabled={isUploading} name="contents" rows={4} />
          </label>
          <div className="form-field">
            <label htmlFor="post-image">Image</label>
            <input
              accept="image/*"
              disabled={isUploading}
              id="post-image"
              name="file"
              onChange={(event) =>
                setSelectedImageName(event.currentTarget.files?.[0]?.name ?? '')
              }
              required
              type="file"
            />
            {selectedImageName && (
              <p className="selected-image" role="status">
                Selected: {selectedImageName}
              </p>
            )}
          </div>
          <p className="upload-note" id="upload-note">
            Your image and post details will be shared with the community.
          </p>
          {uploadError && (
            <p className="upload-feedback upload-error" role="alert">
              {uploadError}
            </p>
          )}
          <div className="upload-actions">
            <button
              className="cancel-upload"
              onClick={() => uploadDialogRef.current?.close()}
              disabled={isUploading}
              type="button"
            >
              Cancel
            </button>
            <button
              aria-describedby="upload-note"
              className="submit-upload"
              disabled={isUploading}
              type="submit"
            >
              {isUploading ? 'Uploading…' : 'Share post'}
            </button>
          </div>
        </form>
      </dialog>

      <footer className="site-footer">
        <span>Made for things worth keeping.</span>
        <span>SimplyCMS</span>
      </footer>

      {showJumpToTop && (
        <button
          className="jump-to-top"
          type="button"
          aria-label="Jump to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      )}
    </main>
  )
}

export default App
