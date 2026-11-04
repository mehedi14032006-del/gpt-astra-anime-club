/**
 * Jikan v4 REST API Client & Cross-API Catalog Deduplication Engine
 *
 * Official Endpoint: https://api.jikan.moe/v4
 *
 * Capabilities:
 * - Fetches supplementary MyAnimeList (MAL) metadata, episodes, and recommendations
 * - Rate-limit aware with exponential backoff and in-memory caching
 * - Normalizes Jikan anime entries to the standard Kitsune+ / GPT Astra Anime Club schema
 * - Cross-references and deduplicates AniList + Jikan + Curated records by anilist_id, mal_id, and normalized title
 */

import { sanitizeAniListDescription } from './anilistClient.js';

const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
const JIKAN_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const jikanCache = new Map();
const jikanInFlight = new Map();

/**
 * Normalizes a title string for cross-API deduplication
 */
export function normalizeTitleKey(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, '')
    .trim();
}

/**
 * Executes a rate-limit safe GET request against Jikan v4 API
 */
export async function fetchJikan(endpoint, { useCache = true, timeoutMs = 6000 } = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${JIKAN_BASE_URL}${endpoint}`;

  if (useCache && jikanCache.has(url)) {
    const entry = jikanCache.get(url);
    if (Date.now() - entry.timestamp < JIKAN_CACHE_TTL_MS) {
      return entry.data;
    }
    jikanCache.delete(url);
  }

  if (jikanInFlight.has(url)) {
    return jikanInFlight.get(url);
  }

  const requestPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });

      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 1200));
        throw new Error('Jikan API rate limit reached (HTTP 429).');
      }

      if (!response.ok) {
        throw new Error(`Jikan API HTTP ${response.status}`);
      }

      const json = await response.json();
      if (useCache && json) {
        jikanCache.set(url, { data: json, timestamp: Date.now() });
      }
      return json;
    } finally {
      clearTimeout(timer);
      jikanInFlight.delete(url);
    }
  })();

  jikanInFlight.set(url, requestPromise);
  return requestPromise;
}

/**
 * Maps a Jikan v4 anime item into the unified Kitsune+ anime schema
 */
export function mapJikanMediaToAnime(jikanItem, curatedDirectMatches = {}) {
  if (!jikanItem || !jikanItem.mal_id) return null;

  const malIdStr = String(jikanItem.mal_id);
  const directMatch = curatedDirectMatches[malIdStr] || null;

  const titleEnglish =
    jikanItem.title_english || jikanItem.title || directMatch?.title || 'Untitled Anime';
  const titleRomaji = jikanItem.title || titleEnglish;
  const titleNative = jikanItem.title_japanese || '';

  const isAdult =
    Boolean(jikanItem.rating?.includes('Rx')) ||
    Boolean(jikanItem.genres?.some((g) => g.name === 'Hentai' || g.name === 'Erotica'));

  const format =
    jikanItem.type === 'Movie'
      ? 'Movie'
      : jikanItem.type === 'OVA' || jikanItem.type === 'ONA'
      ? jikanItem.type
      : 'TV';

  const score = jikanItem.score
    ? Number(Number(jikanItem.score).toFixed(1))
    : directMatch?.score || 7.8;

  const poster =
    jikanItem.images?.webp?.large_image_url ||
    jikanItem.images?.jpg?.large_image_url ||
    directMatch?.poster_url ||
    '';

  const trailerYoutubeId = jikanItem.trailer?.youtube_id;
  const trailerUrl = trailerYoutubeId
    ? `https://www.youtube-nocookie.com/embed/${trailerYoutubeId}?rel=0`
    : directMatch?.trailer_url || '';

  const isDirectPlayable = Boolean(
    directMatch?.availability_type === 'direct-hd' && directMatch?.seasons
  );

  const seasons = isDirectPlayable && directMatch.seasons
    ? directMatch.seasons
    : [];

  return {
    id: directMatch?.id || `mal-${malIdStr}`,
    mal_id: jikanItem.mal_id,
    anilist_id: directMatch?.anilist_id || null,
    title: titleEnglish,
    romaji_title: titleRomaji,
    japanese_title: titleNative,
    studio: jikanItem.studios?.[0]?.name || directMatch?.studio || 'Animation Studio',
    year: jikanItem.year || jikanItem.aired?.prop?.from?.year || 2024,
    format,
    content_classification: directMatch?.content_classification || 'japanese_anime',
    status: jikanItem.airing ? 'Ongoing' : 'Completed',
    episodes: isDirectPlayable ? directMatch.episodes : (jikanItem.episodes || null),
    episodes_metadata_status: isDirectPlayable ? 'verified_in_app_streams' : 'catalog_count_only',
    score,
    rating: isAdult ? 'R+ 18+' : jikanItem.rating || 'PG-13',
    mature: isAdult,
    is_free: isDirectPlayable,
    availability_type: isDirectPlayable ? 'direct-hd' : 'licensed-partner',
    simulcast: Boolean(jikanItem.airing),
    channel: isDirectPlayable
      ? directMatch.channel || 'Kitsune+ Full Episode Archive'
      : 'MyAnimeList / Jikan · Licensed Partner',
    genres: (jikanItem.genres || []).map((g) => g.name),
    poster_url: poster,
    banner_url: jikanItem.trailer?.images?.maximum_image_url || poster,
    banner_color: '#F43F5E',
    trailer_url: trailerUrl,
    trailer_content_type: trailerUrl ? 'trailer' : null,
    synopsis: sanitizeAniListDescription(jikanItem.synopsis || directMatch?.synopsis || ''),
    seasons
  };
}

/**
 * Deduplicates and merges anime lists across AniList, Jikan (MAL), and internal curated records.
 * Prevents duplicate cards when an anime has both an AniList ID and a MAL ID.
 */
export function deduplicateCrossApiCatalog(items = []) {
  if (!Array.isArray(items)) return [];

  const seenIds = new Set();
  const seenAnilistIds = new Set();
  const seenMalIds = new Set();
  const seenTitleKeys = new Set();
  const result = [];

  for (const item of items) {
    if (!item || !item.title) continue;

    const idKey = item.id ? String(item.id) : null;
    const anilistKey = item.anilist_id ? String(item.anilist_id) : null;
    const malKey = item.mal_id ? String(item.mal_id) : null;
    const titleKey = `${normalizeTitleKey(item.title)}:${item.format || 'TV'}`;

    if (idKey && seenIds.has(idKey)) continue;
    if (anilistKey && seenAnilistIds.has(anilistKey)) continue;
    if (malKey && seenMalIds.has(malKey)) continue;
    if (titleKey.length > 4 && seenTitleKeys.has(titleKey)) continue;

    if (idKey) seenIds.add(idKey);
    if (anilistKey) seenAnilistIds.add(anilistKey);
    if (malKey) seenMalIds.add(malKey);
    if (titleKey.length > 4) seenTitleKeys.add(titleKey);

    result.push(item);
  }

  return result;
}
