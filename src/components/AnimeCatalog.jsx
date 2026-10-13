import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sanitizeSupabaseErrorText, supabase } from '../lib/supabase.js'
import PremiumVideoPlayer from './PremiumVideoPlayer.jsx'
import './AnimeCatalog.css'

const fallbackAnimeCollection = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'Astra Chronicles: Episode 1 (Free Premiere)',
    description: 'Begin the Astra Chronicles with the free premiere.',
    thumbnail_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&q=80',
    is_premium: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    title: "Astra Chronicles: Director's Cut (Premium Tier)",
    description: 'Experience the extended premium director’s cut.',
    thumbnail_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&q=80',
    is_premium: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    title: 'Cyber: Cyberpunk Edgerunners',
    description: 'A high-speed journey through a neon-drenched future.',
    thumbnail_url: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=800&q=80',
    is_premium: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    title: 'Whispers of the Neon Rain',
    description: 'Unravel a psychological mystery beneath the neon rain.',
    thumbnail_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80',
    is_premium: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    title: 'Echoes of Eternity',
    description: 'A romantic story echoing across time.',
    thumbnail_url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&q=80',
    is_premium: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000006',
    title: 'Vanguard Titan Protocol',
    description: 'A mecha squad takes on a high-stakes mission.',
    thumbnail_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&q=80',
    is_premium: true,
  },
]

const categories = [
  'All Universes',
  'Space Fantasy',
  'Sci-Fi',
  'Action',
  'Psychological',
  'Romance',
  'Mecha',
]

