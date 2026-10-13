import { useEffect, useState } from 'react'
import './App.css'
import { sanitizeSupabaseErrorText, supabase } from './lib/supabase.js'

const artworks = [
  {
    number: '01',
    title: 'After the last train',
    type: 'Character study',
    theme: 'train',
    description: 'Illustration placeholder: a quiet moment beneath city lights.',
  },
  {
    number: '02',
    title: 'Letters to the moon',
    type: 'World building',
    theme: 'moon',
    description: 'Illustration placeholder: a dreamlike garden in moonlight.',
  },
  {
    number: '03',
    title: 'A little more stardust',
    type: 'Original character',
    theme: 'stardust',
    description: 'Illustration placeholder: an original character among the stars.',
  },
]

function Sparkle({ className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 1.8c1.35 5.2 3 7.05 8.2 8.2-5.2 1.35-6.85 3-8.2 8.2-1.35-5.2-3-6.85-8.2-8.2 5.2-1.15 6.85-3 8.2-8.2Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path
        d="M4.167 10h11.666M10 4.167 15.833 10 10 15.833"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}

function Artwork({ artwork }) {
  return (
    <article className="artwork-card">
      <div
        aria-label={artwork.description}
        className={`artwork artwork--${artwork.theme}`}
        role="img"
      >
        <span className="artwork-label">ORIGINAL ART · STUDY {artwork.number}</span>
        <span aria-hidden="true" className="artwork-moon" />
        <span aria-hidden="true" className="artwork-orbit" />
        <span aria-hidden="true" className="artwork-character">
          <span className="character-hair" />
          <span className="character-face" />
          <span className="character-body" />
        </span>
        <Sparkle className="artwork-sparkle artwork-sparkle--one" />
        <Sparkle className="artwork-sparkle artwork-sparkle--two" />
        <span className="artwork-caption">{artwork.type}</span>
      </div>
      <div className="artwork-info">
        <h3>{artwork.title}</h3>
        <span>0{artwork.number}</span>
      </div>
    </article>
  )
}

function getAuthErrorMessage(error, password = '') {
  const message = sanitizeSupabaseErrorText(
    error instanceof Error ? error.message : error?.message || '',
    [password],
  ).trim()
  const code = sanitizeSupabaseErrorText(error?.code || '', [password]).trim()
  const status = Number.isInteger(error?.status) ? error.status : null
  const normalizedMessage = message.toLowerCase()
  const normalizedCode = code.toLowerCase()
  const weakPasswordReasonMessages = {
    length: 'Use at least 8 characters.',
    characters: 'Include a lowercase letter, an uppercase letter, a number, and a symbol.',
    pwned: 'This password appears in a known data breach. Choose a different password, even if it meets the character rules.',
  }
  const weakPasswordReasons = Array.isArray(error?.reasons)
    ? error.reasons
        .filter((reason) => Object.hasOwn(weakPasswordReasonMessages, reason))
        .map((reason) => weakPasswordReasonMessages[reason])
    : []
  let guidance = ''

  if (normalizedMessage.includes('invalid login credentials') || normalizedCode === 'invalid_credentials') {
    guidance = 'Check your email and password and try again.'
  } else if (normalizedMessage.includes('already registered') || normalizedMessage.includes('already been registered') || normalizedCode === 'user_already_exists') {
    guidance = 'An account may already exist for this email. Try logging in.'
  } else if (normalizedMessage.includes('email not confirmed') || normalizedCode === 'email_not_confirmed') {
    guidance = 'Confirm your email using the link we sent before logging in.'
  } else if (normalizedCode === 'weak_password' || (normalizedMessage.includes('password') && (normalizedMessage.includes('weak') || normalizedMessage.includes('at least')))) {
    guidance = weakPasswordReasons.length
      ? weakPasswordReasons.join(' ')
      : 'Choose a password that meets the project password requirements.'
  } else if (normalizedCode === 'signup_disabled' || (normalizedMessage.includes('signup') && (normalizedMessage.includes('disabled') || normalizedMessage.includes('not allowed')))) {
    guidance = 'Email signup is disabled for this Supabase project.'
  } else if (normalizedMessage.includes('rate limit') || normalizedMessage.includes('too many requests')) {
    guidance = 'There have been too many attempts. Please wait a little and try again.'
  }

  const details = message || 'Supabase returned an authentication error without a message.'
  const description = guidance ? `${guidance} Details: ${details}` : details
  const errorCode = code ? `Code: ${code}` : status ? `HTTP ${status}` : ''

  return [description, errorCode].filter(Boolean).join(' ')
}

function isSignupPasswordValid(password) {
  const passwordCharacters = Array.from(password)

  return (
    passwordCharacters.length >= 8
    && /\p{Ll}/u.test(password)
    && /\p{Lu}/u.test(password)
    && /\p{N}/u.test(password)
    && /[\p{P}\p{S}]/u.test(password)
  )
}

function AuthDialog({ onClose, onAuthenticated }) {
  const [mode, setMode] = useState('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const formData = new FormData(event.currentTarget)
    const submittedEmail = String(formData.get('email') ?? '')
    const normalizedEmail = submittedEmail.trim()
    const submittedPassword = String(formData.get('password') ?? '')
    const emailInput = event.currentTarget.elements.namedItem('email')
    setEmail(submittedEmail)
    setPassword(submittedPassword)

    if (!(emailInput instanceof HTMLInputElement) || !emailInput.validity.valid) {
      setErrorMessage('Enter a valid email address to continue.')
      return
    }
    if (mode === 'signup') {
      if (!isSignupPasswordValid(submittedPassword)) {
        setErrorMessage('Use at least 8 characters, including a lowercase letter, an uppercase letter, a number, and a symbol.')
        return
      }
    } else if (submittedPassword.length < 6) {
      setErrorMessage('Your password must be at least 6 characters long.')
      return
    }
    if (!supabase) {
      setErrorMessage('Supabase is not configured. Add the project URL and publishable key to .env.local, then restart the app.')
      return
    }

    setLoading(true)
    try {
      const { data, error } =
        mode === 'signup'
          ? await supabase.auth.signUp({
              email: normalizedEmail,
              password: submittedPassword,
              options: { emailRedirectTo: window.location.origin },
            })
          : await supabase.auth.signInWithPassword({ email: normalizedEmail, password: submittedPassword })

      if (error) {
        setErrorMessage(getAuthErrorMessage(error, submittedPassword))
      } else if (mode === 'signup' && !data.session) {
        setSuccessMessage('If this is a new account, check your inbox for a confirmation link. If you already have an account, log in instead.')
      } else {
        onAuthenticated()
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, submittedPassword))
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && !loading) onClose()
  }

  return (
    <div className="auth-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onClose()
    }}>
      <section
        aria-labelledby="auth-title"
        aria-modal="true"
        className="auth-dialog"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <button
          aria-label="Close sign in dialog"
          className="auth-close"
          disabled={loading}
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <span className="section-kicker">A little corner of the cosmos</span>
        <h2 id="auth-title">{mode === 'signup' ? 'Find your orbit.' : 'Welcome back.'}</h2>
        <p className="auth-intro">
          {mode === 'signup'
            ? 'Create your Astra Anime Club account and meet your people among the stars.'
            : 'Sign in to return to your Astra Anime Club account.'}
        </p>
        <form className="auth-form" noValidate onSubmit={handleSubmit}>
          <label htmlFor="auth-email">Email address</label>
          <input
            autoComplete="email"
            autoFocus
            id="auth-email"
            name="email"
            onChange={(event) => {
              setEmail(event.target.value)
              setErrorMessage('')
              setSuccessMessage('')
            }}
            required
            type="email"
            value={email}
          />
          <label htmlFor="auth-password">Password</label>
          <input
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            id="auth-password"
            minLength={mode === 'signup' ? 8 : 6}
            name="password"
            onChange={(event) => {
              setPassword(event.target.value)
              setErrorMessage('')
              setSuccessMessage('')
            }}
            required
            type="password"
            value={password}
          />
          {errorMessage && <p className="auth-message auth-message--error" role="alert">{errorMessage}</p>}
          {successMessage && <p className="auth-message auth-message--success" role="status">{successMessage}</p>}
          <button className="button button--primary auth-submit" disabled={loading} type="submit">
            {loading ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Log in'}
            {!loading && <ArrowIcon />}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'signup' ? 'Already have an account?' : 'New to the club?'}{' '}
          <button
            disabled={loading}
            onClick={() => {
              setMode(mode === 'signup' ? 'login' : 'signup')
              setErrorMessage('')
              setSuccessMessage('')
            }}
            type="button"
          >
            {mode === 'signup' ? 'Log in' : 'Create an account'}
          </button>
        </p>
        <p className="auth-footnote">Your account is secured by Supabase. We never ask for payment details.</p>
      </section>
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [authOpen, setAuthOpen] = useState(false)
  const [signOutLoading, setSignOutLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!supabase) return undefined

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    if (!supabase) return
    setSignOutLoading(true)
    setAuthError('')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setAuthError(getAuthErrorMessage(error))
        setAuthOpen(true)
      }
    } catch (error) {
      setAuthError(error instanceof Error ? getAuthErrorMessage(error) : 'We could not connect. Please try logging out again.')
      setAuthOpen(true)
    } finally {
      setSignOutLoading(false)
    }
  }

  return (
    <main>
      <header className="site-header">
        <a aria-label="Astra Anime Club home" className="wordmark" href="#home">
          <span aria-hidden="true" className="wordmark-mark">
            <Sparkle />
          </span>
          <span>
            <strong>ASTRA</strong>
            <small>ANIME CLUB</small>
          </span>
        </a>
        <nav aria-label="Main navigation" className="site-nav">
          <a href="#gallery">The gallery</a>
          <button className="site-nav-action" onClick={() => setAuthOpen(true)} type="button">
            The club
          </button>
        </nav>
        {session ? (
          <div className="header-account">
            <span className="account-email">{session.user.email}</span>
            <button className="header-join header-join--logout" disabled={signOutLoading} onClick={handleSignOut} type="button">
              {signOutLoading ? 'Signing out…' : 'Log out'}
            </button>
          </div>
        ) : (
          <button className="header-join" disabled={authLoading} onClick={() => setAuthOpen(true)} type="button">
            {authLoading ? 'Loading…' : 'Find your orbit'} <ArrowIcon />
          </button>
        )}
      </header>

      <section aria-labelledby="hero-title" className="hero" id="home">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            A little corner of the cosmos
          </div>
          <h1 id="hero-title">
            For the love of
            <br />
            <span>anime &</span> imagination.
          </h1>
          <p className="hero-description">
            A home for curious fans, original characters, and the stories we
            can’t stop thinking about. Come find your people among the stars.
          </p>
          <div className="hero-actions">
            <button className="button button--primary" onClick={() => setAuthOpen(true)} type="button">
              Explore the club <ArrowIcon />
            </button>
            <a className="text-link" href="#gallery">
              Take a little look <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="hero-note">
            <div aria-hidden="true" className="avatar-stack">
              <span>A</span>
              <span>M</span>
              <span>Y</span>
            </div>
            <p>
              <strong>Made for fans, by fans.</strong>
              <span>A welcoming space for every kind of anime heart.</span>
            </p>
          </div>
        </div>

        <div aria-label="Original anime-inspired illustration placeholder" className="hero-art" role="img">
          <div className="hero-art-sky">
            <span aria-hidden="true" className="hero-nebula" />
            <span aria-hidden="true" className="hero-planet" />
            <Sparkle className="hero-star hero-star--one" />
            <Sparkle className="hero-star hero-star--two" />
            <Sparkle className="hero-star hero-star--three" />
            <span aria-hidden="true" className="hero-art-halo" />
            <span aria-hidden="true" className="hero-figure">
              <span className="hero-figure-hair" />
              <span className="hero-figure-face" />
              <span className="hero-figure-neck" />
              <span className="hero-figure-coat" />
            </span>
            <span className="hero-art-note">
              <span>ASTRA ARCHIVE</span>
              <strong>Somewhere between<br />dream & reality.</strong>
            </span>
            <span className="hero-art-index">ART STUDY — 001</span>
          </div>
          <span aria-hidden="true" className="hero-art-glint">
            ✳
          </span>
        </div>
        <span aria-hidden="true" className="hero-watermark">
          ASTRA
        </span>
      </section>

      <section aria-label="Club highlights" className="club-strip" id="club">
        <span>For the daydreamers</span>
        <Sparkle />
        <span>Character lovers</span>
        <Sparkle />
        <span>World builders</span>
        <Sparkle />
        <span>Anime, always</span>
      </section>

      <section aria-labelledby="gallery-title" className="gallery-section" id="gallery">
        <div className="section-heading">
          <div>
            <span className="section-kicker">A peek inside our universe</span>
            <h2 id="gallery-title">
              Little worlds,
              <br className="mobile-break" /> <span>big feelings.</span>
            </h2>
          </div>
          <p>
            Original art, character concepts, and scenes from stories still
            being imagined. This is just the beginning.
          </p>
        </div>
        <div className="artwork-grid">
          {artworks.map((artwork) => (
            <Artwork artwork={artwork} key={artwork.number} />
          ))}
        </div>
      </section>

      <section aria-labelledby="membership-title" className="membership-section" id="membership">
        <div className="membership-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="membership-copy">
          <span className="section-kicker">Your seat among the stars</span>
          <h2 id="membership-title">
            Your next favorite
            <br />
            <span>place on the internet.</span>
          </h2>
          <p>
            A soft landing for your biggest fandom feelings. Make things,
            meet fellow fans, and find a little inspiration in your inbox.
          </p>
          <button className="button button--light" onClick={() => setAuthOpen(true)} type="button">
            {session ? 'You’re in the club' : 'Join the club'} <ArrowIcon />
          </button>
          <span className="membership-footnote">
            {session ? `Signed in as ${session.user.email}` : 'Create a free account to join the club.'}
          </span>
        </div>
        <div className="membership-card">
          <div className="membership-card-top">
            <span className="membership-card-icon">
              <Sparkle />
            </span>
            <span className="preview-tag">CLUB PREVIEW</span>
          </div>
          <span className="membership-plan">THE INNER ORBIT</span>
          <p className="membership-card-title">
            More wonder.
            <br />
            More together.
          </p>
          <ul>
            <li><span>✳</span> A welcoming fan community</li>
            <li><span>✳</span> Original art & character spotlights</li>
            <li><span>✳</span> Monthly creative prompts</li>
            <li><span>✳</span> Room for your next big idea</li>
          </ul>
          <span className="membership-card-bottom">
            GOOD THINGS ARE BETTER SHARED <Sparkle />
          </span>
        </div>
      </section>

      <footer className="site-footer">
        <a aria-label="Astra Anime Club home" className="wordmark wordmark--footer" href="#home">
          <span aria-hidden="true" className="wordmark-mark">
            <Sparkle />
          </span>
          <span>
            <strong>ASTRA</strong>
            <small>ANIME CLUB</small>
          </span>
        </a>
        <span>Made with a little stardust & a lot of heart.</span>
        <a href="#home">Back to the top ↑</a>
      </footer>
      {authOpen && (
        <AuthDialog
          onAuthenticated={() => {
            setAuthOpen(false)
            setAuthError('')
          }}
          onClose={() => {
            setAuthOpen(false)
            setAuthError('')
          }}
        />
      )}
      {authError && (
        <p className="auth-toast" role="alert">
          {authError}
          <button aria-label="Dismiss message" onClick={() => setAuthError('')} type="button">×</button>
        </p>
      )}
    </main>
  )
}

export default App
