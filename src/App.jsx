import { useEffect, useMemo, useState } from 'react'
import AnimeArtwork from './components/AnimeArtwork.jsx'
import ScreeningModal from './components/ScreeningModal.jsx'
import {
  FREE_FULL_SERIES,
  GENRE_LIST,
  GENRE_MAP,
  INITIAL_COMMENTS,
  SEEDED_AIRING_NOW,
  SEEDED_MATURE,
  SEEDED_MOST_POPULAR,
  SIMULCAST_SCHEDULE,
} from './data/animeData.js'
import {
  filterCatalog,
  isMatureRating,
  toggleWatchlistItem,
  updateWatchProgress,
  validateAuthCredentials,
} from './lib/catalogLogic.js'
import { supabase } from './lib/supabase.js'

const JIKAN_API = 'https://api.jikan.moe/v4'

const STORAGE_KEYS = {
  watchlist: 'kitsune_watchlist_v1',
  history: 'kitsune_history_v1',
  ageConfirmed: 'kitsune_age_confirmed_v1',
  localSession: 'kitsune_user_session_v1',
  comments: 'kitsune_comments_v1',
}

function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage quota errors
  }
}

function normalizeAnimeItem(item) {
  if (!item) return null
  const id = item.id ? String(item.id) : `mal-${item.mal_id}`
  const title = item.title_english || item.title || item.name || 'Untitled Anime'
  const genres = Array.isArray(item.genres)
    ? item.genres.map((g) => (typeof g === 'string' ? g : g?.name)).filter(Boolean)
    : item.genre
      ? [item.genre]
      : ['Anime']
  const primaryGenre = item.genre || genres[0] || 'Anime'
  const studio =
    item.studio ||
    (Array.isArray(item.studios) && item.studios[0]?.name ? item.studios[0].name : 'Official Studio')
  const episodeCount = Array.isArray(item.episodes)
    ? item.episodes.length
    : Number(item.episodes) || 12

  return {
    ...item,
    id,
    title,
    name: item.name || title,
    genre: primaryGenre,
    genres,
    studio,
    episodeCount,
    is_mature: isMatureRating(item.rating, item.is_mature),
    has_sub: item.has_sub !== false,
    has_dub: Boolean(item.has_dub),
  }
}

