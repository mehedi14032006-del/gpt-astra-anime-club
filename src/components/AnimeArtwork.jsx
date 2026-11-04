import { useState } from 'react'

const THEME_PALETTES = {
  Action: {
    bgFrom: '#1a0c20',
    bgVia: '#4a1530',
    bgTo: '#9e2a4c',
    accent: '#ff5c8a',
    gold: '#f6c453',
  },
  Comedy: {
    bgFrom: '#0e1f26',
    bgVia: '#193d47',
    bgTo: '#2c6b6f',
    accent: '#5eead4',
    gold: '#f6c453',
  },
  Fantasy: {
    bgFrom: '#12112a',
    bgVia: '#2b225c',
    bgTo: '#593b9c',
    accent: '#c084fc',
    gold: '#fde047',
  },
  Drama: {
    bgFrom: '#161124',
    bgVia: '#31234c',
    bgTo: '#62447d',
    accent: '#f472b6',
    gold: '#fbbf24',
  },
  Horror: {
    bgFrom: '#0b0912',
    bgVia: '#29112b',
    bgTo: '#5c1638',
    accent: '#fb7185',
    gold: '#fca5a5',
  },
  Romance: {
    bgFrom: '#1c1126',
    bgVia: '#451f4a',
    bgTo: '#85396e',
    accent: '#f9a8d4',
    gold: '#fde68a',
  },
  'Sci-Fi': {
    bgFrom: '#0b1424',
    bgVia: '#162f52',
    bgTo: '#255b8a',
    accent: '#38bdf8',
    gold: '#f6c453',
  },
}

export function getAnimeImageUrl(anime) {
  if (!anime) return ''
  if (anime.poster_url) return anime.poster_url
  if (anime.images?.jpg?.large_image_url) return anime.images.jpg.large_image_url
  if (anime.images?.jpg?.image_url) return anime.images.jpg.image_url
  if (anime.thumbnail_url) return anime.thumbnail_url
  return ''
}

export default function AnimeArtwork({
  anime,
  className = '',
  aspectClass = 'aspect-[3/4]',
  priority = false,
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const imageUrl = getAnimeImageUrl(anime)
  const title = anime?.title_english || anime?.title || anime?.name || 'Kitsune+ Anime'
  const jpTitle = anime?.title_japanese || '狐アニメ'
  const studio = anime?.studio || 'Official Selection'
  const primaryGenre =
    anime?.genre ||
    (Array.isArray(anime?.genres)
      ? typeof anime.genres[0] === 'string'
        ? anime.genres[0]
        : anime.genres[0]?.name
      : 'Fantasy') ||
    'Fantasy'

  const palette = THEME_PALETTES[primaryGenre] || THEME_PALETTES.Fantasy
  const safeId = String(anime?.id || anime?.mal_id || title).replace(/[^a-zA-Z0-9_-]/g, '')

  return (
    <div
      className={`relative overflow-hidden bg-[#161224] select-none ${aspectClass} ${className}`}
    >
      {/* Bespoke Illustrated Anime Key-Visual Layer */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 300 400"
      >
        <defs>
          <linearGradient id={`bg-${safeId}`} x1="0" x2="0.8" y1="0" y2="1">
            <stop offset="0%" stopColor={palette.bgFrom} />
            <stop offset="55%" stopColor={palette.bgVia} />
            <stop offset="100%" stopColor={palette.bgTo} />
          </linearGradient>
          <radialGradient id={`moon-${safeId}`} cx="72%" cy="24%" r="38%">
            <stop offset="0%" stopColor={palette.gold} stopOpacity="0.9" />
            <stop offset="55%" stopColor={palette.accent} stopOpacity="0.38" />
            <stop offset="100%" stopColor={palette.bgFrom} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect fill={`url(#bg-${safeId})`} height="400" width="300" />
        <circle cx="216" cy="96" fill={`url(#moon-${safeId})`} r="115" />
        <circle cx="216" cy="96" fill={palette.gold} fillOpacity="0.92" r="36" />
        <ellipse
          cx="210"
          cy="102"
          fill="none"
          rx="78"
          ry="24"
          stroke={palette.accent}
          strokeOpacity="0.5"
          strokeWidth="1.4"
          transform="rotate(-22 210 102)"
        />
        {/* Distant Mountain Peaks */}
        <path
          d="M-20 400 L-20 275 L55 225 L125 268 L205 208 L320 262 L320 400 Z"
          fill="#100b1d"
          fillOpacity="0.78"
        />
        {/* Stylized Torii Gate & Anime Protagonist Silhouette */}
        <g fill="#0c0817" opacity="0.9" transform="translate(82, 185)">
          <path d="M-12 0 Q68 -15 148 0 L142 11 Q68 -2 -6 11 Z" />
          <rect height="7" rx="2" width="126" x="5" y="21" />
          <rect height="135" width="9" x="20" y="9" />
          <rect height="135" width="9" x="106" y="9" />
        </g>
        {/* Hero Character Silhouette in Foreground */}
        <g fill="#080610" transform="translate(115, 228)">
          <circle cx="35" cy="24" r="16" />
          <path d="M12 48 Q35 38 58 48 L76 172 L-6 172 Z" />
          <path
            d="M48 36 L112 -12"
            stroke={palette.gold}
            strokeLinecap="round"
            strokeOpacity="0.85"
            strokeWidth="2.5"
          />
        </g>
        {/* Star particles */}
        <circle cx="48" cy="64" fill="#fff" fillOpacity="0.75" r="1.6" />
        <circle cx="96" cy="42" fill="#fff" fillOpacity="0.55" r="1.2" />
        <circle cx="144" cy="88" fill={palette.gold} fillOpacity="0.85" r="2.2" />
        <circle cx="62" cy="142" fill={palette.accent} fillOpacity="0.65" r="1.8" />
      </svg>

      {/* Japanese Key-Visual Typography Signature when using SVG art */}
      {(!imageUrl || imgFailed) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3.5 bg-gradient-to-t from-[#0b0914]/90 via-transparent to-black/25">
          <span className="text-[11px] font-semibold tracking-widest text-white/80 drop-shadow truncate">
            {jpTitle}
          </span>
          <span className="text-[10px] font-medium tracking-wider text-[#f6c453]/90 uppercase truncate">
            {studio}
          </span>
        </div>
      )}

      {/* High-Resolution Anime Key Visual Poster Image */}
      {imageUrl && !imgFailed && (
        <img
          alt={title}
          className="relative z-10 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setImgFailed(true)}
          referrerPolicy="no-referrer"
          src={imageUrl}
        />
      )}

      {/* Subtle Bottom Contrast Scrim */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1/3 bg-gradient-to-t from-[#0b0914]/85 via-[#0b0914]/25 to-transparent"
      />
    </div>
  )
}
