const REMEMBER_TOKEN_KEY = 'remember_token'
const SESSION_TOKEN_KEY = 'session_token'
const REMEMBER_USER_KEY = 'remember_user'
const SESSION_USER_KEY = 'session_user'

let sessionToken: string | null = null

export type LoginCredentials = {
  identifier: string
  password: string
  rememberMe: boolean
}

function getLoginUrl() {
  return import.meta.env.DEV ? '/api/login' : 'https://api.simplycms.my.id/login'
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getToken(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) {
    return null
  }

  const response = data as Record<string, unknown>
  const token = response.remember_token ?? response.token ?? response.access_token

  return typeof token === 'string' && token.trim() ? token : null
}

export async function login(credentials: LoginCredentials): Promise<string> {
  const response = await fetch(getLoginUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      isEmail(credentials.identifier)
        ? { email: credentials.identifier, password: credentials.password }
        : { username: credentials.identifier, password: credentials.password },
    ),
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 422) {
      throw new Error('The username or password is incorrect.')
    }

    throw new Error(`The login request failed (${response.status}).`)
  }

  const token = getToken(await response.json())

  if (!token) {
    throw new Error('The login API returned an unexpected response.')
  }

  sessionToken = token

  if (credentials.rememberMe) {
    localStorage.setItem(REMEMBER_TOKEN_KEY, token)
    localStorage.setItem(REMEMBER_USER_KEY, credentials.identifier)
    sessionStorage.removeItem(SESSION_TOKEN_KEY)
    sessionStorage.removeItem(SESSION_USER_KEY)
  } else {
    localStorage.removeItem(REMEMBER_TOKEN_KEY)
    localStorage.removeItem(REMEMBER_USER_KEY)
    sessionStorage.setItem(SESSION_TOKEN_KEY, token)
    sessionStorage.setItem(SESSION_USER_KEY, credentials.identifier)
  }

  return token
}

export function getStoredToken() {
  return (
    localStorage.getItem(REMEMBER_TOKEN_KEY) ??
    sessionStorage.getItem(SESSION_TOKEN_KEY) ??
    sessionToken
  )
}

export function getStoredUser() {
  return (
    localStorage.getItem(REMEMBER_USER_KEY) ??
    sessionStorage.getItem(SESSION_USER_KEY)
  )
}
