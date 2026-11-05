/**
 * Video & Episode Registry for Kitsune+ / GPT Astra Anime Club
 *
 * Enforces a strict 1-to-1 mapping between:
 *   Anime ID -> Season ID -> Episode ID -> Authorized Provider -> Media Source
 * and strict separation between FULL EPISODES (`content_type: 'full_episode'`) and TRAILERS (`content_type: 'trailer'`).
 *
 * GUARANTEES
 * 1. Never falls back to Season 1 or Episode 1 when a requested season or episode does not exist.
 * 2. A trailer is never used as an episode source.
 * 3. Only HTTPS streams on an allow-listed host are ever handed to the player.
 * 4. A registry entry is only used when BOTH the id and the exact title match, so an unrelated anime that
 *    happens to share a numeric id can never play another title's video.
 * 5. Sources whose rights could not be confirmed are `quarantined`: they keep their episode list for the
 *    catalog but have no stream and resolve to an honest `source-unverified` state.
 * 6. Verification metadata is never invented. `verified_at`, `http_status` and `mime_type` stay null until a
 *    real check has been run and recorded.
 *
 * NOTE: no source below has been network-tested by this code base. Durations are provider-listed values;
 * the player replaces them with the real media duration on load.
 */

export function formatDurationSeconds(totalSeconds) {
  const sec = Math.round(Number(totalSeconds) || 0);
  if (sec <= 0) return 'Unverified';
  const mins = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  return remSec > 0 ? `${mins}m ${remSec}s` : `${mins}m`;
}

/** No shared/universal subtitle tracks exist; subtitles are only ever attached per verified media source. */
export const DEFAULT_SUBTITLES = [];

const ALLOWED_STREAM_HOSTS = ['archive.org', 'supabase.co'];

/** Only HTTPS URLs on an allow-listed host may be played in-app. */
export function isSafeStreamUrl(url) {
  try {
    const u = new URL(String(url));
    return (
      u.protocol === 'https:' &&
      ALLOWED_STREAM_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))
    );
  } catch {
    return false;
  }
}

const norm = (s) => String(s || '').trim().toLowerCase();
function registryMatches(anime, entry) {
  return norm(anime?.title) === norm(entry?.title);
}

/**
 * Verification metadata. Nothing is pre-filled as "checked": a field is null until a real check records it.
 */
export function buildVerificationMetadata({
  providerIdentity = 'unreviewed',
  licenseType = 'Unreviewed',
  authorizationEvidence = null,
  httpStatus = null,
  mimeType = null,
  verifiedAt = null,
  regionalPermissions = [],
  contentClassification = 'japanese_anime',
  status = 'unverified'
} = {}) {
  return {
    verification_status: status,
    verified_at: verifiedAt,
    http_status: httpStatus,
    mime_type: mimeType,
    provider_identity: providerIdentity,
    license_type: licenseType,
    authorization_evidence: authorizationEvidence,
    regional_permissions: regionalPermissions,
    content_classification: contentClassification
  };
}

/**
 * Classifies external partner links honestly so generic search queries or series pages
 * are NEVER mislabeled as verified episode-specific playable streams.
 *
 * Link types: 'in_app_episode' | 'official_episode_embed' | 'external_episode_link' |
 * 'external_series_page' | 'provider_search_query' | 'promotional_trailer'
 */
export function classifyPartnerLinks(rawLinks = [], animeTitle = 'Anime', episodeNumber = 1) {
  const safeTitle = String(animeTitle || 'Anime').trim();
  const epNum = Math.max(1, Number(episodeNumber) || 1);
  const classified = [];

  if (Array.isArray(rawLinks)) {
    for (const link of rawLinks) {
      if (!link || !link.url) continue;
      const urlStr = String(link.url);
      const isSearch =
        urlStr.includes('/search') ||
        urlStr.includes('?q=') ||
        urlStr.includes('?query=') ||
        urlStr.includes('search_query=');
      const linkType = link.link_type || (isSearch ? 'provider_search_query' : 'external_series_page');
      classified.push({
        name: link.name || link.site || 'Official Partner',
        url: urlStr,
        region: link.region || 'Global / Regional License',
        link_type: linkType,
        label:
          linkType === 'provider_search_query'
            ? `Search on ${link.name || link.site || 'Partner'}`
            : `${link.name || link.site || 'Official Series Page'}`
      });
    }
  }

  if (classified.length === 0) {
    const qEp = encodeURIComponent(`${safeTitle} episode ${epNum}`);
    const qTitle = encodeURIComponent(safeTitle);
    classified.push(
      { name: 'Crunchyroll', url: `https://www.crunchyroll.com/search?q=${qEp}`, region: 'Global (ex-Asia)', link_type: 'provider_search_query', label: 'Search on Crunchyroll' },
      { name: 'Netflix Anime', url: `https://www.netflix.com/search?q=${qTitle}`, region: 'Global', link_type: 'provider_search_query', label: 'Search on Netflix' },
      { name: 'HIDIVE', url: `https://www.hidive.com/search?q=${qTitle}`, region: 'North America / UK', link_type: 'provider_search_query', label: 'Search on HIDIVE' },
      { name: 'Muse Asia (YouTube)', url: `https://www.youtube.com/@MuseAsia/search?query=${qTitle}`, region: 'Asia', link_type: 'provider_search_query', label: 'Search Muse Asia Channel' },
      { name: 'Ani-One Asia (YouTube)', url: `https://www.youtube.com/@AniOneAsia/search?query=${qTitle}`, region: 'Asia', link_type: 'provider_search_query', label: 'Search Ani-One Asia Channel' }
    );
  }

  return classified;
}

