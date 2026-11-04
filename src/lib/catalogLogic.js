/**
 * Pure business logic for Kitsune+ Anime Catalog, Video Embed Resolution,
 * Availability Classification, Strict 18+ DOB Age Verification, and Watch Progress.
 */

export const GENRES = [
  'All',
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Romance',
  'Sci-Fi'
];

export const FORMAT_FILTERS = [
  { id: 'All', label: 'All Titles' },
  { id: 'Playable', label: 'Direct Stream (Watchable Now)' },
  { id: 'TV', label: 'TV Series' },
  { id: 'Movie', label: 'Movies' },
  { id: 'Ongoing', label: 'Ongoing Simulcasts' },
  { id: 'Mature', label: '18+ Uncut' }
];

/**
 * Resolves a raw video URL into a safe, embeddable source configuration.
 * Handles:
 *  - Local / self-hosted H.264 MP4 streams (/streams/*.mp4)
 *  - Direct HTTPS video streams (.mp4, .webm)
 *  - YouTube watch URLs (https://www.youtube.com/watch?v=...)
 *  - YouTube short URLs (https://youtu.be/...)
 *  - YouTube playlist URLs (https://www.youtube.com/playlist?list=...) with per-episode index
 *  - YouTube embed URLs (https://www.youtube.com/embed/... or youtube-nocookie.com/embed/...)
 *  - Internet Archive URLs (https://archive.org/details/... or https://archive.org/embed/...)
 */
export function resolveEmbedSource(rawUrl, episodeIndex = 0) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { type: 'none', src: '', provider: 'Unknown' };
  }
  const url = rawUrl.trim();
  if (!url) {
    return { type: 'none', src: '', provider: 'Unknown' };
  }

  // Local self-hosted stream (e.g. /streams/action-stream.mp4)
  if (url.startsWith('/streams/') && /\.(mp4|webm)(\?.*)?$/i.test(url)) {
    return { type: 'video', src: url, provider: 'Kitsune+ Direct HD CDN' };
  }

  let parsed;
  try {
    parsed = new URL(url, 'http://localhost:3000');
  } catch {
    return { type: 'none', src: '', provider: 'Unknown' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { type: 'none', src: '', provider: 'Unknown' };
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const safeIndex = Math.max(0, Number(episodeIndex) || 0);

  // Direct MP4 or WebM video files
  if (/\.(mp4|webm)(\?.*)?$/i.test(parsed.pathname)) {
    return { type: 'video', src: url, provider: 'Direct Stream' };
  }

  // YouTube standard & nocookie domains
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const listId = parsed.searchParams.get('list');
    const videoId = parsed.searchParams.get('v');

    if (parsed.pathname === '/playlist' && listId) {
      return {
        type: 'iframe',
        src: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(listId)}&index=${safeIndex}&rel=0`,
        provider: 'YouTube Official Channel'
      };
    }

    if (parsed.pathname === '/watch' && videoId) {
      const extra = listId ? `&list=${encodeURIComponent(listId)}&index=${safeIndex}` : '';
      return {
        type: 'iframe',
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0${extra}`,
        provider: 'YouTube Official'
      };
    }

    if (parsed.pathname.startsWith('/embed/')) {
      const idPart = parsed.pathname.slice('/embed/'.length);
      const search = parsed.search ? parsed.search : '?rel=0';
      return {
        type: 'iframe',
        src: `https://www.youtube-nocookie.com/embed/${idPart}${search}`,
        provider: 'YouTube Official'
      };
    }
  }

  if (host === 'youtu.be') {
    const videoId = parsed.pathname.slice(1).split('/')[0];
    if (videoId) {
      return {
        type: 'iframe',
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`,
        provider: 'YouTube Official'
      };
    }
  }

  // Internet Archive
  if (host === 'archive.org') {
    if (parsed.pathname.startsWith('/details/')) {
      const slug = parsed.pathname.slice('/details/'.length).split('/')[0];
      if (slug) {
        return {
          type: 'iframe',
          src: `https://archive.org/embed/${encodeURIComponent(slug)}`,
          provider: 'Internet Archive Public Domain'
        };
      }
    }
    if (parsed.pathname.startsWith('/embed/')) {
      return {
        type: 'iframe',
        src: `https://archive.org${parsed.pathname}`,
        provider: 'Internet Archive Public Domain'
      };
    }
  }

  return { type: 'external', src: url, provider: host };
}

/**
 * Strictly verifies a user's age from Date of Birth (year, month 1-12, day 1-31)
 * against a regional minimum age (default 18, or 20 for JP/KR strict regions).
 */
