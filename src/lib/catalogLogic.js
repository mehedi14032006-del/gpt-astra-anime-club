/**
 * Pure business logic for Kitsune+ Anime Streaming
 * Decoupled from DOM/React for fast deterministic unit testing.
 */

export function isMatureRating(rating = '', isMatureFlag = false) {
  if (Boolean(isMatureFlag)) return true
  const normalized = String(rating || '').trim()
  return /^R/i.test(normalized) || normalized.includes('17+') || normalized.includes('18+')
}

export function resolveEmbedSource(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const parsed = new URL(url.trim())
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be' ||
      host === 'youtube-nocookie.com'
    ) {
      const videoId =
        host === 'youtu.be'
          ? parsed.pathname.slice(1).split('/')[0]
          : parsed.searchParams.get('v') ||
            (parsed.pathname.match(/\/(?:embed|shorts)\/([\w-]{6,})/) || [])[1]
      const listId = parsed.searchParams.get('list')

      if (videoId && videoId !== 'videoseries') {
        const listParam = listId ? `&list=${encodeURIComponent(listId)}` : ''
        return {
          type: 'iframe',
          provider: 'youtube',
          src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0${listParam}`,
        }
      }
      if (listId) {
        return {
          type: 'iframe',
          provider: 'youtube-playlist',
          src: `https://www.youtube-nocookie.com/embed/videoseries?autoplay=1&list=${encodeURIComponent(listId)}`,
        }
      }
    }

    if (host === 'archive.org') {
      const match = parsed.pathname.match(/\/(?:details|embed)\/([^/?#]+)/)
      if (match && match[1]) {
        return {
          type: 'iframe',
          provider: 'archive',
          src: `https://archive.org/embed/${encodeURIComponent(match[1])}`,
        }
      }
    }

    if (/\.(mp4|webm|ogg)$/i.test(parsed.pathname) && parsed.protocol === 'https:') {
      return {
        type: 'video',
        provider: 'direct',
        src: parsed.href,
      }
    }
  } catch {
    return null
  }
  return null
}

export function filterCatalog(
  items = [],
  {
    query = '',
    genre = 'All',
    audioFilter = 'all',
    onlyFree = false,
    hideMature = false,
    sortBy = 'popular',
  } = {},
) {
  if (!Array.isArray(items)) return []
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const normalizedGenre = String(genre || 'All').trim()

  const filtered = items.filter((item) => {
    if (!item) return false

    if (onlyFree && !item.is_free_series) {
      return false
    }

    if (hideMature && isMatureRating(item.rating, item.is_mature)) {
      return false
    }

    if (audioFilter === 'dub' && !item.has_dub) {
      return false
    }
    if (audioFilter === 'sub' && item.has_sub === false) {
      return false
    }

    if (normalizedGenre && normalizedGenre !== 'All') {
      const itemGenres = Array.isArray(item.genres)
        ? item.genres.map((g) => (typeof g === 'string' ? g : g?.name || ''))
        : item.genre
          ? [item.genre]
          : []
      const matchesGenre = itemGenres.some(
        (g) => g.toLowerCase() === normalizedGenre.toLowerCase(),
      )
      if (!matchesGenre) return false
    }

    if (normalizedQuery) {
      const titleMatch = String(item.title || item.name || '')
        .toLowerCase()
        .includes(normalizedQuery)
      const japaneseMatch = String(item.title_japanese || '')
        .toLowerCase()
        .includes(normalizedQuery)
      const synopsisMatch = String(item.synopsis || '')
        .toLowerCase()
        .includes(normalizedQuery)
      const studioMatch = String(item.studio || '')
        .toLowerCase()
        .includes(normalizedQuery)
      const genreTextMatch = (
        Array.isArray(item.genres)
          ? item.genres.map((g) => (typeof g === 'string' ? g : g?.name || '')).join(' ')
          : String(item.genre || '')
      )
        .toLowerCase()
        .includes(normalizedQuery)

      if (!titleMatch && !japaneseMatch && !synopsisMatch && !studioMatch && !genreTextMatch) {
        return false
      }
    }

    return true
  })

  const sorted = [...filtered]
  if (sortBy === 'score') {
    sorted.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
  } else if (sortBy === 'newest') {
    sorted.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0))
  } else if (sortBy === 'title') {
    sorted.sort((a, b) =>
      String(a.title || a.name || '').localeCompare(String(b.title || b.name || '')),
    )
  } else {
    sorted.sort((a, b) => (Number(a.popularity_rank) || 999) - (Number(b.popularity_rank) || 999))
  }

  return sorted
}

export function toggleWatchlistItem(watchlistIds = [], targetId) {
  if (!targetId) return Array.isArray(watchlistIds) ? [...watchlistIds] : []
  const idStr = String(targetId)
  const list = Array.isArray(watchlistIds) ? watchlistIds.map(String) : []
  if (list.includes(idStr)) {
    return list.filter((id) => id !== idStr)
  }
  return [idStr, ...list]
}

export function updateWatchProgress(
  historyList = [],
  { animeId, episodeNumber = 1, episodeTitle = '', progressPercent = 15, timestamp = Date.now() },
) {
  if (!animeId) return Array.isArray(historyList) ? [...historyList] : []
  const idStr = String(animeId)
  const clampedProgress = Math.max(1, Math.min(100, Math.round(Number(progressPercent) || 15)))
  const existing = Array.isArray(historyList) ? historyList : []
  const withoutCurrent = existing.filter((entry) => String(entry.animeId) !== idStr)

  return [
    {
      animeId: idStr,
      episodeNumber: Number(episodeNumber) || 1,
      episodeTitle: String(episodeTitle || `Episode ${episodeNumber}`),
      progressPercent: clampedProgress,
      updatedAt: timestamp,
    },
    ...withoutCurrent,
  ].slice(0, 20)
}

export function validateAuthCredentials({ email = '', password = '', mode = 'login' } = {}) {
  const trimmedEmail = String(email || '').trim()
  const rawPassword = String(password || '')

  if (!trimmedEmail) {
    return { valid: false, error: 'Enter your email address to continue.' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(trimmedEmail)) {
    return { valid: false, error: 'Enter a valid email address (for example, name@example.com).' }
  }

  if (!rawPassword) {
    return { valid: false, error: 'Enter your password to continue.' }
  }

  if (mode === 'signup') {
    if (rawPassword.length < 8) {
      return {
        valid: false,
        error: 'Use at least 8 characters for a new account password.',
      }
    }
  } else if (rawPassword.length < 6) {
    return {
      valid: false,
      error: 'Your password must be at least 6 characters long.',
    }
  }

  return { valid: true, email: trimmedEmail, error: '' }
}