// ---------------------------------------------------------------------------
// Episode builders
// ---------------------------------------------------------------------------
const Q_RIGHTS =
  'Playback removed: the rights holder\'s authorization for this source could not be confirmed. Use the official partner links instead.';
const Q_REVIEW = 'Playback paused pending a license review. Use the official partner links instead.';

/** A playable full episode (stream must be an allow-listed HTTPS URL). */
const full = (ep, title, synopsis, seconds, url, audio, subtitleStatus) => ({
  ep,
  season: 1,
  content_type: 'full_episode',
  title,
  synopsis,
  duration: formatDurationSeconds(seconds),
  duration_seconds: seconds,
  stream_url: url,
  embed_url: null,
  audio_tracks: [audio],
  subtitle_status: subtitleStatus,
  subtitles: [],
  is_preview_only: false
});

/** A catalog-only episode with NO stream (quarantined). No invented synopsis, duration or tracks. */
const held = (ep, title, reason = Q_RIGHTS) => ({
  ep,
  season: 1,
  content_type: 'full_episode',
  title,
  synopsis: null,
  duration: null,
  duration_seconds: null,
  stream_url: null,
  embed_url: null,
  audio_tracks: [],
  subtitle_status: 'Unverified',
  subtitles: [],
  is_preview_only: false,
  quarantined: true,
  quarantine_reason: reason
});

const heldList = (titles, reason) => titles.map((t, i) => held(i + 1, t, reason));

/** Shared shape for a registry entry. Score/rating/poster are null because they were never sourced. */
const entry = (o) => ({
  romaji_title: o.title,
  japanese_title: '',
  status: 'Completed',
  score: null,
  rating: null,
  mature: false,
  poster_url: null,
  trailer_url: null,
  ...o
});

const quarantinedEntry = (o) =>
  entry({
    is_free: false,
    availability_type: 'partner-only',
    quarantined: true,
    quarantine_reason: o.quarantine_reason || Q_RIGHTS,
    ...o
  });

const freeEntry = (o) => entry({ is_free: true, availability_type: 'direct-hd', ...o });

