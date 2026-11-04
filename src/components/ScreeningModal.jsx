import { useEffect, useRef, useState } from 'react'
import { resolveEmbedSource } from '../lib/catalogLogic.js'

const SUBTITLE_LINES = [
  '“Even across a thousand worlds, a promise carved in starlight never fades.”',
  '“Target sighted at Sector 4 — all units, prepare for high-altitude intercept!”',
  '“Hold your ground! This strike decides everything we have fought to protect!”',
  '“Wait… you mean the secret organization has been inside the academy all along?!”',
  '“Domain resonance at 120% — releasing celestial kitsune seal!”',
]

export default function ScreeningModal({
  anime,
  initialEpisodeIndex = 0,
  isInWatchlist = false,
  userPlan = 'free',
  comments = [],
  onClose,
  onToggleWatchlist,
  onEpisodeChange,
  onAddComment,
  onUpgradeClick,
}) {
  const episodes =
    Array.isArray(anime?.episodes) && anime.episodes.length > 0
      ? anime.episodes
      : [
          {
            id: `${anime?.id || anime?.mal_id}-ep-1`,
            episode_number: 1,
            name: anime?.is_free_series ? 'Full Series Playlist' : 'Official Preview & Screening',
            duration: '24:00',
            synopsis: anime?.synopsis || 'Official broadcast screening.',
            video_url:
              anime?.trailer?.embed_url ||
              (anime?.playlist_id
                ? `https://www.youtube.com/playlist?list=${anime.playlist_id}`
                : ''),
          },
        ]

  const [currentEpIndex, setCurrentEpIndex] = useState(
    Math.min(Math.max(0, initialEpisodeIndex), episodes.length - 1),
  )
  const [playerMode, setPlayerMode] = useState('theater') // 'theater' | 'embed'
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(142) // start at 02:22 for immediate visual richness
  const [audioTrack, setAudioTrack] = useState('JP Sub')
  const [quality, setQuality] = useState(userPlan === 'pm' ? '4K Ultra HD' : '1080p HD')
  const [commentAuthor, setCommentAuthor] = useState('')
  const [commentText, setCommentText] = useState('')
  const [commentError, setCommentError] = useState('')

  const canvasRef = useRef(null)
  const closeButtonRef = useRef(null)
  const totalSeconds = 1440 // 24:00 standard anime episode

  const currentEpisode = episodes[currentEpIndex] || episodes[0]
  const title = anime?.title_english || anime?.title || anime?.name || 'Anime Screening'

  // Resolve YouTube / Archive.org embed if available
  const rawVideoUrl =
    currentEpisode?.video_url ||
    anime?.trailer?.embed_url ||
    (anime?.playlist_id ? `https://www.youtube.com/playlist?list=${anime.playlist_id}` : '')

  const embedDescriptor =
    anime?.trailer?.embed_url && !currentEpisode?.video_url
      ? { type: 'iframe', provider: 'youtube', src: anime.trailer.embed_url }
      : resolveEmbedSource(rawVideoUrl)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      } else if (
        event.key === ' ' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        event.preventDefault()
        setIsPlaying((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Advance simulated playback clock when in Theater mode
  useEffect(() => {
    if (playerMode !== 'theater' || !isPlaying) return undefined
    const interval = window.setInterval(() => {
      setCurrentTime((prev) => (prev + 1 >= totalSeconds ? 0 : prev + 1))
    }, 1000)
    return () => window.clearInterval(interval)
  }, [playerMode, isPlaying])

  // Render stylized anime scene in the Theater Canvas
  useEffect(() => {
    if (playerMode !== 'theater') return undefined
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return undefined

    let animId = null
    let frame = currentTime * 30

    const drawFrame = () => {
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, w, h)
      sky.addColorStop(0, '#0c0818')
      sky.addColorStop(0.55, '#231338')
      sky.addColorStop(1, '#4c1d4b')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)

      // Celestial moon
      const moonX = w * 0.74
      const moonY = h * 0.3
      const moonGlow = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 150)
      moonGlow.addColorStop(0, 'rgba(246, 196, 83, 0.85)')
      moonGlow.addColorStop(0.4, 'rgba(255, 92, 138, 0.3)')
      moonGlow.addColorStop(1, 'rgba(18, 13, 36, 0)')
      ctx.fillStyle = moonGlow
      ctx.beginPath()
      ctx.arc(moonX, moonY, 150, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#fff5d6'
      ctx.beginPath()
      ctx.arc(moonX, moonY, 42, 0, Math.PI * 2)
      ctx.fill()

      // Drifting sakura / energy particles
      for (let i = 0; i < 28; i += 1) {
        const px = ((i * 97 + frame * (0.6 + (i % 3) * 0.25)) % (w + 40)) - 20
        const py = ((i * 53 + Math.sin(frame * 0.02 + i) * 18) % (h * 0.78)) + 15
        const size = (i % 3) + 1.8
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 138, 174, 0.78)' : 'rgba(246, 196, 83, 0.72)'
        ctx.beginPath()
        ctx.arc(px, py, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Distant city / shrine horizon
      ctx.fillStyle = '#0e0a1a'
      ctx.beginPath()
      ctx.moveTo(0, h)
      ctx.lineTo(0, h * 0.68)
      ctx.lineTo(w * 0.18, h * 0.62)
      ctx.lineTo(w * 0.35, h * 0.7)
      ctx.lineTo(w * 0.56, h * 0.58)
      ctx.lineTo(w * 0.82, h * 0.66)
      ctx.lineTo(w, h * 0.6)
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fill()

      // Kinetic anime speedlines / aura around center-left hero silhouette
      const heroX = w * 0.32
      const heroY = h * 0.63
      const pulse = Math.sin(frame * 0.05) * 8
      const aura = ctx.createRadialGradient(heroX, heroY, 8, heroX, heroY, 95 + pulse)
      aura.addColorStop(0, 'rgba(255, 92, 138, 0.55)')
      aura.addColorStop(1, 'rgba(255, 92, 138, 0)')
      ctx.fillStyle = aura
      ctx.beginPath()
      ctx.arc(heroX, heroY, 95 + pulse, 0, Math.PI * 2)
      ctx.fill()

      // Top-left watermark
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.font = '600 12px "Plus Jakarta Sans", sans-serif'
      ctx.fillText(`KITSUNE+ HD · ${quality} · ${audioTrack}`, 24, 32)

      if (isPlaying) {
        frame += 1
        animId = window.requestAnimationFrame(drawFrame)
      }
    }

    drawFrame()
    return () => {
      if (animId) window.cancelAnimationFrame(animId)
    }
  }, [playerMode, isPlaying, quality, audioTrack, currentTime])

  function handleSelectEpisode(index) {
    setCurrentEpIndex(index)
    setCurrentTime(0)
    setIsPlaying(true)
    const ep = episodes[index]
    onEpisodeChange?.(index + 1, ep?.name || `Episode ${index + 1}`, 20)
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function handleCommentSubmit(event) {
    event.preventDefault()
    const trimmedText = commentText.trim()
    const trimmedAuthor = commentAuthor.trim() || 'AnimeFan_Kitsune'
    if (trimmedText.length < 3) {
      setCommentError('Please write at least 3 characters before posting your comment.')
      return
    }
    setCommentError('')
    onAddComment?.({
      id: `c-${Date.now()}`,
      author: trimmedAuthor,
      timeAgo: 'Just now',
      episode: `Episode ${currentEpisode.episode_number}`,
      rating: 5,
      text: trimmedText,
    })
    setCommentText('')
  }

  const subtitleText =
    SUBTITLE_LINES[( Math.floor(currentTime / 6) + currentEpIndex ) % SUBTITLE_LINES.length]

  const genreText = Array.isArray(anime?.genres)
    ? anime.genres.map((g) => (typeof g === 'string' ? g : g?.name)).filter(Boolean).join(' · ')
    : anime?.genre || 'Anime'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-md overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        aria-labelledby="screening-room-title"
        aria-modal="true"
        className="relative my-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-[#141122] text-[#f5f1ff] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        role="dialog"
      >
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 bg-[#181429]">
          <div className="min-w-0">
            <p className="text-xs text-[#a79fc4] truncate">
              {anime?.studio ? `${anime.studio} · ` : ''}
              Episode {currentEpisode.episode_number}: {currentEpisode.name}
            </p>
            <h2
              className="font-display text-lg sm:text-xl font-bold text-white truncate"
              id="screening-room-title"
            >
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Switch between Instant Theater Stream and Official YouTube Embed */}
            {embedDescriptor && (
              <div className="hidden sm:flex items-center rounded-lg bg-white/[0.05] p-1 border border-white/10">
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    playerMode === 'theater'
                      ? 'bg-[#ff5c8a] text-white'
                      : 'text-[#a79fc4] hover:text-white'
                  }`}
                  onClick={() => setPlayerMode('theater')}
                  type="button"
                >
                  Kitsune+ Player
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    playerMode === 'embed'
                      ? 'bg-[#ff5c8a] text-white'
                      : 'text-[#a79fc4] hover:text-white'
                  }`}
                  onClick={() => setPlayerMode('embed')}
                  type="button"
                >
                  Official YouTube
                </button>
              </div>
            )}

            <button
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-white transition-colors whitespace-nowrap"
              onClick={() => onToggleWatchlist?.(anime.id || `mal-${anime.mal_id}`)}
              type="button"
            >
              {isInWatchlist ? '✓ In My List' : '+ Watchlist'}
            </button>

            <button
              aria-label="Close player"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-lg text-[#a79fc4] hover:bg-white/10 hover:text-white transition-colors"
              onClick={onClose}
              ref={closeButtonRef}
              type="button"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto p-5 space-y-6">
          {/* 16:9 Video Screen */}
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black border border-white/10">
            {playerMode === 'embed' && embedDescriptor ? (
              embedDescriptor.type === 'video' ? (
                <video
                  autoPlay
                  className="h-full w-full object-contain"
                  controls
                  playsInline
                  src={embedDescriptor.src}
                />
              ) : (
                <iframe
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                  className="h-full w-full border-0"
                  src={embedDescriptor.src}
                  title={`${title} — Episode ${currentEpisode.episode_number}`}
                />
              )
            ) : (
              <div className="relative h-full w-full select-none">
                <canvas
                  className="h-full w-full object-cover cursor-pointer"
                  height={450}
                  onClick={() => setIsPlaying((prev) => !prev)}
                  ref={canvasRef}
                  width={800}
                />

                {/* Episode Title & Subtitle Overlay */}
                <div className="pointer-events-none absolute inset-x-0 bottom-14 flex flex-col items-center px-6 text-center">
                  <p className="rounded bg-black/75 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white shadow-lg">
                    {subtitleText}
                  </p>
                </div>

                {/* Custom Player Controls Bar */}
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 pb-3 pt-6">
                  {/* Seek Bar */}
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] tabular-nums text-white/80">
                      {formatTime(currentTime)}
                    </span>
                    <input
                      aria-label="Seek video timeline"
                      className="h-1.5 flex-1 cursor-pointer accent-[#ff5c8a]"
                      max={totalSeconds}
                      min={0}
                      onChange={(e) => {
                        const nextSec = Number(e.target.value)
                        setCurrentTime(nextSec)
                        onEpisodeChange?.(
                          currentEpIndex + 1,
                          currentEpisode.name,
                          Math.round((nextSec / totalSeconds) * 100),
                        )
                      }}
                      type="range"
                      value={currentTime}
                    />
                    <span className="font-mono text-[11px] tabular-nums text-white/60">
                      {currentEpisode.duration || '24:00'}
                    </span>
                  </div>

                  {/* Transport & Audio/Quality Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        className="rounded-lg bg-[#ff5c8a] px-3 py-1 text-xs font-semibold text-white hover:bg-[#ff749b] transition-colors whitespace-nowrap"
                        onClick={() => setIsPlaying((prev) => !prev)}
                        type="button"
                      >
                        {isPlaying ? 'Pause' : 'Play'}
                      </button>

                      {episodes.length > 1 && (
                        <>
                          <button
                            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/20 disabled:opacity-40 whitespace-nowrap"
                            disabled={currentEpIndex === 0}
                            onClick={() => handleSelectEpisode(currentEpIndex - 1)}
                            type="button"
                          >
                            Prev Ep
                          </button>
                          <button
                            className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white hover:bg-white/20 disabled:opacity-40 whitespace-nowrap"
                            disabled={currentEpIndex >= episodes.length - 1}
                            onClick={() => handleSelectEpisode(currentEpIndex + 1)}
                            type="button"
                          >
                            Next Ep
                          </button>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="rounded bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20 whitespace-nowrap"
                        onClick={() =>
                          setAudioTrack((prev) => (prev === 'JP Sub' ? 'EN Dub' : 'JP Sub'))
                        }
                        type="button"
                      >
                        Audio: {audioTrack}
                      </button>
                      <button
                        className="rounded bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[#f6c453] hover:bg-white/20 whitespace-nowrap"
                        onClick={() => {
                          if (userPlan !== 'pm' && quality === '1080p HD') {
                            onUpgradeClick?.()
                          } else {
                            setQuality((q) => (q === '1080p HD' ? '4K Ultra HD' : '1080p HD'))
                          }
                        }}
                        type="button"
                      >
                        {quality}
                      </button>
                      {embedDescriptor && (
                        <button
                          className="sm:hidden rounded bg-white/10 px-2.5 py-1 text-[11px] text-white hover:bg-white/20 whitespace-nowrap"
                          onClick={() =>
                            setPlayerMode((m) => (m === 'theater' ? 'embed' : 'theater'))
                          }
                          type="button"
                        >
                          {playerMode === 'theater' ? 'YouTube Mode' : 'Theater Mode'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Series Metadata & External Official Channel Links */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div className="space-y-2 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#a79fc4]">
                <span>{anime?.type || 'TV Series'}</span>
                <span aria-hidden="true">·</span>
                <span>{anime?.year || '2024'}</span>
                <span aria-hidden="true">·</span>
                <span>{genreText}</span>
                {anime?.score && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-[#f6c453]">★ {anime.score}</span>
                  </>
                )}
                {anime?.rating && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{anime.rating}</span>
                  </>
                )}
              </div>
              <p className="text-sm leading-relaxed text-[#d7d0ec]">
                {anime?.synopsis || currentEpisode?.synopsis}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              {rawVideoUrl && (
                <a
                  className="px-3.5 py-2 rounded-lg bg-[#ff5c8a] text-white text-xs font-semibold hover:bg-[#ff739b] transition-colors whitespace-nowrap"
                  href={rawVideoUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Official YouTube Channel ↗
                </a>
              )}
              <a
                className="px-3.5 py-2 rounded-lg border border-white/15 bg-white/[0.04] text-white text-xs font-medium hover:bg-white/10 transition-colors whitespace-nowrap"
                href={`https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                Find on Crunchyroll
              </a>
              {anime?.url && (
                <a
                  className="px-3.5 py-2 rounded-lg border border-white/15 bg-white/[0.04] text-[#a79fc4] text-xs font-medium hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap"
                  href={anime.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  MyAnimeList
                </a>
              )}
            </div>
          </div>

          {/* Multi-Episode Selector Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm font-semibold text-white">
                Episodes ({episodes.length})
              </h3>
              <span className="text-xs text-[#a79fc4]">
                Select an episode to switch stream
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
              {episodes.map((ep, idx) => {
                const active = idx === currentEpIndex
                return (
                  <button
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? 'border-[#ff5c8a] bg-[#ff5c8a]/15 text-white'
                        : 'border-white/10 bg-white/[0.03] text-[#d7d0ec] hover:border-white/25 hover:bg-white/[0.06]'
                    }`}
                    key={ep.id || idx}
                    onClick={() => handleSelectEpisode(idx)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <span className="block font-mono text-[11px] tabular-nums text-[#f6c453]">
                        Episode {ep.episode_number}
                      </span>
                      <span className="block text-xs font-medium truncate mt-0.5">
                        {ep.name || `Episode ${ep.episode_number}`}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-[#a79fc4] shrink-0">
                      {ep.duration || '24:00'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Episode Discussion & Community Reviews */}
          <div className="border-t border-white/10 pt-5">
            <h3 className="font-display text-sm font-semibold text-white mb-3">
              Episode Discussion ({comments.length})
            </h3>

            <form className="mb-4 flex flex-col sm:flex-row gap-2.5" onSubmit={handleCommentSubmit}>
              <input
                aria-label="Your display name"
                className="sm:w-44 rounded-lg border border-white/15 bg-[#0e0b18] px-3 py-2 text-xs text-white placeholder:text-[#a79fc4]/60 focus:border-[#ff5c8a] focus:outline-none"
                onChange={(e) => setCommentAuthor(e.target.value)}
                placeholder="Your handle (optional)"
                type="text"
                value={commentAuthor}
              />
              <input
                aria-label="Write an episode comment"
                className="flex-1 rounded-lg border border-white/15 bg-[#0e0b18] px-3 py-2 text-xs text-white placeholder:text-[#a79fc4]/60 focus:border-[#ff5c8a] focus:outline-none"
                onChange={(e) => {
                  setCommentText(e.target.value)
                  if (commentError) setCommentError('')
                }}
                placeholder={`Share your thoughts on ${title} Episode ${currentEpisode.episode_number}...`}
                type="text"
                value={commentText}
              />
              <button
                className="rounded-lg bg-[#ff5c8a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#ff739b] transition-colors whitespace-nowrap shrink-0"
                type="submit"
              >
                Post Comment
              </button>
            </form>
            {commentError && (
              <p className="mb-3 text-xs text-[#ff8aa8]" role="alert">
                {commentError}
              </p>
            )}

            <div className="space-y-2.5">
              {comments.length === 0 ? (
                <p className="text-xs text-[#a79fc4]">
                  No comments yet for this screening. Be the first to start the discussion!
                </p>
              ) : (
                comments.map((c) => (
                  <div
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs"
                    key={c.id}
                  >
                    <div className="flex items-center justify-between text-[#a79fc4] mb-1">
                      <span className="font-semibold text-white">{c.author}</span>
                      <span>
                        {c.episode} · {c.timeAgo}
                      </span>
                    </div>
                    <p className="text-[#d7d0ec] leading-relaxed">{c.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