function AnimeCard({ anime, onSelect }) {
  const isPremium = anime.is_premium === true

  return (
    <article className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-purple-900/30 bg-[#0f0d1f] transition duration-500 hover:-translate-y-2 hover:border-purple-500/60 hover:shadow-2xl hover:shadow-purple-600/20">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-900">
        {anime.thumbnail_url && (
          <img
            alt={anime.title}
            className="size-full object-cover transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
            src={anime.thumbnail_url}
          />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#0f0d1f] via-transparent to-black/30" />
        <span
          className={`absolute left-3 top-3 rounded-md border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md ${
            isPremium
              ? 'border-amber-300/40 bg-amber-500/80 text-amber-100'
              : 'border-purple-400/30 bg-purple-900/80 text-purple-200'
          }`}
        >
          {isPremium ? 'Premium VIP' : 'Free Stream'}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <h3 className="text-lg font-bold text-white transition-colors duration-300 group-hover:text-purple-300">
            {anime.title}
          </h3>
          {anime.description && (
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-400">{anime.description}</p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-purple-950/60 pt-4">
          <button
            className="anime-card__explore"
            onClick={() => onSelect(anime)}
            type="button"
          >
            Launch Screening <span aria-hidden="true">→</span>
          </button>
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full bg-white/5 text-sm text-zinc-400 transition-all group-hover:bg-purple-600/30 group-hover:text-white"
          >
            ▶
          </span>
        </div>
      </div>
    </article>
  )
}

export default function AnimeCatalog() {
  const [selectedCategory, setSelectedCategory] = useState('All Universes')
  const [searchQuery, setSearchQuery] = useState('')
  const [animeCollection, setAnimeCollection] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [activeVideo, setActiveVideo] = useState(null)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimeout = useRef(null)
  const closeButton = useRef(null)
  const closeScreeningRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    async function loadAnimeCollection() {
      if (!supabase) {
        setLoadError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to load the catalog.')
        setIsLoading(false)
        return
      }

      try {
        const { data, error } = await supabase.from('videos').select('*')

        if (error) throw error

        if (isMounted) {
          setAnimeCollection(data?.length ? data : fallbackAnimeCollection)
          setIsLoading(false)
        }
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : error?.message || 'An unexpected error occurred.'
          setLoadError(sanitizeSupabaseErrorText(message))
          setIsLoading(false)
        }
      }
    }

    loadAnimeCollection()

    return () => {
      isMounted = false
    }
  }, [])

  const filteredCollection = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase()

    return animeCollection.filter((item) => {
      const matchesCategory = selectedCategory === 'All Universes' || item.genre === selectedCategory
      const matchesSearch = !normalizedSearch
        || (item.title || '').toLocaleLowerCase().includes(normalizedSearch)
        || (item.description || '').toLocaleLowerCase().includes(normalizedSearch)
        || (item.genre || '').toLocaleLowerCase().includes(normalizedSearch)

      return matchesCategory && matchesSearch
    })
  }, [animeCollection, selectedCategory, searchQuery])

  function openScreening(anime) {
    window.clearTimeout(closeTimeout.current)
    setIsClosing(false)
    setActiveVideo(anime)
  }

  const closeScreening = useCallback(() => {
    if (!activeVideo || isClosing) return

    setIsClosing(true)
    closeTimeout.current = window.setTimeout(() => {
      setActiveVideo(null)
      setIsClosing(false)
    }, 180)
  }, [activeVideo, isClosing])

  useEffect(() => {
    closeScreeningRef.current = closeScreening
  }, [closeScreening])

  useEffect(() => {
    if (!activeVideo) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') closeScreeningRef.current?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(closeTimeout.current)
    }
  }, [activeVideo])

  return (
    <section aria-labelledby="catalog-title" className="relative mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8" id="gallery">
      <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-purple-400">
            Exploration Grid
          </span>
          <h2 className="mt-1 text-3xl font-extrabold text-white md:text-4xl" id="catalog-title">
            Curated Categories &amp; Universes
          </h2>
        </div>
        <label className="relative w-full md:w-72">
          <span className="visually-hidden">Search anime or genre</span>
          <input
            className="w-full rounded-xl border border-purple-900/40 bg-[#131124] px-4 py-2.5 text-sm text-zinc-100 transition-all placeholder:text-zinc-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder="Search anime or genre..."
            type="search"
            value={searchQuery}
          />
        </label>
      </div>

      <div aria-label="Filter by category" className="no-scrollbar mb-10 flex items-center gap-2.5 overflow-x-auto pb-4">
        {categories.map((category) => {
          const isActive = selectedCategory === category

          return (
            <button
              aria-pressed={isActive}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-medium tracking-wide transition-all duration-300 md:text-sm ${
                isActive
                  ? 'scale-105 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30'
                  : 'border border-white/5 bg-[#110f22] text-zinc-400 hover:bg-[#1a1733] hover:text-white'
              }`}
              key={category}
              onClick={() => setSelectedCategory(category)}
              type="button"
            >
              {category}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-zinc-400" role="status">
          Loading the anime catalog…
        </p>
      ) : loadError ? (
        <p className="py-12 text-center text-sm text-red-300" role="alert">
          We couldn’t load the anime catalog: {loadError}
        </p>
      ) : filteredCollection.length > 0 ? (
        <div aria-live="polite" className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3">
          {filteredCollection.map((anime) => (
            <AnimeCard anime={anime} key={anime.id} onSelect={openScreening} />
          ))}
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-zinc-400" role="status">
          No titles match your search. Try another title or category.
        </p>
      )}

      {activeVideo && (
        <div
          className={`screening-modal-backdrop${isClosing ? ' is-closing' : ''}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeScreening()
          }}
        >
          <section
            aria-labelledby="screening-modal-title"
            aria-modal="true"
            className="screening-modal"
            role="dialog"
          >
            <header className="screening-modal__header">
              <div>
                <span className="screening-modal__eyebrow">Astra Celestial Screening</span>
                <h2 id="screening-modal-title">{activeVideo.title}</h2>
              </div>
              <button
                aria-label="Close screening modal"
                className="screening-modal__close"
                onClick={closeScreening}
                ref={closeButton}
                type="button"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </header>
            <PremiumVideoPlayer title={activeVideo.title} videoId={activeVideo.id} />
          </section>
        </div>
      )}
    </section>
  )
}