export function verifyAgeFromBirthDate({ year, month, day, minAge = 18 } = {}, referenceDate = new Date('2026-05-01T00:00:00Z')) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const requiredAge = Number(minAge) || 18;

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return {
      validInput: false,
      eligible: false,
      age: 0,
      isMinorLock: false,
      error: 'Please enter a valid numeric birth year, month, and day.'
    };
  }

  const currentYear = referenceDate.getUTCFullYear();
  if (y < 1900 || y > currentYear || m < 1 || m > 12 || d < 1 || d > 31) {
    return {
      validInput: false,
      eligible: false,
      age: 0,
      isMinorLock: false,
      error: 'Please enter a realistic calendar date of birth.'
    };
  }

  const birthDate = new Date(Date.UTC(y, m - 1, d));
  if (
    birthDate.getUTCFullYear() !== y ||
    birthDate.getUTCMonth() !== m - 1 ||
    birthDate.getUTCDate() !== d
  ) {
    return {
      validInput: false,
      eligible: false,
      age: 0,
      isMinorLock: false,
      error: 'That calendar date does not exist (e.g., invalid day for month).'
    };
  }

  let age = currentYear - y;
  const currentMonth = referenceDate.getUTCMonth() + 1;
  const currentDay = referenceDate.getUTCDate();

  if (currentMonth < m || (currentMonth === m && currentDay < d)) {
    age -= 1;
  }

  if (age < 0) {
    return {
      validInput: false,
      eligible: false,
      age: 0,
      isMinorLock: false,
      error: 'Birth date cannot be in the future.'
    };
  }

  const eligible = age >= requiredAge;
  return {
    validInput: true,
    eligible,
    age,
    isMinorLock: !eligible,
    error: eligible
      ? ''
      : `Access denied: You are ${age} years old. Regional law requires viewers to be ${requiredAge}+ for mature anime. Safe Mode has been locked on for this session.`
  };
}

/**
 * Determines whether an anime item is mature (18+) based on rating or explicit flag.
 */
export function isMatureAnime(anime) {
  if (!anime) return false;
  if (anime.mature === true) return true;
  if (anime.mature === false) return false;
  const rating = String(anime.rating || '').toUpperCase();
  return rating.includes('R+') || rating.includes('RX') || rating.includes('18+');
}

/**
 * Classifies an anime's real streaming availability so the UI never misleads users.
 * Returns:
 *  - playability: 'direct-hd' | 'official-youtube' | 'licensed-partner'
 *  - watchableInApp: boolean
 *  - badgeText: string
 *  - reason: string
 *  - legalLinks: Array<{ name: string, url: string, region: string }>
 */
export function getAvailabilityStatus(anime) {
  if (!anime) {
    return {
      playability: 'licensed-partner',
      watchableInApp: false,
      badgeText: 'Unavailable',
      reason: 'Title metadata unavailable.',
      legalLinks: []
    };
  }

  const seasons = Array.isArray(anime.seasons) ? anime.seasons : [];
  const firstSeasonEps = seasons[0]?.episodes || anime.episodes_list || [];
  const hasDirectMp4 = firstSeasonEps.some(ep => typeof ep?.stream_url === 'string' && ep.stream_url.endsWith('.mp4'));
  const hasYoutubeOrArchive = Boolean(anime.free_url) || firstSeasonEps.some(ep => Boolean(ep?.embed_url || ep?.url));

  const encodedTitle = encodeURIComponent(anime.title || 'anime');
  const defaultLegalLinks = anime.legal_links || [
    { name: 'Crunchyroll', url: `https://www.crunchyroll.com/search?q=${encodedTitle}`, region: 'Global (ex-Asia)' },
    { name: 'Netflix Anime', url: `https://www.netflix.com/search?q=${encodedTitle}`, region: 'Global' },
    { name: 'HIDIVE', url: `https://www.hidive.com/search?q=${encodedTitle}`, region: 'North America / UK' },
    { name: 'YouTube Official', url: anime.free_url || anime.trailer_url || `https://www.youtube.com/results?search_query=${encodedTitle}+official+anime`, region: 'Select Regions' }
  ];

  if (anime.availability_type === 'licensed-partner' || (!hasDirectMp4 && anime.is_free === false)) {
    return {
      playability: 'licensed-partner',
      watchableInApp: false,
      hasTrailer: Boolean(anime.trailer_url || anime.preview_stream_url),
      badgeText: 'Licensed Partner · External Full Episodes',
      reason:
        anime.availability_reason ||
        'Full-length episodes are under regional distribution license on official partner platforms (Crunchyroll, Netflix, HIDIVE, Muse Asia, Ani-One Asia). Promotional trailers are strictly separated and never substituted for full episodes.',
      legalLinks: defaultLegalLinks
    };
  }

  if (hasDirectMp4) {
    return {
      playability: 'direct-hd',
      watchableInApp: true,
      hasTrailer: Boolean(anime.trailer_url),
      badgeText: 'Full Episodes · In-App Stream',
      reason: 'Complete, full-length episode streams verified and playable directly in-app with multi-language subtitles.',
      legalLinks: defaultLegalLinks
    };
  }

  if (hasYoutubeOrArchive) {
    return {
      playability: 'official-youtube',
      watchableInApp: true,
      hasTrailer: Boolean(anime.trailer_url),
      badgeText: 'Official Channel Embed',
      reason: 'Provided via official distributor YouTube / Internet Archive channel (regional restrictions may apply).',
      legalLinks: defaultLegalLinks
    };
  }

  return {
    playability: 'licensed-partner',
    watchableInApp: false,
    hasTrailer: Boolean(anime.trailer_url),
    badgeText: 'Licensed Externally',
    reason: 'Full episodes require an external partner subscription in your territory.',
    legalLinks: defaultLegalLinks
  };
}