export const VERIFIED_DIRECT_ANIME = {
  // ---- QUARANTINED: sources removed from playback (rights not confirmed). Episode lists kept for the catalog. ----

  // Fan-subtitled copies of a Tezuka Productions series. Not authorized.
  '1572': quarantinedEntry({
    id: '1572',
    anilist_id: 1572,
    mal_id: 1572,
    title: 'Jungle Emperor Leo (The New Adventures of Kimba)',
    japanese_title: 'ジャングル大帝 (1989)',
    studio: 'Tezuka Productions',
    year: 1989,
    format: 'TV',
    content_classification: 'japanese_anime',
    episodes: 12,
    channel: 'Rights review pending',
    genres: ['Adventure', 'Drama', 'Fantasy'],
    banner_color: '#10b981',
    synopsis: 'The white lion cub Leo journeys back to Africa to protect the peace between wildlife and humanity. Created by Osamu Tezuka.',
    verification: buildVerificationMetadata({ providerIdentity: 'none', licenseType: 'Not authorized (fan-subtitled copy removed)', status: 'quarantined' }),
    legal_links: [],
    seasons: [{ season_number: 1, name: 'Season 1', year: 1989, episodes: heldList(['Birth', 'Promise', 'Departure', 'Friends', 'Homeland', 'Invader', 'Courage', 'Warning', 'Companions', 'Freedom', 'Law', 'Redwings'].map((t, i) => `Episode ${i + 1}: ${t}`)) }]
  }),

  // Syndicated TV series still under copyright (TMS Entertainment). Not authorized.
  '2687': quarantinedEntry({
    id: '2687',
    anilist_id: 2687,
    mal_id: 2687,
    title: 'Shin Tetsujin 28-gō (The New Adventures of Gigantor)',
    romaji_title: 'Taiyou no Shisha Tetsujin 28-gou',
    japanese_title: '太陽の使者 鉄人28号',
    studio: 'Tokyo Movie Shinsha (TMS Entertainment)',
    year: 1980,
    format: 'TV',
    content_classification: 'japanese_anime',
    episodes: 8,
    channel: 'Rights review pending',
    genres: ['Mecha', 'Sci-Fi', 'Action'],
    banner_color: '#3b82f6',
    synopsis: 'Shotaro Kaneda pilots the super robot Tetsujin 28 (Gigantor) by remote control to defend Earth.',
    verification: buildVerificationMetadata({ providerIdentity: 'none', licenseType: 'Not authorized (copy removed)', status: 'quarantined' }),
    legal_links: [],
    seasons: [{ season_number: 1, name: 'Season 1', year: 1980, episodes: heldList(['The Plot to Steal the Sun', 'Hands of the Enemy', 'Deadly Doctor Doom', 'The Robot Birdman', 'The Phantom Robot', 'Monster of the Deep', 'The Crashing Satellite', 'The Dreaded Double Robot'].map((t, i) => `Episode ${i + 1}: ${t}`)) }]
  }),

  // Mixed bundle of copyrighted Tezuka works and an unrelated upload. Not authorized.
  '2747': quarantinedEntry({
    id: '2747',
    anilist_id: 2747,
    mal_id: 2747,
    title: 'Astro Boy (Tetsuwan Atom) & Tezuka Sci-Fi Classics',
    romaji_title: 'Tetsuwan Atom',
    japanese_title: '鉄腕アトム',
    studio: 'Mushi Production · Tezuka Productions',
    year: 1963,
    format: 'TV',
    content_classification: 'japanese_anime',
    episodes: 3,
    channel: 'Rights review pending',
    genres: ['Sci-Fi', 'Action', 'Adventure'],
    banner_color: '#f43f5e',
    synopsis: 'The pioneering television anime by Osamu Tezuka: a robot boy with an atomic heart defends peace between humans and machines.',
    verification: buildVerificationMetadata({ providerIdentity: 'none', licenseType: 'Not authorized (copies removed)', status: 'quarantined' }),
    legal_links: [],
    seasons: [{ season_number: 1, name: 'Season 1', year: 1963, episodes: heldList(['Episode 1: Astro Boy (1963 broadcast)', 'Episode 2: The Silver Comet', 'Episode 3: Fumoon (1980 film)']) }]
  }),

  // Includes a Super Mario anime ripped from YouTube and a Doraemon special ripped from a paid streaming service.
  '3886': quarantinedEntry({
    id: '3886',
    anilist_id: 3886,
    mal_id: 3886,
    title: 'Momotarō & Japanese Folklore Anime Anthology',
    romaji_title: 'Momotarou & Issunboushi Anime Anthology',
    japanese_title: '桃太郎・一寸法師 日本昔ばなしアニメ選集',
    studio: 'Various',
    year: 1989,
    format: 'OVA',
    content_classification: 'japanese_anime',
    episodes: 4,
    channel: 'Rights review pending',
    genres: ['Adventure', 'Fantasy', 'Comedy'],
    banner_color: '#f97316',
    synopsis: 'A mixed set of Momotarō and Issun-bōshi folklore adaptations.',
    quarantine_reason: 'Playback removed: some sources were copies of copyrighted works taken from other services.',
    verification: buildVerificationMetadata({ providerIdentity: 'none', licenseType: 'Not authorized (copies removed)', status: 'quarantined' }),
    legal_links: [],
    seasons: [{ season_number: 1, name: 'Season 1', year: 1989, episodes: heldList(['Episode 1: Momotarō — The Peach Boy', 'Episode 2: Issun-bōshi & Momotarō (1989 OVA)', 'Episode 3: Momotarō, The Peach Boy (educational)', 'Episode 4: Boku, Momotarō no Nanna no Sa (1981 special)'], 'Playback removed: some sources in this set were copies of copyrighted works taken from other services.') }]
  }),

  // Studio-owned feature films. License evidence not established, so playback is paused pending review.
  '4513': quarantinedEntry({
    id: '4513',
    anilist_id: 4513,
    mal_id: 4513,
    title: 'The White Snake Enchantress (Panda and the Magic Serpent)',
    romaji_title: 'Hakujaden',
    japanese_title: '白蛇伝',
    studio: 'Toei Animation',
    year: 1958,
    format: 'Movie',
    content_classification: 'japanese_anime',
    episodes: 1,
    channel: 'License review pending',
    genres: ['Fantasy', 'Romance', 'Adventure'],
    banner_color: '#ec4899',
    synopsis: 'Toei Animation\'s first full-length color feature film. Xu Xian falls in love with Bai-Niang, a white snake spirit who takes human form.',
    quarantine_reason: Q_REVIEW,
    verification: buildVerificationMetadata({ providerIdentity: 'none', licenseType: 'Under review', status: 'quarantined' }),
    legal_links: [],
    seasons: [{ season_number: 1, name: 'Feature film', year: 1958, episodes: [held(1, 'Full movie: Hakujaden', Q_REVIEW)] }]
  }),

  '3902': quarantinedEntry({
    id: '3902',
    anilist_id: 3902,
    mal_id: 3902,
    title: 'Princess Iron Fan (Journey to the West 1941)',
    romaji_title: 'Tie Shan Gong Zhu',
    japanese_title: '鉄扇公主',
    studio: 'Wan Brothers Animation Studio',
    year: 1941,
    format: 'Movie',
    content_classification: 'asian_animation_heritage',
    episodes: 2,
    channel: 'License review pending',
    genres: ['Action', 'Adventure', 'Fantasy'],
    banner_color: '#eab308',
    synopsis: 'The 1941 Chinese animated feature adapting the Flaming Mountains arc of Journey to the West.',
    quarantine_reason: Q_REVIEW,
    verification: buildVerificationMetadata({ providerIdentity: 'none', licenseType: 'Under review', contentClassification: 'asian_animation_heritage', status: 'quarantined' }),
    legal_links: [],
    seasons: [{ season_number: 1, name: 'Feature film', year: 1941, episodes: [held(1, 'Complete feature film', Q_REVIEW), held(2, 'Broadcast cut', Q_REVIEW)] }]
  }),

  // ---- PLAYABLE: openly licensed or public-domain works. Not anime; classified accordingly. ----

  'sintel-dragon-chronicles': freeEntry({
    id: 'sintel-dragon-chronicles',
    title: 'Sintel (Blender Open Animated Film)',
    romaji_title: 'Sintel (Durian Open Movie Project)',
    studio: 'Blender Foundation',
    year: 2010,
    format: 'Movie',
    content_classification: 'open_source_animated_film',
    episodes: 1,
    channel: 'Blender Foundation · Creative Commons',
    genres: ['Fantasy', 'Adventure'],
    banner_color: '#f59e0b',
    synopsis: 'A solitary young woman nurses an injured baby dragon and sets out on a quest to find him. Open movie by the Blender Foundation.',
    trailer_url: 'https://www.youtube-nocookie.com/embed/eRsGyueVLvQ?rel=0',
    verification: buildVerificationMetadata({
      providerIdentity: 'blender-foundation-durian',
      licenseType: 'Creative Commons Attribution 3.0',
      authorizationEvidence: 'https://durian.blender.org',
      regionalPermissions: ['GLOBAL'],
      contentClassification: 'open_source_animated_film',
      status: 'license-documented-unchecked'
    }),
    legal_links: [
      { name: 'Blender Studio Official Page', url: 'https://durian.blender.org', region: 'Creative Commons', link_type: 'external_series_page' },
      { name: 'Internet Archive Master Page', url: 'https://archive.org/details/Sintel', region: 'Open Archive', link_type: 'external_series_page' }
    ],
    seasons: [{ season_number: 1, name: 'Feature film', year: 2010, episodes: [
      full(1, 'Sintel', 'The complete short film.', 888, 'https://archive.org/download/Sintel/sintel-2048-stereo_512kb.mp4', 'English (stereo)', 'No separate subtitle track')
    ] }]
  }),

  'tears-of-steel': freeEntry({
    id: 'tears-of-steel',
    title: 'Tears of Steel (Mango Open Sci-Fi Film)',
    romaji_title: 'Tears of Steel (Blender Mango Project)',
    studio: 'Blender Foundation',
    year: 2012,
    format: 'Movie',
    content_classification: 'open_source_animated_film',
    episodes: 1,
    channel: 'Blender Foundation · Creative Commons',
    genres: ['Sci-Fi'],
    banner_color: '#06b6d4',
    synopsis: 'A sci-fi short with visual effects, set in futuristic Amsterdam. Open movie by the Blender Foundation.',
    trailer_url: 'https://www.youtube-nocookie.com/embed/R6MlUcmOul8?rel=0',
    verification: buildVerificationMetadata({
      providerIdentity: 'blender-foundation-mango',
      licenseType: 'Creative Commons Attribution 3.0',
      authorizationEvidence: 'https://mango.blender.org',
      regionalPermissions: ['GLOBAL'],
      contentClassification: 'open_source_animated_film',
      status: 'license-documented-unchecked'
    }),
    legal_links: [
      { name: 'Mango Studio Official Page', url: 'https://mango.blender.org', region: 'Creative Commons', link_type: 'external_series_page' },
      { name: 'Internet Archive Master Page', url: 'https://archive.org/details/Tears-of-Steel', region: 'Open Archive', link_type: 'external_series_page' }
    ],
    seasons: [{ season_number: 1, name: 'Feature film', year: 2012, episodes: [
      full(1, 'Tears of Steel', 'The complete short film.', 734, 'https://archive.org/download/Tears-of-Steel/tears_of_steel_720p.mp4', 'English (stereo)', 'No separate subtitle track')
    ] }]
  }),

  'elephants-dream': freeEntry({
    id: 'elephants-dream',
    title: 'Elephants Dream (Orange Open Animated Film)',
    romaji_title: 'Elephants Dream (Blender Orange Project)',
    studio: 'Blender Foundation',
    year: 2006,
    format: 'Movie',
    content_classification: 'open_source_animated_film',
    episodes: 1,
    channel: 'Blender Foundation · Creative Commons',
    genres: ['Sci-Fi'],
    banner_color: '#8b5cf6',
    synopsis: 'A surreal short about two men exploring an enormous machine. Open movie by the Blender Foundation.',
    trailer_url: 'https://www.youtube-nocookie.com/embed/efrp514mJLE?rel=0',
    verification: buildVerificationMetadata({
      providerIdentity: 'blender-foundation-orange',
      licenseType: 'Creative Commons Attribution 2.5',
      authorizationEvidence: 'https://orange.blender.org',
      regionalPermissions: ['GLOBAL'],
      contentClassification: 'open_source_animated_film',
      status: 'license-documented-unchecked'
    }),
    legal_links: [
      { name: 'Orange Studio Official Page', url: 'https://orange.blender.org', region: 'Creative Commons', link_type: 'external_series_page' },
      { name: 'Internet Archive Master Page', url: 'https://archive.org/details/ElephantsDream', region: 'Open Archive', link_type: 'external_series_page' }
    ],
    seasons: [{ season_number: 1, name: 'Short film', year: 2006, episodes: [
      full(1, 'Elephants Dream', 'The complete short film.', 654, 'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4', 'English (stereo)', 'No separate subtitle track')
    ] }]
  }),

  'popeye-sailor-chronicles': freeEntry({
    id: 'popeye-sailor-chronicles',
    title: 'Popeye the Sailor (Fleischer Technicolor Specials)',
    romaji_title: 'Fleischer Studios Classic Theatrical Animation',
    studio: 'Fleischer Studios',
    year: 1936,
    format: 'TV',
    content_classification: 'classic_theatrical_animation',
    episodes: 5,
    channel: 'Public-domain claim · Internet Archive',
    genres: ['Comedy', 'Adventure'],
    banner_color: '#ef4444',
    synopsis: 'Classic Fleischer Studios Popeye cartoons. The three Technicolor two-reel specials are listed as US public domain; the two shorter cartoons are paused pending a license check.',
    verification: buildVerificationMetadata({
      providerIdentity: 'internet-archive-popeye',
      licenseType: 'Claimed US public domain (needs legal review)',
      authorizationEvidence: 'https://archive.org/details/popeye-pubdomain',
      regionalPermissions: ['US'],
      contentClassification: 'classic_theatrical_animation',
      status: 'license-claim-unreviewed'
    }),
    legal_links: [{ name: 'Internet Archive (Popeye collection)', url: 'https://archive.org/details/popeye-pubdomain', region: 'US public domain claim', link_type: 'external_series_page' }],
    seasons: [{ season_number: 1, name: 'Specials', year: 1936, episodes: [
      full(1, 'Popeye the Sailor Meets Sindbad the Sailor', 'The 1936 two-reel Technicolor special.', 974, 'https://archive.org/download/PopeyeTheSailorMeetsSindbadTheSailor1936/Popeye%20the%20Sailor%20Meets%20Sindbad%20the%20Sailor%20(1936).mp4', 'English (mono)', 'No separate subtitle track'),
      full(2, 'Popeye the Sailor Meets Ali Baba\'s Forty Thieves', 'The 1937 two-reel Technicolor special.', 1018, 'https://archive.org/download/PopeyeAliBaba/PopeyeAliBaba_512kb.mp4', 'English (mono)', 'No separate subtitle track'),
      full(3, 'Aladdin and His Wonderful Lamp', 'The 1939 two-reel Technicolor special.', 1306, 'https://archive.org/download/popeye-pubdomain/Aladdin-and-His-Wonderful-Lamp.mp4', 'English (mono)', 'No separate subtitle track'),
      held(4, 'Ancient Fistory', Q_REVIEW),
      held(5, 'A Date to Skate', Q_REVIEW)
    ] }]
  }),

  'superman-1941-fleischer': freeEntry({
    id: 'superman-1941-fleischer',
    title: 'Superman (Fleischer Theatrical Series 1941–1942)',
    romaji_title: 'Fleischer Studios Theatrical Animation',
    studio: 'Fleischer Studios',
    year: 1941,
    format: 'TV',
    content_classification: 'classic_theatrical_animation',
    episodes: 6,
    channel: 'Public-domain claim · Internet Archive',
    genres: ['Action', 'Sci-Fi', 'Adventure'],
    banner_color: '#2563eb',
    synopsis: 'The 1941–1942 theatrical cartoons by Max and Dave Fleischer, listed as US public domain.',
    verification: buildVerificationMetadata({
      providerIdentity: 'internet-archive-fleischer-superman',
      licenseType: 'Claimed US public domain (needs legal review)',
      authorizationEvidence: 'https://archive.org/details/superman_1941',
      regionalPermissions: ['US'],
      contentClassification: 'classic_theatrical_animation',
      status: 'license-claim-unreviewed'
    }),
    legal_links: [{ name: 'Internet Archive (Superman 1941 collection)', url: 'https://archive.org/details/superman_1941', region: 'US public domain claim', link_type: 'external_series_page' }],
    seasons: [{ season_number: 1, name: 'Theatrical shorts', year: 1941, episodes: [
      full(1, 'The Mad Scientist', 'The 1941 premiere cartoon.', 621, 'https://archive.org/download/superman_1941/superman_1941_512kb.mp4', 'English (mono)', 'No separate subtitle track'),
      full(2, 'The Mechanical Monsters', 'Flying robots attack the city.', 611, 'https://archive.org/download/Superman_Mechanical-Monsters/CARTOON-Superman_Mechanical-Monsters.mp4', 'English (mono)', 'No separate subtitle track'),
      full(3, 'The Arctic Giant', 'A thawed dinosaur rampages through Metropolis.', 513, 'https://archive.org/download/superman_arctic_giant/arctic_giant.mp4', 'English (mono)', 'No separate subtitle track'),
      full(4, 'The Magnetic Telescope', 'A comet is pulled toward Earth.', 460, 'https://archive.org/download/Superman_The_Magnetic_Telescope/Superman_The_Magnetic_Telescope_512kb.mp4', 'English (mono)', 'No separate subtitle track'),
      full(5, 'Volcano', 'A volcano erupts while Lois Lane is trapped on the mountain.', 464, 'https://archive.org/download/superman_volcano/Superman-08-Volcano_512kb.mp4', 'English (mono)', 'No separate subtitle track'),
      full(6, 'Terror on the Midway', 'A giant gorilla escapes at the circus.', 481, 'https://archive.org/download/superman_terror_on_the_midway/Superman-09-Terror_on_the_Midway_512kb.mp4', 'English (mono)', 'No separate subtitle track')
    ] }]
  })
};