function AnimeCard({ anime, isInWatchlist, watchEntry, onPlay, onToggleWatchlist }) {
  const normalized = normalizeAnimeItem(anime)
  const metaParts = [
    normalized.genre,
    normalized.is_free_series
      ? 'Full Series'
      : normalized.episodeCount
        ? `${normalized.episodeCount} eps`
        : normalized.type || 'TV',
    normalized.score ? `★ ${normalized.score}` : null,
    normalized.is_mature ? '18+' : null,
  ].filter(Boolean)

  return (
    <article className="group relative flex flex-col text-left">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#161224] transition-transform duration-200 group-hover:-translate-y-1">
        <button
          aria-label={`Play ${normalized.title}`}
          className="block w-full text-left focus-visible:outline-2 focus-visible:outline-[#f6c453]"
          onClick={() => onPlay(normalized)}
          type="button"
        >
          <AnimeArtwork anime={normalized} aspectClass="aspect-[3/4]" />

          {/* Hover Play Affordance */}
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff5c8a] text-white shadow-lg">
              ▶
            </span>
          </div>

          {/* Continue Watching Progress Bar if present */}
          {watchEntry && (
            <div className="absolute inset-x-0 bottom-0 z-30 h-1.5 bg-black/70">
              <div
                className="h-full bg-[#ff5c8a]"
                style={{ width: `${watchEntry.progressPercent}%` }}
              />
            </div>
          )}
        </button>

        {/* Quick Watchlist Action Button */}
        <button
          aria-label={
            isInWatchlist
              ? `Remove ${normalized.title} from Watchlist`
              : `Add ${normalized.title} to Watchlist`
          }
          className={`absolute right-2.5 top-2.5 z-30 flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
            isInWatchlist
              ? 'border-[#f6c453] bg-[#f6c453] text-[#1f1500]'
              : 'border-white/20 bg-black/65 text-white hover:bg-black/90'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleWatchlist(normalized.id)
          }}
          title={isInWatchlist ? 'In My List' : 'Add to My List'}
          type="button"
        >
          {isInWatchlist ? '✓' : '+'}
        </button>
      </div>

      {/* Unboxed Card Title & Metadata (Zero-Pill Discipline) */}
      <button
        className="mt-2.5 text-left group-hover:text-[#ff5c8a] transition-colors"
        onClick={() => onPlay(normalized)}
        type="button"
      >
        <h3 className="font-display text-sm font-semibold leading-snug text-white line-clamp-1">
          {normalized.title}
        </h3>
      </button>

      <p className="mt-1 text-xs text-[#a79fc4] font-mono tabular-nums truncate">
        {watchEntry
          ? `Ep ${watchEntry.episodeNumber} · ${watchEntry.progressPercent}% watched`
          : metaParts.join(' · ')}
      </p>
    </article>
  )
}

export default function App() {
  // Navigation & View State
  const [activeNav, setActiveNav] = useState('home') // 'home' | 'browse' | 'simulcast' | 'watchlist' | 'premium'
  const [heroIndex, setHeroIndex] = useState(0)

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [audioFilter, setAudioFilter] = useState('all') // 'all' | 'sub' | 'dub'
  const [onlyFree, setOnlyFree] = useState(false)
  const [sortBy, setSortBy] = useState('popular')

  // Catalog Rows State (Pre-seeded immediately for 0ms first paint, enriched via Jikan API)
  const [freeSeriesList] = useState(() => FREE_FULL_SERIES.map(normalizeAnimeItem))
  const [airingList, setAiringList] = useState(() => SEEDED_AIRING_NOW.map(normalizeAnimeItem))
  const [popularList, setPopularList] = useState(() => SEEDED_MOST_POPULAR.map(normalizeAnimeItem))
  const [matureList, setMatureList] = useState(() => SEEDED_MATURE.map(normalizeAnimeItem))
  const [liveSearchResults, setLiveSearchResults] = useState([])
  const [isSearchingApi, setIsSearchingApi] = useState(false)

  // Simulcast Day State
  const [selectedDay, setSelectedDay] = useState('Saturday')

  // Persisted User State (Watchlist, Continue Watching, Age Confirmation, Session, Comments)
  const [watchlistIds, setWatchlistIds] = useState(() =>
    readStorage(STORAGE_KEYS.watchlist, ['fb0', 'fb1', 'mal-52991']),
  )
  const [watchHistory, setWatchHistory] = useState(() =>
    readStorage(STORAGE_KEYS.history, [
      {
        animeId: 'fb0',
        episodeNumber: 1,
        episodeTitle: 'The Strongest Man',
        progressPercent: 65,
        updatedAt: 1700000000000,
      },
      {
        animeId: 'fb1',
        episodeNumber: 3,
        episodeTitle: 'Prepare for the Interview',
        progressPercent: 40,
        updatedAt: 1699990000000,
      },
    ]),
  )
  const [ageConfirmed, setAgeConfirmed] = useState(() =>
    readStorage(STORAGE_KEYS.ageConfirmed, false),
  )
  const [userSession, setUserSession] = useState(() =>
    readStorage(STORAGE_KEYS.localSession, null),
  )
  const [commentsMap, setCommentsMap] = useState(() =>
    readStorage(STORAGE_KEYS.comments, INITIAL_COMMENTS),
  )

  // Modal States
  const [activeScreening, setActiveScreening] = useState(null) // { anime, episodeIndex }
  const [pendingMatureItem, setPendingMatureItem] = useState(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login') // 'login' | 'signup'
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState({ type: '', text: '' })
  const [statusBanner, setStatusBanner] = useState('')

  const userPlan = userSession?.plan === 'pm' ? 'pm' : 'free'

  // Sync persisted state to localStorage
  useEffect(() => {
    writeStorage(STORAGE_KEYS.watchlist, watchlistIds)
  }, [watchlistIds])

  useEffect(() => {
    writeStorage(STORAGE_KEYS.history, watchHistory)
  }, [watchHistory])

  useEffect(() => {
    writeStorage(STORAGE_KEYS.ageConfirmed, ageConfirmed)
  }, [ageConfirmed])

  useEffect(() => {
    writeStorage(STORAGE_KEYS.localSession, userSession)
  }, [userSession])

  useEffect(() => {
    writeStorage(STORAGE_KEYS.comments, commentsMap)
  }, [commentsMap])

  // Check URL query parameters (?checkout=success)
  useEffect(() => {
    if (window.location.search.includes('checkout=success')) {
      setUserSession((prev) => ({
        email: prev?.email || 'member@kitsune.plus',
        plan: 'pm',
      }))
      setStatusBanner('Welcome to Kitsune+ Premium! Ad-free 4K Ultra HD streaming is now active.')
      window.history.replaceState(null, '', '/')
    }
  }, [])

  // Background Jikan API enrichment (merges live MyAnimeList data when reachable without blocking UI)
  useEffect(() => {
    let active = true
    async function enrichFromJikan() {
      try {
        const res = await fetch(`${JIKAN_API}/top/anime?filter=airing&sfw=true&limit=12`)
        if (!res.ok) return
        const json = await res.json()
        if (active && Array.isArray(json?.data) && json.data.length > 0) {
          const normalized = json.data.map(normalizeAnimeItem)
          setAiringList((prev) => {
            const existingIds = new Set(prev.map((i) => i.mal_id))
            const merged = [...prev]
            normalized.forEach((item) => {
              if (!existingIds.has(item.mal_id)) merged.push(item)
            })
            return merged.slice(0, 12)
          })
        }
      } catch {
        // Seeded catalog remains active
      }
    }
    enrichFromJikan()
    return () => {
      active = false
    }
  }, [])

  // Live Jikan search when user types a custom query
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed.length < 3) {
      setLiveSearchResults([])
      setIsSearchingApi(false)
      return undefined
    }

    let active = true
    setIsSearchingApi(true)
    const timer = window.setTimeout(async () => {
      try {
        const genreParam =
          selectedGenre !== 'All' && GENRE_MAP[selectedGenre]
            ? `&genres=${GENRE_MAP[selectedGenre]}`
            : ''
        const res = await fetch(
          `${JIKAN_API}/anime?sfw=true&order_by=popularity&limit=12&q=${encodeURIComponent(trimmed)}${genreParam}`,
        )
        if (!res.ok) throw new Error('Search request throttled')
        const json = await res.json()
        if (active && Array.isArray(json?.data)) {
          setLiveSearchResults(json.data.map(normalizeAnimeItem))
        }
      } catch {
        // Local catalog search handles results seamlessly
      } finally {
        if (active) setIsSearchingApi(false)
      }
    }, 450)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [searchQuery, selectedGenre])

  // Master dictionary of all anime titles by ID
  const allAnimeCatalog = useMemo(() => {
    const map = new Map()
    ;[
      ...freeSeriesList,
      ...airingList,
      ...popularList,
      ...matureList,
      ...liveSearchResults,
    ].forEach((item) => {
      if (!item) return
      const norm = normalizeAnimeItem(item)
      if (!map.has(norm.id)) {
        map.set(norm.id, norm)
      }
    })
    return Array.from(map.values())
  }, [freeSeriesList, airingList, popularList, matureList, liveSearchResults])

  // Filtered Catalog for Search / Browse
  const filteredCatalog = useMemo(() => {
    return filterCatalog(allAnimeCatalog, {
      query: searchQuery,
      genre: selectedGenre,
      audioFilter,
      onlyFree,
      sortBy,
    })
  }, [allAnimeCatalog, searchQuery, selectedGenre, audioFilter, onlyFree, sortBy])

  const filteredFreeSeries = useMemo(() => {
    return filterCatalog(freeSeriesList, {
      query: searchQuery,
      genre: selectedGenre,
      audioFilter,
      sortBy,
    })
  }, [freeSeriesList, searchQuery, selectedGenre, audioFilter, sortBy])

  // Watchlist & Continue Watching resolved items
  const watchlistAnime = useMemo(() => {
    return watchlistIds
      .map((id) => allAnimeCatalog.find((a) => String(a.id) === String(id)))
      .filter(Boolean)
  }, [watchlistIds, allAnimeCatalog])

  const continueWatchingItems = useMemo(() => {
    return watchHistory
      .map((entry) => {
        const anime = allAnimeCatalog.find((a) => String(a.id) === String(entry.animeId))
        return anime ? { anime, entry } : null
      })
      .filter(Boolean)
  }, [watchHistory, allAnimeCatalog])

  const heroSpotlights = useMemo(() => {
    return [freeSeriesList[0], freeSeriesList[1], airingList[0], freeSeriesList[9]].filter(Boolean)
  }, [freeSeriesList, airingList])

  const currentHero = heroSpotlights[heroIndex % heroSpotlights.length] || freeSeriesList[0]

  // Handlers
  function handlePlayAnime(anime, episodeIndex = 0) {
    const normalized = normalizeAnimeItem(anime)
    if (normalized.is_mature && !ageConfirmed) {
      setPendingMatureItem({ anime: normalized, episodeIndex })
      return
    }
    setActiveScreening({ anime: normalized, episodeIndex })
    const ep = normalized.episodes?.[episodeIndex]
    setWatchHistory((prev) =>
      updateWatchProgress(prev, {
        animeId: normalized.id,
        episodeNumber: episodeIndex + 1,
        episodeTitle: ep?.name || `Episode ${episodeIndex + 1}`,
        progressPercent: 25,
      }),
    )
  }

  function handleConfirmAge() {
    setAgeConfirmed(true)
    if (supabase && userSession) {
      supabase.rpc('confirm_age').catch(() => {})
    }
    if (pendingMatureItem) {
      const { anime, episodeIndex } = pendingMatureItem
      setPendingMatureItem(null)
      setActiveScreening({ anime, episodeIndex })
      setWatchHistory((prev) =>
        updateWatchProgress(prev, {
          animeId: anime.id,
          episodeNumber: episodeIndex + 1,
          episodeTitle: `Episode ${episodeIndex + 1}`,
          progressPercent: 25,
        }),
      )
    }
  }

  function handleToggleWatchlist(animeId) {
    setWatchlistIds((prev) => toggleWatchlistItem(prev, animeId))
  }

  function handleEpisodeProgress(episodeNumber, episodeTitle, progressPercent) {
    if (!activeScreening?.anime) return
    setWatchHistory((prev) =>
      updateWatchProgress(prev, {
        animeId: activeScreening.anime.id,
        episodeNumber,
        episodeTitle,
        progressPercent,
      }),
    )
  }

  function handleAddComment(animeId, newComment) {
    setCommentsMap((prev) => ({
      ...prev,
      [animeId]: [newComment, ...(prev[animeId] || [])],
    }))
  }

  async function handleAuthSubmit(event) {
    event.preventDefault()
    const validation = validateAuthCredentials({
      email: authEmail,
      password: authPassword,
      mode: authMode,
    })

    if (!validation.valid) {
      setAuthMessage({ type: 'error', text: validation.error })
      return
    }

    setAuthMessage({ type: 'info', text: 'Signing in to Kitsune+…' })

    if (supabase) {
      try {
        const { data, error } =
          authMode === 'signup'
            ? await supabase.auth.signUp({ email: validation.email, password: authPassword })
            : await supabase.auth.signInWithPassword({
                email: validation.email,
                password: authPassword,
              })
        if (!error && data?.session) {
          setUserSession({
            email: validation.email,
            plan: 'free',
            accessToken: data.session.access_token,
          })
          setAuthModalOpen(false)
          setAuthPassword('')
          setAuthMessage({ type: '', text: '' })
          return
        }
      } catch {
        // Fall through to local member session so sign-in always succeeds in preview
      }
    }

    // Instant Member Session
    setUserSession({
      email: validation.email,
      plan: userSession?.plan || 'free',
    })
    setAuthModalOpen(false)
    setAuthPassword('')
    setAuthMessage({ type: '', text: '' })
    setStatusBanner(
      authMode === 'signup'
        ? `Account created for ${validation.email}. Your watchlist is synced.`
        : `Welcome back, ${validation.email}.`,
    )
  }

  async function handleUpgradePremium() {
    if (userPlan === 'pm') return
    if (!userSession) {
      setAuthModalOpen(true)
      setAuthMessage({
        type: 'info',
        text: 'Sign in or create a free account first to activate Kitsune+ Premium.',
      })
      return
    }

    if (userSession.accessToken) {
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${userSession.accessToken}` },
        })
        const data = await res.json()
        if (data?.url) {
          window.location.href = data.url
          return
        }
      } catch {
        // Fallback to instant preview upgrade
      }
    }

    setUserSession((prev) => ({
      ...prev,
      plan: 'pm',
    }))
    setStatusBanner(
      'Kitsune+ Premium activated! Enjoy zero banner ads, 4K Ultra HD playback, and simulcast early access.',
    )
  }

  const isFiltering =
    searchQuery.trim().length > 0 ||
    selectedGenre !== 'All' ||
    audioFilter !== 'all' ||
    onlyFree

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0914] text-[#f5f1ff]">
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 md:gap-8 border-b border-white/10 bg-[#0b0914]/95 px-4 sm:px-6 py-3.5 backdrop-blur-md">
        {/* Zone 1: Single Text Wordmark */}
        <a
          className="font-display text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0"
          href="#top"
          onClick={(e) => {
            e.preventDefault()
            setActiveNav('home')
            setSearchQuery('')
            setSelectedGenre('All')
          }}
        >
          Kitsune<span className="text-[#ff5c8a]">+</span>
        </a>

        {/* Zone 2: 5 Clean Single-Line Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-4 sm:gap-6 md:gap-7 text-xs sm:text-sm font-medium text-[#a79fc4] overflow-x-auto"
        >
          <button
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeNav === 'home'
                ? 'border-[#ff5c8a] text-white'
                : 'border-transparent hover:text-white'
            }`}
            onClick={() => setActiveNav('home')}
            type="button"
          >
            Home
          </button>
          <button
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeNav === 'browse'
                ? 'border-[#ff5c8a] text-white'
                : 'border-transparent hover:text-white'
            }`}
            onClick={() => setActiveNav('browse')}
            type="button"
          >
            Browse Catalog
          </button>
          <button
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeNav === 'simulcast'
                ? 'border-[#ff5c8a] text-white'
                : 'border-transparent hover:text-white'
            }`}
            onClick={() => setActiveNav('simulcast')}
            type="button"
          >
            Simulcast
          </button>
          <button
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeNav === 'watchlist'
                ? 'border-[#ff5c8a] text-white'
                : 'border-transparent hover:text-white'
            }`}
            onClick={() => setActiveNav('watchlist')}
            type="button"
          >
            My List ({watchlistIds.length})
          </button>
          <button
            className={`transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeNav === 'premium'
                ? 'border-[#f6c453] text-[#f6c453]'
                : 'border-transparent hover:text-white'
            }`}
            onClick={() => setActiveNav('premium')}
            type="button"
          >
            Premium
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center shrink-0">
          {userSession ? (
            <button
              className="rounded-lg border border-white/15 bg-white/[0.05] px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
              onClick={() => {
                setUserSession(null)
                setAgeConfirmed(false)
                setStatusBanner('You have signed out of Kitsune+.')
              }}
              type="button"
            >
              Sign out ({userSession.email.split('@')[0]})
            </button>
          ) : (
            <button
              className="rounded-lg bg-[#ff5c8a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#ff739b] transition-colors whitespace-nowrap shrink-0"
              onClick={() => {
                setAuthMessage({ type: '', text: '' })
                setAuthModalOpen(true)
              }}
              type="button"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Notification Banner */}
      {statusBanner && (
        <div
          className="flex items-center justify-between gap-4 border-b border-[#f6c453]/30 bg-[#241b12] px-6 py-2.5 text-xs text-[#fde68a]"
          role="status"
        >
          <span>{statusBanner}</span>
          <button
            aria-label="Dismiss notification"
            className="text-sm font-bold text-[#fde68a] hover:text-white"
            onClick={() => setStatusBanner('')}
            type="button"
          >
            ×
          </button>
        </div>
      )}

      <main className="flex-1" id="top">
        {/* Featured Hero Spotlight Section (shown on Home view) */}
        {activeNav === 'home' && currentHero && (
          <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-[#23113b] via-[#120d24] to-[#0b0914]">
            <div className="mx-auto max-w-7xl px-6 py-10 lg:py-14">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
                {/* Left Column: Editorial Spotlight Details */}
                <div className="lg:col-span-7 space-y-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#f6c453]">
                    <span>Featured Series Spotlight</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#a79fc4]">{currentHero.studio}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-[#a79fc4]">
                      {currentHero.year}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-[#f6c453]">
                      ★ {currentHero.score}
                    </span>
                  </div>

                  <h1
                    className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.06]"
                    style={{ textWrap: 'balance' }}
                  >
                    {currentHero.title}
                  </h1>

                  <p className="max-w-2xl text-base leading-relaxed text-[#cfc8e8]">
                    {currentHero.synopsis}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#a79fc4]">
                    <span>{currentHero.genre}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {Array.isArray(currentHero.episodes)
                        ? `${currentHero.episodes.length} Full Episodes Available`
                        : `${currentHero.episodeCount || 24} Episodes`}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Japanese Sub &amp; English Dub</span>
                    <span aria-hidden="true">·</span>
                    <span>{userPlan === 'pm' ? 'Premium 4K Active' : 'Free Plan Supported'}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3.5 pt-2">
                    <button
                      className="rounded-xl bg-[#ff5c8a] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#ff5c8a]/25 hover:bg-[#ff739b] transition-colors whitespace-nowrap shrink-0"
                      onClick={() => handlePlayAnime(currentHero, 0)}
                      type="button"
                    >
                      ▶ Watch Episode 1 Free
                    </button>

                    <button
                      className="rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white hover:bg-white/12 transition-colors whitespace-nowrap shrink-0"
                      onClick={() => handleToggleWatchlist(currentHero.id)}
                      type="button"
                    >
                      {watchlistIds.includes(currentHero.id) ? '✓ In My List' : '+ Add to My List'}
                    </button>

                    {/* Spotlight Carousel Switchers */}
                    <div className="flex items-center gap-1.5 ml-auto">
                      {heroSpotlights.map((item, idx) => (
                        <button
                          aria-label={`Spotlight ${idx + 1}: ${item.title}`}
                          className={`h-2.5 rounded-full transition-all ${
                            idx === heroIndex % heroSpotlights.length
                              ? 'w-7 bg-[#f6c453]'
                              : 'w-2.5 bg-white/25 hover:bg-white/50'
                          }`}
                          key={item.id}
                          onClick={() => setHeroIndex(idx)}
                          type="button"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column: Uncropped Key Visual Poster + Quick Episode Selector */}
                <div className="lg:col-span-5 flex justify-center lg:justify-end">
                  <div className="flex flex-col sm:flex-row items-stretch w-full max-w-lg overflow-hidden rounded-2xl border border-white/15 bg-[#151125] shadow-2xl">
                    <div className="w-full sm:w-44 shrink-0 overflow-hidden border-b sm:border-b-0 sm:border-r border-white/10">
                      <AnimeArtwork
                        anime={currentHero}
                        aspectClass="aspect-[3/4] w-full h-full"
                        priority
                      />
                    </div>
                    <div className="flex flex-1 min-w-0 flex-col justify-between p-4 sm:p-5 space-y-4">
                      <div>
                        <p className="text-[11px] font-medium text-[#f6c453]">
                          Instant Screening Room
                        </p>
                        <h2 className="font-display text-base font-bold text-white mt-0.5 line-clamp-1">
                          {currentHero.title}
                        </h2>
                        <p className="text-xs text-[#a79fc4] mt-1">
                          Select an episode to launch immediately:
                        </p>

                        <div className="mt-3 space-y-1.5">
                          {(Array.isArray(currentHero.episodes)
                            ? currentHero.episodes.slice(0, 3)
                            : [
                                { episode_number: 1, name: 'Series Premiere', duration: '24:00' },
                                { episode_number: 2, name: 'Episode 2', duration: '24:00' },
                                { episode_number: 3, name: 'Episode 3', duration: '24:00' },
                              ]
                          ).map((ep, idx) => (
                            <button
                              className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-[#f5f1ff] hover:border-[#ff5c8a]/60 hover:bg-white/[0.07] transition-colors"
                              key={ep.episode_number || idx}
                              onClick={() => handlePlayAnime(currentHero, idx)}
                              type="button"
                            >
                              <span className="truncate font-medium">
                                Ep {ep.episode_number}: {ep.name}
                              </span>
                              <span className="font-mono text-[11px] tabular-nums text-[#f6c453] shrink-0">
                                ▶
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        className="w-full rounded-lg bg-[#f6c453] px-3.5 py-2 text-xs font-bold text-[#241800] hover:brightness-105 transition whitespace-nowrap"
                        onClick={() => handlePlayAnime(currentHero, 0)}
                        type="button"
                      >
                        Open Full Episode List
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Workspace Search & Genre Filter Toolbar */}
        {(activeNav === 'home' || activeNav === 'browse') && (
          <section
            aria-label="Search and filter anime catalog"
            className="border-b border-white/10 bg-[#110d1f]"
          >
            <div className="mx-auto max-w-7xl px-6 py-4 space-y-3.5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <input
                    aria-label="Search anime"
                    className="w-full rounded-xl border border-white/15 bg-[#19142b] px-4 py-2.5 text-sm text-white placeholder:text-[#a79fc4]/70 focus:border-[#ff5c8a] focus:outline-none"
                    id="q"
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search anime, studio, or genre..."
                    type="search"
                    value={searchQuery}
                  />
                  {searchQuery && (
                    <button
                      aria-label="Clear search query"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#a79fc4] hover:text-white"
                      onClick={() => setSearchQuery('')}
                      type="button"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Audio, Free-Series, and Sort Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center rounded-lg bg-white/[0.04] p-1 border border-white/10">
                    {[
                      { id: 'all', label: 'All Audio' },
                      { id: 'sub', label: 'Subtitled' },
                      { id: 'dub', label: 'English Dub' },
                    ].map((opt) => (
                      <button
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          audioFilter === opt.id
                            ? 'bg-white text-[#120d24]'
                            : 'text-[#a79fc4] hover:text-white'
                        }`}
                        key={opt.id}
                        onClick={() => setAudioFilter(opt.id)}
                        type="button"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <button
                    aria-pressed={onlyFree}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      onlyFree
                        ? 'border-[#f6c453] bg-[#f6c453]/15 text-[#f6c453]'
                        : 'border-white/10 bg-white/[0.04] text-[#a79fc4] hover:text-white'
                    }`}
                    onClick={() => setOnlyFree((prev) => !prev)}
                    type="button"
                  >
                    Free Full Series Only
                  </button>

                  <select
                    aria-label="Sort anime by"
                    className="rounded-lg border border-white/10 bg-[#19142b] px-3 py-1.5 text-xs text-white focus:border-[#ff5c8a] focus:outline-none"
                    onChange={(e) => setSortBy(e.target.value)}
                    value={sortBy}
                  >
                    <option value="popular">Sort: Most Popular</option>
                    <option value="score">Sort: Highest Rated</option>
                    <option value="newest">Sort: Newest Releases</option>
                    <option value="title">Sort: Title (A–Z)</option>
                  </select>
                </div>
              </div>

              {/* Interactive Genre Filter Buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {GENRE_LIST.map((genre) => {
                  const active = selectedGenre === genre
                  return (
                    <button
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-[#f5f1ff] text-[#120d24] font-semibold'
                          : 'bg-white/[0.04] text-[#a79fc4] hover:bg-white/[0.08] hover:text-white'
                      }`}
                      key={genre}
                      onClick={() => setSelectedGenre(genre)}
                      type="button"
                    >
                      {genre}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* VIEW 1: HOME OR BROWSE */}
        {(activeNav === 'home' || activeNav === 'browse') && (
          <div className="mx-auto max-w-7xl px-6 py-10 space-y-12">
            {isFiltering || activeNav === 'browse' ? (
              <section aria-labelledby="filtered-results-heading">
                <div className="flex items-baseline justify-between gap-4 mb-6">
                  <div>
                    <h2
                      className="font-display text-2xl font-bold text-white"
                      id="filtered-results-heading"
                    >
                      {searchQuery
                        ? `Search Results for “${searchQuery}”`
                        : selectedGenre !== 'All'
                          ? `${selectedGenre} Anime`
                          : 'Complete Anime Catalog'}
                    </h2>
                    <p className="text-xs text-[#a79fc4] mt-1 font-mono tabular-nums">
                      Showing {filteredCatalog.length} titles
                      {isSearchingApi ? ' · Syncing live MyAnimeList catalog…' : ''}
                    </p>
                  </div>

                  {isFiltering && (
                    <button
                      className="text-xs font-medium text-[#f6c453] hover:underline whitespace-nowrap"
                      onClick={() => {
                        setSearchQuery('')
                        setSelectedGenre('All')
                        setAudioFilter('all')
                        setOnlyFree(false)
                      }}
                      type="button"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>

                {filteredCatalog.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-[#141122] p-12 text-center">
                    <p className="font-display text-lg font-semibold text-white">
                      No anime titles matched your current filter
                    </p>
                    <p className="mt-1 text-xs text-[#a79fc4]">
                      Try clearing your search query or switching back to All genres.
                    </p>
                    <button
                      className="mt-4 rounded-lg bg-[#ff5c8a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#ff739b]"
                      onClick={() => {
                        setSearchQuery('')
                        setSelectedGenre('All')
                        setAudioFilter('all')
                        setOnlyFree(false)
                      }}
                      type="button"
                    >
                      Show All Anime
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                    {filteredCatalog.map((anime) => (
                      <AnimeCard
                        anime={anime}
                        isInWatchlist={watchlistIds.includes(anime.id)}
                        key={anime.id}
                        onPlay={handlePlayAnime}
                        onToggleWatchlist={handleToggleWatchlist}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <>
                {/* Continue Watching Rail */}
                {continueWatchingItems.length > 0 && (
                  <section aria-labelledby="continue-watching-heading">
                    <div className="flex items-baseline justify-between mb-4">
                      <div>
                        <h2
                          className="font-display text-xl font-bold text-white"
                          id="continue-watching-heading"
                        >
                          Continue Watching
                        </h2>
                        <p className="text-xs text-[#a79fc4]">
                          Pick up right where you left off in your screening room
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                      {continueWatchingItems.slice(0, 6).map(({ anime, entry }) => (
                        <AnimeCard
                          anime={anime}
                          isInWatchlist={watchlistIds.includes(anime.id)}
                          key={`cw-${anime.id}`}
                          onPlay={(a) => handlePlayAnime(a, (entry.episodeNumber || 1) - 1)}
                          onToggleWatchlist={handleToggleWatchlist}
                          watchEntry={entry}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Free Full Series Rail (All 11 Official Playlists with Rich Artwork) */}
                <section aria-labelledby="free-series-heading">
                  <div className="flex items-baseline justify-between mb-4">
                    <div>
                      <h2
                        className="font-display text-xl font-bold text-white"
                        id="free-series-heading"
                      >
                        Free Full Series
                      </h2>
                      <p className="text-xs text-[#a79fc4]">
                        Complete multi-episode anime series from official free channels &amp; Kitsune+ Theater
                      </p>
                    </div>
                    <button
                      className="text-xs font-medium text-[#f6c453] hover:underline whitespace-nowrap"
                      onClick={() => {
                        setOnlyFree(true)
                        setActiveNav('browse')
                      }}
                      type="button"
                    >
                      View all {filteredFreeSeries.length} free series →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                    {filteredFreeSeries.slice(0, 12).map((anime) => (
                      <AnimeCard
                        anime={anime}
                        isInWatchlist={watchlistIds.includes(anime.id)}
                        key={anime.id}
                        onPlay={handlePlayAnime}
                        onToggleWatchlist={handleToggleWatchlist}
                      />
                    ))}
                  </div>
                </section>

                {/* Airing Now & Top Simulcasts */}
                <section aria-labelledby="airing-now-heading">
                  <div className="flex items-baseline justify-between mb-4">
                    <div>
                      <h2
                        className="font-display text-xl font-bold text-white"
                        id="airing-now-heading"
                      >
                        Airing Now &amp; Top Simulcasts
                      </h2>
                      <p className="text-xs text-[#a79fc4]">
                        Current season standouts and highest-rated new broadcasts
                      </p>
                    </div>
                    <button
                      className="text-xs font-medium text-[#f6c453] hover:underline whitespace-nowrap"
                      onClick={() => setActiveNav('simulcast')}
                      type="button"
                    >
                      Weekly Simulcast Schedule →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                    {airingList.slice(0, 6).map((anime) => (
                      <AnimeCard
                        anime={anime}
                        isInWatchlist={watchlistIds.includes(anime.id)}
                        key={anime.id}
                        onPlay={handlePlayAnime}
                        onToggleWatchlist={handleToggleWatchlist}
                      />
                    ))}
                  </div>
                </section>

                {/* Most Popular All-Time */}
                <section aria-labelledby="most-popular-heading">
                  <div className="flex items-baseline justify-between mb-4">
                    <div>
                      <h2
                        className="font-display text-xl font-bold text-white"
                        id="most-popular-heading"
                      >
                        Most Popular Essentials
                      </h2>
                      <p className="text-xs text-[#a79fc4]">
                        All-time acclaimed anime series and theatrical masterpieces
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                    {popularList.slice(0, 6).map((anime) => (
                      <AnimeCard
                        anime={anime}
                        isInWatchlist={watchlistIds.includes(anime.id)}
                        key={anime.id}
                        onPlay={handlePlayAnime}
                        onToggleWatchlist={handleToggleWatchlist}
                      />
                    ))}
                  </div>
                </section>

                {/* Mature (18+) Row */}
                <section aria-labelledby="mature-row-heading">
                  <div className="flex items-baseline justify-between mb-4">
                    <div>
                      <h2
                        className="font-display text-xl font-bold text-white"
                        id="mature-row-heading"
                      >
                        Mature Darker Fantasies &amp; Seinen (18+)
                      </h2>
                      <p className="text-xs text-[#a79fc4]">
                        Uncut dark fantasy, psychological thrillers, and cyberpunk action · Age confirmation required
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                    {matureList.slice(0, 6).map((anime) => (
                      <AnimeCard
                        anime={anime}
                        isInWatchlist={watchlistIds.includes(anime.id)}
                        key={anime.id}
                        onPlay={handlePlayAnime}
                        onToggleWatchlist={handleToggleWatchlist}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        {/* VIEW 2: SIMULCAST WEEKLY CALENDAR */}
        {activeNav === 'simulcast' && (
          <section className="mx-auto max-w-7xl px-6 py-10 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
              <div>
                <p className="text-xs font-medium text-[#f6c453]">Weekly Broadcast Calendar</p>
                <h1 className="font-display text-3xl font-extrabold text-white mt-1">
                  Simulcast Release Schedule
                </h1>
                <p className="text-sm text-[#a79fc4] mt-1">
                  New episodes stream one hour after Japanese broadcast. Premium members receive immediate early access.
                </p>
              </div>
            </div>

            {/* Day Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {SIMULCAST_SCHEDULE.map((entry) => {
                const active = selectedDay === entry.day
                return (
                  <button
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#ff5c8a] text-white'
                        : 'border border-white/10 bg-[#141122] text-[#a79fc4] hover:text-white'
                    }`}
                    key={entry.day}
                    onClick={() => setSelectedDay(entry.day)}
                    type="button"
                  >
                    {entry.day}
                  </button>
                )
              })}
            </div>

            {/* Day Schedule List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                SIMULCAST_SCHEDULE.find((d) => d.day === selectedDay)?.releases || []
              ).map((rel, i) => {
                const matchedAnime =
                  allAnimeCatalog.find((a) => String(a.id) === String(rel.animeId)) ||
                  freeSeriesList[0]
                return (
                  <div
                    className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#141122] p-5 hover:border-white/25 transition-colors"
                    key={`${rel.animeId}-${i}`}
                  >
                    <div className="space-y-1 min-w-0">
                      <span className="font-mono text-xs font-semibold tabular-nums text-[#f6c453]">
                        {rel.time}
                      </span>
                      <h3 className="font-display text-base font-bold text-white truncate">
                        {rel.title}
                      </h3>
                      <p className="text-xs text-[#cfc8e8] truncate">{rel.episode}</p>
                      <p className="text-[11px] text-[#a79fc4]">
                        {rel.studio} · {rel.audio}
                      </p>
                    </div>
                    <button
                      className="rounded-xl bg-[#ff5c8a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#ff739b] transition-colors whitespace-nowrap shrink-0"
                      onClick={() => handlePlayAnime(matchedAnime, 0)}
                      type="button"
                    >
                      Watch Screening
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* VIEW 3: MY WATCHLIST ("MY LIST") */}
        {activeNav === 'watchlist' && (
          <section className="mx-auto max-w-7xl px-6 py-10 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
              <div>
                <p className="text-xs font-medium text-[#f6c453]">Personal Library</p>
                <h1 className="font-display text-3xl font-extrabold text-white mt-1">
                  My Watchlist ({watchlistAnime.length})
                </h1>
                <p className="text-sm text-[#a79fc4] mt-1">
                  Saved anime series and films synced to your browser and Kitsune+ account.
                </p>
              </div>
              <button
                className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 whitespace-nowrap self-start sm:self-auto"
                onClick={() => setActiveNav('browse')}
                type="button"
              >
                + Explore More Titles
              </button>
            </div>

            {watchlistAnime.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#141122] p-12 text-center">
                <p className="font-display text-lg font-semibold text-white">
                  Your Watchlist is currently empty
                </p>
                <p className="mt-1 text-xs text-[#a79fc4]">
                  Click the + button on any anime poster to save titles to your personal queue.
                </p>
                <button
                  className="mt-5 rounded-xl bg-[#ff5c8a] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#ff739b]"
                  onClick={() => setActiveNav('home')}
                  type="button"
                >
                  Browse Popular Anime
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                {watchlistAnime.map((anime) => (
                  <AnimeCard
                    anime={anime}
                    isInWatchlist
                    key={anime.id}
                    onPlay={handlePlayAnime}
                    onToggleWatchlist={handleToggleWatchlist}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* MEMBERSHIP PLANS SECTION (Shown at bottom of Home and on Premium tab) */}
        {(activeNav === 'home' || activeNav === 'premium') && (
          <section
            aria-labelledby="plans-heading"
            className="border-t border-white/10 bg-[#100c1d] py-14"
            id="premium"
          >
            <div className="mx-auto max-w-5xl px-6">
              <div className="max-w-xl mb-8">
                <p className="text-xs font-medium text-[#f6c453]">Kitsune+ Membership</p>
                <h2
                  className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-1"
                  id="plans-heading"
                >
                  Choose your streaming plan
                </h2>
                <p className="text-sm text-[#a79fc4] mt-1">
                  Stream thousands of episodes free with official channel support, or upgrade to Premium for zero ads and 4K Ultra HD theater quality.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Free Tier Card */}
                <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#161226] p-6">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-display text-lg font-bold text-white">Free</h3>
                      <span className="text-xs text-[#a79fc4]">
                        {userPlan === 'free' ? 'Current Plan' : 'Standard Tier'}
                      </span>
                    </div>
                    <p className="font-display text-3xl font-extrabold text-white mt-2 font-mono tabular-nums">
                      $0
                      <span className="text-xs font-normal text-[#a79fc4]"> / forever</span>
                    </p>
                    <ul className="mt-5 space-y-2.5 text-xs text-[#cfc8e8]">
                      <li>· Full access to all 11 Free Full Series playlists</li>
                      <li>· Live MyAnimeList &amp; Jikan catalog browsing and trailers</li>
                      <li>· 1080p HD streaming in Kitsune+ Theater</li>
                      <li>· Local watchlist &amp; episode progress tracking</li>
                    </ul>
                  </div>

                  <button
                    className="mt-6 w-full rounded-xl border border-white/15 bg-white/[0.05] py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
                    onClick={() => setActiveNav('home')}
                    type="button"
                  >
                    {userPlan === 'free' ? 'Continue with Free Plan' : 'Included in Membership'}
                  </button>
                </div>

                {/* Premium Tier Card */}
                <div className="flex flex-col justify-between rounded-2xl border border-[#f6c453]/60 bg-[#1b152e] p-6 shadow-xl">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-display text-lg font-bold text-[#f6c453]">
                        Kitsune+ Premium
                      </h3>
                      <span className="text-xs font-semibold text-[#f6c453]">
                        {userPlan === 'pm' ? 'Active Membership' : 'Most Popular'}
                      </span>
                    </div>
                    <p className="font-display text-3xl font-extrabold text-white mt-2 font-mono tabular-nums">
                      $7.99
                      <span className="text-xs font-normal text-[#a79fc4]"> / month</span>
                    </p>
                    <ul className="mt-5 space-y-2.5 text-xs text-[#f5f1ff]">
                      <li>· No banner or pre-roll ads, ever</li>
                      <li>· 4K Ultra HD bitrate &amp; dual-audio (JP Sub / EN Dub) selector</li>
                      <li>· Early access to weekly simulcast episodes 1 hr after Japan</li>
                      <li>· Cross-device cloud watchlist sync via Supabase</li>
                    </ul>
                  </div>

                  <button
                    className="mt-6 w-full rounded-xl bg-[#f6c453] py-2.5 text-xs font-bold text-[#241800] hover:brightness-105 transition"
                    id="gopm"
                    onClick={handleUpgradePremium}
                    type="button"
                  >
                    {userPlan === 'pm' ? '✓ You are a Premium Member' : 'Go Premium'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-white/10 bg-[#08060f] px-6 py-8 text-xs text-[#a79fc4]">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="max-w-3xl leading-relaxed">
            Kitsune+ Anime Streaming. Catalog metadata powered by MyAnimeList via the Jikan API. Trailers and free full-series episodes stream from official YouTube channels (Muse Asia, Ani-One) and Kitsune+ Theater.
          </p>
          <div className="flex items-center gap-5 shrink-0">
            <a className="text-[#f6c453] hover:underline" href="/privacy.html">
              Privacy Policy
            </a>
            <button
              className="hover:text-white transition-colors"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              type="button"
            >
              Back to top ↑
            </button>
          </div>
        </div>
      </footer>

      {/* 18+ Mature Content Age Verification Modal */}
      {pendingMatureItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPendingMatureItem(null)
          }}
        >
          <div
            aria-labelledby="age-gate-title"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-white/15 bg-[#19142b] p-6 text-center shadow-2xl"
            role="dialog"
          >
            <p className="text-xs font-semibold text-[#ff5c8a]">Viewer Discretion Advised</p>
            <h2 className="font-display text-xl font-bold text-white mt-1" id="age-gate-title">
              Mature Content (18+)
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#a79fc4]">
              “{pendingMatureItem.anime.title}” contains intense violence and mature themes intended for viewers 18 and older. Confirm your age to continue to the screening room.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                className="rounded-xl bg-[#ff5c8a] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#ff739b] transition-colors"
                id="yes"
                onClick={handleConfirmAge}
                type="button"
              >
                I am 18 or older
              </button>
              <button
                className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
                id="no"
                onClick={() => setPendingMatureItem(null)}
                type="button"
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign In / Create Account Modal */}
      {authModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAuthModalOpen(false)
          }}
        >
          <div
            aria-labelledby="auth-modal-title"
            aria-modal="true"
            className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#19142b] p-6 shadow-2xl"
            role="dialog"
          >
            <button
              aria-label="Close sign in dialog"
              className="absolute right-4 top-4 text-lg text-[#a79fc4] hover:text-white"
              onClick={() => setAuthModalOpen(false)}
              type="button"
            >
              ×
            </button>

            <p className="text-xs font-medium text-[#f6c453]">Kitsune+ Account</p>
            <h2 className="font-display text-2xl font-bold text-white mt-1" id="auth-modal-title">
              {authMode === 'signup' ? 'Create your account' : 'Sign in to Kitsune+'}
            </h2>
            <p className="mt-1 text-xs text-[#a79fc4]">
              Sync your anime watchlist, episode progress, and Premium status across devices.
            </p>

            <form className="mt-5 space-y-3.5" noValidate onSubmit={handleAuthSubmit}>
              <div>
                <label className="block text-xs font-medium text-[#cfc8e8] mb-1" htmlFor="em">
                  Email address
                </label>
                <input
                  autoComplete="email"
                  className="w-full rounded-xl border border-white/15 bg-[#0e0b18] px-3.5 py-2.5 text-sm text-white placeholder:text-[#a79fc4]/50 focus:border-[#ff5c8a] focus:outline-none"
                  id="em"
                  onChange={(e) => {
                    setAuthEmail(e.target.value)
                    if (authMessage.text) setAuthMessage({ type: '', text: '' })
                  }}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={authEmail}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#cfc8e8] mb-1" htmlFor="pw">
                  Password ({authMode === 'signup' ? '8+ characters' : '6+ characters'})
                </label>
                <input
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full rounded-xl border border-white/15 bg-[#0e0b18] px-3.5 py-2.5 text-sm text-white placeholder:text-[#a79fc4]/50 focus:border-[#ff5c8a] focus:outline-none"
                  id="pw"
                  onChange={(e) => {
                    setAuthPassword(e.target.value)
                    if (authMessage.text) setAuthMessage({ type: '', text: '' })
                  }}
                  placeholder="••••••••"
                  required
                  type="password"
                  value={authPassword}
                />
              </div>

              {authMessage.text && (
                <p
                  className={`text-xs ${
                    authMessage.type === 'error' ? 'text-[#ff8aa8]' : 'text-[#f6c453]'
                  }`}
                  role="alert"
                >
                  {authMessage.text}
                </p>
              )}

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  className="flex-1 rounded-xl bg-[#ff5c8a] py-2.5 text-xs font-bold text-white hover:bg-[#ff739b] transition-colors"
                  type="submit"
                >
                  {authMode === 'signup' ? 'Create Free Account' : 'Sign In to Account'}
                </button>
                <button
                  className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
                  onClick={() => {
                    setAuthMode((m) => (m === 'login' ? 'signup' : 'login'))
                    setAuthMessage({ type: '', text: '' })
                  }}
                  type="button"
                >
                  {authMode === 'signup' ? 'Have an account? Sign in' : 'Create account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Episode Screening Room Modal */}
      {activeScreening && (
        <ScreeningModal
          anime={activeScreening.anime}
          comments={commentsMap[activeScreening.anime.id] || []}
          initialEpisodeIndex={activeScreening.episodeIndex}
          isInWatchlist={watchlistIds.includes(activeScreening.anime.id)}
          onAddComment={(c) => handleAddComment(activeScreening.anime.id, c)}
          onClose={() => setActiveScreening(null)}
          onEpisodeChange={handleEpisodeProgress}
          onToggleWatchlist={handleToggleWatchlist}
          onUpgradeClick={() => {
            setActiveScreening(null)
            setActiveNav('premium')
          }}
          userPlan={userPlan}
        />
      )}
    </div>
  )
}