/**
 * Resolves all seasons and episodes for an anime title, ensuring backward compatibility
 * with flat `episodes_list` structures.
 */
export function getAnimeSeasons(anime) {
  if (!anime) return [];
  if (Array.isArray(anime.seasons) && anime.seasons.length > 0) {
    return anime.seasons;
  }
  if (Array.isArray(anime.episodes_list) && anime.episodes_list.length > 0) {
    return [
      {
        season_number: 1,
        name: 'Season 1',
        episodes: anime.episodes_list
      }
    ];
  }
  return [];
}

/**
 * Filters and sorts a catalog of anime items by search query, genre, format, and mature visibility.
 */
export function filterCatalog(items, { query = '', genre = 'All', format = 'All', hideMature = false } = {}) {
  if (!Array.isArray(items)) return [];

  const normalizedQuery = String(query || '').trim().toLowerCase();
  const normalizedGenre = String(genre || 'All').trim();
  const normalizedFormat = String(format || 'All').trim();

  return items.filter((item) => {
    if (!item || !item.title) return false;

    if (hideMature && isMatureAnime(item)) {
      return false;
    }

    if (normalizedFormat === 'Playable') {
      const status = getAvailabilityStatus(item);
      if (!status.watchableInApp) return false;
    } else if (normalizedFormat === 'TV') {
      if ((item.format || 'TV') !== 'TV') return false;
    } else if (normalizedFormat === 'Movie') {
      if (item.format !== 'Movie') return false;
    } else if (normalizedFormat === 'Ongoing') {
      if (!item.simulcast && item.status !== 'Ongoing') return false;
    } else if (normalizedFormat === 'Mature') {
      if (!isMatureAnime(item)) return false;
    }

    if (normalizedGenre && normalizedGenre !== 'All') {
      const itemGenres = Array.isArray(item.genres) ? item.genres : [];
      const matchesGenre = itemGenres.some(
        (g) => String(g).toLowerCase() === normalizedGenre.toLowerCase()
      );
      if (!matchesGenre) return false;
    }

    if (normalizedQuery) {
      const titleMatch = String(item.title).toLowerCase().includes(normalizedQuery);
      const jpTitleMatch = String(item.japanese_title || '').toLowerCase().includes(normalizedQuery);
      const synopsisMatch = String(item.synopsis || '').toLowerCase().includes(normalizedQuery);
      const studioMatch = String(item.studio || '').toLowerCase().includes(normalizedQuery);
      const genreMatch = Array.isArray(item.genres) && item.genres.some(g => String(g).toLowerCase().includes(normalizedQuery));
      if (!titleMatch && !jpTitleMatch && !synopsisMatch && !studioMatch && !genreMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Computes and updates watch progress state for a given anime, season, episode, and playback timestamp.
 */
export function updateWatchProgress(
  currentProgressMap,
  {
    animeId,
    seasonNumber = 1,
    episodeNumber = 1,
    totalEpisodes = 12,
    episodeTitle = '',
    resumeSeconds = 0,
    durationSeconds = 960
  }
) {
  const safeMap = currentProgressMap && typeof currentProgressMap === 'object' ? { ...currentProgressMap } : {};
  if (!animeId) return safeMap;

  const ep = Math.max(1, Number(episodeNumber) || 1);
  const season = Math.max(1, Number(seasonNumber) || 1);
  const total = Math.max(ep, Number(totalEpisodes) || 12);
  const safeResume = Math.max(0, Math.floor(Number(resumeSeconds) || 0));
  const safeDuration = Math.max(1, Math.floor(Number(durationSeconds) || 960));

  const epCompletionRatio = Math.min(1, safeResume / safeDuration);
  const progressPercent = Math.min(
    100,
    Math.max(5, Math.round((((ep - 1) + epCompletionRatio) / total) * 100))
  );

  safeMap[String(animeId)] = {
    animeId: String(animeId),
    seasonNumber: season,
    episodeNumber: ep,
    totalEpisodes: total,
    episodeTitle: String(episodeTitle || `Episode ${ep}`),
    resumeSeconds: safeResume,
    durationSeconds: safeDuration,
    progressPercent,
    updatedAt: Date.now()
  };

  return safeMap;
}

/**
 * Formats seconds into MM:SS display string.
 */
export function formatTimestamp(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}