// Give every episode a canonical id and its own verification record (never marked verified without a real check).
for (const [animeKey, e] of Object.entries(VERIFIED_DIRECT_ANIME)) {
  for (const season of e.seasons || []) {
    for (const ep of season.episodes || []) {
      if (!ep.id) ep.id = `${e.id || animeKey}:s${season.season_number}:e${ep.ep}`;
      if (!ep.verification) {
        ep.verification = {
          ...(e.verification || buildVerificationMetadata()),
          duration_seconds: ep.duration_seconds,
          stream_url: ep.stream_url
        };
      }
    }
  }
}

function unavailableResult(base, extra) {
  return {
    available: false,
    contentType: 'unavailable',
    mediaSourceId: null,
    streamUrl: null,
    embedUrl: null,
    durationSeconds: null,
    audioTracks: [],
    subtitles: [],
    subtitleStatus: 'Unavailable',
    sourceType: 'unavailable',
    ...base,
    ...extra
  };
}

/**
 * Centralized playback resolution:
 * Anime ID -> Season ID -> Episode ID -> Provider -> Media source.
 * Never falls back to Season 1 / Episode 1, never uses a trailer as an episode, and never plays a
 * stream that is not an allow-listed HTTPS URL.
 */
export function resolveEpisodeVideoSync({ anime, seasonNumber = 1, episodeNumber = 1 }) {
  if (!anime) {
    return unavailableResult(
      { seasonNumber: Number(seasonNumber) || 1, episodeNumber: Number(episodeNumber) || 1, legalLinks: [] },
      { sourceStatus: 'no-anime-selected', reason: 'No anime selected.' }
    );
  }

  const sNum = Number(seasonNumber);
  const epNum = Number(episodeNumber);
  const animeIdStr = String(anime.id || anime.anilist_id || '');
  const malIdStr = anime.mal_id ? String(anime.mal_id) : null;

  if (!Number.isInteger(sNum) || sNum < 1 || !Number.isInteger(epNum) || epNum < 1) {
    return unavailableResult(
      {
        animeId: animeIdStr,
        seasonNumber: sNum,
        episodeNumber: epNum,
        seasonId: `${animeIdStr}:s${seasonNumber}`,
        episodeId: `${animeIdStr}:s${seasonNumber}:e${episodeNumber}`,
        providerId: 'none',
        legalLinks: classifyPartnerLinks(anime.legal_links, anime.title, 1)
      },
      { sourceStatus: 'invalid-request', reason: `Invalid season (${seasonNumber}) or episode (${episodeNumber}) requested.` }
    );
  }

  const canonicalSeasonId = `${animeIdStr}:s${sNum}`;
  const canonicalEpisodeId = `${canonicalSeasonId}:e${epNum}`;

  // 1. Local registry: id (or MAL id) AND exact title must match, so a different anime can never inherit a video.
  let localDirect =
    VERIFIED_DIRECT_ANIME[animeIdStr] ||
    (malIdStr && VERIFIED_DIRECT_ANIME[malIdStr]?.mal_id === Number(malIdStr)
      ? VERIFIED_DIRECT_ANIME[malIdStr]
      : null);
  if (localDirect && !registryMatches(anime, localDirect)) localDirect = null;

  if (localDirect) {
    const baseIds = {
      animeId: animeIdStr,
      seasonNumber: sNum,
      episodeNumber: epNum,
      seasonId: canonicalSeasonId,
      episodeId: canonicalEpisodeId,
      providerId: localDirect.verification?.provider_identity || 'none',
      officialTrailer: localDirect.trailer_url || null,
      trailerContentType: localDirect.trailer_url ? 'trailer' : null,
      legalLinks: classifyPartnerLinks(localDirect.legal_links, localDirect.title, epNum),
      title: localDirect.title
    };

    // STRICT EXACT LOOKUP: never fall back to seasons[0] or episodes[0].
    const exactSeason = localDirect.seasons.find((s) => Number(s.season_number) === sNum);
    if (!exactSeason) {
      return unavailableResult(baseIds, {
        sourceStatus: 'season-missing',
        episodeTitle: `Season ${sNum}, Episode ${epNum} (Unavailable)`,
        reason: `Season ${sNum} is not available for "${localDirect.title}". Available seasons: ${localDirect.seasons.map((s) => s.season_number).join(', ')}.`
      });
    }

    const exactEp = exactSeason.episodes.find((e) => Number(e.ep) === epNum);
    if (!exactEp) {
      return unavailableResult(baseIds, {
        sourceStatus: 'episode-missing',
        episodeTitle: `Episode ${epNum} (Unavailable)`,
        reason: `Episode ${epNum} of Season ${sNum} is not listed for "${localDirect.title}" (listed episodes: ${exactSeason.episodes.map((e) => e.ep).join(', ')}).`
      });
    }

    if (exactEp.quarantined || localDirect.quarantined || !exactEp.stream_url || !isSafeStreamUrl(exactEp.stream_url)) {
      return unavailableResult(baseIds, {
        sourceStatus: 'source-unverified',
        contentType: 'external_licensed_episode',
        episodeTitle: exactEp.title,
        reason: exactEp.quarantine_reason || localDirect.quarantine_reason || Q_RIGHTS
      });
    }

    return {
      ...baseIds,
      available: true,
      contentType: 'full_episode',
      contentClassification: localDirect.content_classification || 'japanese_anime',
      mediaSourceId: `${canonicalEpisodeId}:full-mp4`,
      sourceStatus: 'verified-playable',
      verification: exactEp.verification || localDirect.verification || buildVerificationMetadata(),
      streamUrl: exactEp.stream_url,
      embedUrl: null, // episodes never use trailer embeds as their source
      durationSeconds: exactEp.duration_seconds,
      durationFormatted: exactEp.duration || formatDurationSeconds(exactEp.duration_seconds),
      episodeTitle: exactEp.title,
      synopsis: exactEp.synopsis,
      audioTracks: exactEp.audio_tracks || [],
      subtitleStatus: exactEp.subtitle_status || 'No separate subtitle track',
      subtitles: Array.isArray(exactEp.subtitles) ? exactEp.subtitles : [],
      provider: localDirect.channel,
      sourceType: 'direct-hd'
    };
  }

  // 2. A catalog object carrying its own seasons/episodes.
  if (Array.isArray(anime.seasons) && anime.seasons.length > 0) {
    const exactSeason = anime.seasons.find((s) => Number(s.season_number) === sNum);
    if (!exactSeason) {
      return unavailableResult(
        {
          animeId: animeIdStr,
          seasonNumber: sNum,
          episodeNumber: epNum,
          seasonId: canonicalSeasonId,
          episodeId: canonicalEpisodeId,
          providerId: 'none',
          officialTrailer: anime.trailer_url || null,
          trailerContentType: anime.trailer_url ? 'trailer' : null,
          legalLinks: classifyPartnerLinks(anime.legal_links, anime.title, epNum),
          title: anime.title
        },
        {
          sourceStatus: 'season-missing',
          episodeTitle: `Season ${sNum}, Episode ${epNum} (Unavailable)`,
          reason: `Season ${sNum} is not available for "${anime.title}".`
        }
      );
    }

    const exactEp = exactSeason.episodes?.find((e) => Number(e.ep) === epNum);
    if (
      exactEp?.stream_url &&
      exactEp.content_type !== 'trailer' &&
      !exactEp.quarantined &&
      isSafeStreamUrl(exactEp.stream_url)
    ) {
      return {
        available: true,
        contentType: 'full_episode',
        contentClassification: anime.content_classification || 'japanese_anime',
        animeId: animeIdStr,
        seasonNumber: sNum,
        episodeNumber: epNum,
        seasonId: canonicalSeasonId,
        episodeId: canonicalEpisodeId,
        providerId: anime.provider_id || 'unreviewed',
        mediaSourceId: `${canonicalEpisodeId}:custom`,
        sourceStatus: 'verified-playable',
        verification: anime.verification || buildVerificationMetadata(),
        streamUrl: exactEp.stream_url,
        embedUrl: null,
        officialTrailer: anime.trailer_url || null,
        trailerContentType: anime.trailer_url ? 'trailer' : null,
        durationSeconds: exactEp.duration_seconds || null,
        durationFormatted: exactEp.duration || formatDurationSeconds(exactEp.duration_seconds),
        episodeTitle: exactEp.title,
        synopsis: exactEp.synopsis,
        audioTracks: exactEp.audio_tracks || [],
        subtitleStatus: exactEp.subtitle_status || 'No separate subtitle track',
        subtitles: Array.isArray(exactEp.subtitles) ? exactEp.subtitles : [],
        legalLinks: classifyPartnerLinks(anime.legal_links, anime.title, epNum),
        provider: anime.channel || null,
        title: anime.title,
        sourceType: 'direct-hd'
      };
    }
  }

  // 3. Honest external-partner state. A trailer is never substituted for an episode.
  const hasTrailer = Boolean(anime.trailer_url);
  const exactSeason = Array.isArray(anime.seasons)
    ? anime.seasons.find((s) => Number(s.season_number) === sNum)
    : null;
  const exactEp = exactSeason?.episodes?.find((e) => Number(e.ep) === epNum);

  return {
    available: false,
    contentType: 'external_licensed_episode',
    animeId: animeIdStr,
    seasonId: canonicalSeasonId,
    episodeId: canonicalEpisodeId,
    providerId: exactEp?.provider_id || 'external-partner',
    mediaSourceId: null,
    sourceStatus: 'external-partner',
    streamUrl: null,
    embedUrl: null,
    durationSeconds: null,
    episodeTitle: exactEp?.title || `Episode ${epNum}`,
    synopsis: exactEp?.synopsis || anime.synopsis,
    audioTracks: exactEp?.audio_tracks || [],
    subtitleStatus: 'Provided on the partner platform',
    subtitles: [],
    externalEpisodeUrl: exactEp?.external_episode_url || null,
    externalLinkType: exactEp?.external_episode_url ? 'external_episode_link' : 'provider_search_query',
    reason: `No in-app video is available for "${anime.title}" (Season ${sNum}, Episode ${epNum}). Full episodes are on authorized partner platforms. Trailers are never substituted for full episodes.`,
    officialTrailer: hasTrailer ? anime.trailer_url : null,
    trailerContentType: hasTrailer ? 'trailer' : null,
    legalLinks: classifyPartnerLinks(anime.legal_links, anime.title, epNum),
    title: anime.title,
    sourceType: 'partner-only'
  };
}

/**
 * Async resolution. The registry is fully local, so this resolves from the same logic. (A previous branch
 * queried an `episodes` table with columns that do not exist in the live schema; it always failed, adding a
 * wasted network request on every selection, so it was removed.)
 */
export async function resolveEpisodeVideo(args) {
  return resolveEpisodeVideoSync(args);
}
