/**
 * Curated Anime Library for Kitsune+
 *
 * Implements strict anime-to-video source separation:
 * 1. Verified Direct Playable Anime: Each has its OWN distinct, authenticated video stream files.
 *    No two anime titles share the same video.
 * 2. Licensed Partner Anime (AniList / Official Distributors): Honestly labeled as 'licensed-partner',
 *    pointing to legitimate external distributor links (Crunchyroll, Netflix, HIDIVE) and verified
 *    official YouTube trailer embeds. Zero fake stream fallbacks or placeholder video reuse.
 */

import { VERIFIED_DIRECT_ANIME } from '../lib/videoRegistry.js';

export const SUBTITLE_TRACKS = [
  { kind: 'subtitles', label: 'English (Official Sub)', srcLang: 'en', src: '/streams/subs-en.vtt', default: true },
  { kind: 'subtitles', label: '日本語 (Japanese CC)', srcLang: 'ja', src: '/streams/subs-jp.vtt', default: false },
  { kind: 'subtitles', label: 'Español (Latino / ES)', srcLang: 'es', src: '/streams/subs-es.vtt', default: false }
];

function buildPartnerSeasonsForTitle({
  trailerUrl,
  seasonConfigs
}) {
  return seasonConfigs.map((sConfig) => ({
    season_number: sConfig.season_number,
    name: sConfig.name,
    year: sConfig.year,
    episodes: sConfig.episodes.map((epMeta, idx) => {
      const epNum = idx + 1;
      return {
        ep: epNum,
        season: sConfig.season_number,
        title: epMeta.title,
        synopsis: epMeta.synopsis,
        duration: epMeta.duration || '24m',
        duration_seconds: epMeta.duration_seconds || 1440,
        air_date: epMeta.air_date || `${sConfig.year || 2024}`,
        audio_tracks: ['Japanese (Original Audio)', 'English Dub'],
        stream_url: null, // Strictly null: Licensed titles do not host unauthorized in-app video streams
        embed_url: trailerUrl || null,
        subtitles: SUBTITLE_TRACKS,
        is_preview_only: true
      };
    })
  }));
}

export const CURATED_ANIME = [
  // 1. Sintel (The Dragon Warrior) - Direct HD In-App Playable
  VERIFIED_DIRECT_ANIME['sintel-dragon-chronicles'],

  // 2. Tears of Steel (Neo-Amsterdam Mecha) - Direct HD In-App Playable
  VERIFIED_DIRECT_ANIME['tears-of-steel'],

  // 3. Elephants Dream (The Mechanical Labyrinth) - Direct HD In-App Playable
  VERIFIED_DIRECT_ANIME['elephants-dream'],

  // 4. Popeye the Sailor (Classic Chronicles) - Direct HD In-App Playable
  VERIFIED_DIRECT_ANIME['popeye-sailor-chronicles'],

  // 5. Superman (The Fleischer Golden Era) - Direct HD In-App Playable
  VERIFIED_DIRECT_ANIME['superman-1941-fleischer'],

  // 6. Frieren: Beyond Journey's End - Licensed Partner Spotlight
  {
    id: '52991',
    mal_id: 52991,
    title: "Frieren: Beyond Journey's End",
    japanese_title: '葬送のフリーレン',
    studio: 'Madhouse',
    year: 2023,
    format: 'TV',
    status: 'Completed',
    episodes: 28,
    score: 9.31,
    rating: 'PG-13',
    mature: false,
    is_free: false,
    availability_type: 'licensed-partner',
    simulcast: true,
    channel: 'Licensed Partner · Official Trailer In-App',
    genres: ['Adventure', 'Drama', 'Fantasy'],
    poster_url: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
    banner_color: '#67e8f9',
    free_url: '',
    trailer_url: 'https://www.youtube-nocookie.com/embed/ZEkwCGJ3o7M?rel=0',
    synopsis:
      'After a ten-year quest alongside the hero Himmel and his party, the elven mage Frieren defeats the Demon King and brings peace to the realm. Immortal and unhurried by human time, she embarks on a new journey to understand the fleeting hearts of the companions she once knew.',
    legal_links: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GG5H5XMQ5/frieren-beyond-journeys-end', region: 'Global' },
      { name: 'Netflix', url: 'https://www.netflix.com/title/81726714', region: 'Selected Regions' }
    ],
    seasons: buildPartnerSeasonsForTitle({
      trailerUrl: 'https://www.youtube-nocookie.com/embed/ZEkwCGJ3o7M?rel=0',
      seasonConfigs: [
        {
          season_number: 1,
          name: 'Season 1 · Cour 1: The Journey Begins',
          year: 2023,
          episodes: [
            { title: "The Journey's End", duration: '24m', duration_seconds: 1440, synopsis: 'The Hero Party returns victorious to the royal capital as a fifty-year meteor shower illuminates the sky.' },
            { title: "It Didn't Have to Be Magic...", duration: '24m', duration_seconds: 1440, synopsis: 'Frieren takes young Fern as her apprentice and deciphers a legendary grimoire.' },
            { title: 'Killing Magic', duration: '24m', duration_seconds: 1440, synopsis: 'Frieren and Fern unseal Qual, the Elder Sage of Corruption, who invented Zoltraak.' },
            { title: 'The Land Where Souls Rest', duration: '24m', duration_seconds: 1440, synopsis: 'Seeking Aureole at the northernmost edge of the continent, Frieren visits Eisen.' }
          ]
        }
      ]
    })
  },

  // 7. Solo Leveling - Licensed Partner
  {
    id: '52299',
    mal_id: 52299,
    title: 'Solo Leveling',
    japanese_title: '俺だけレベルアップな件',
    studio: 'A-1 Pictures',
    year: 2024,
    format: 'TV',
    status: 'Ongoing',
    episodes: 25,
    score: 8.62,
    rating: 'R - 17+',
    mature: false,
    is_free: false,
    availability_type: 'licensed-partner',
    simulcast: true,
    channel: 'Licensed Partner · Official Trailer In-App',
    genres: ['Action', 'Adventure', 'Fantasy'],
    poster_url: 'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
    banner_color: '#818cf8',
    free_url: '',
    trailer_url: 'https://www.youtube-nocookie.com/embed/bssSj4cKsrI?rel=0',
    synopsis:
      'In a world where hunters must battle deadly monsters inside dimensional Gates, Sung Jinwoo—known as the weakest hunter of all mankind—survives a brutal double dungeon and awakens a secret System that allows him alone to level up without limit.',
    legal_links: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GEXH3W20Z/solo-leveling', region: 'Global' }
    ],
    seasons: buildPartnerSeasonsForTitle({
      trailerUrl: 'https://www.youtube-nocookie.com/embed/bssSj4cKsrI?rel=0',
      seasonConfigs: [
        {
          season_number: 1,
          name: 'Season 1: Awakening of the Shadow Monarch',
          year: 2024,
          episodes: [
            { title: "I'm Used to It", duration: '24m', duration_seconds: 1440, synopsis: 'E-Rank Hunter Sung Jinwoo enters a routine raid that conceals a hidden double lair.' },
            { title: 'If I Had One More Chance', duration: '24m', duration_seconds: 1440, synopsis: 'Faced with the giant stone tablets of the Cartenon Temple, Jinwoo solves the three commandments.' },
            { title: "It's Like a Game", duration: '24m', duration_seconds: 1440, synopsis: 'Jinwoo awakens in a hospital bed with a floating quest interface only he can see.' },
            { title: "I've Gotta Get Stronger", duration: '24m', duration_seconds: 1440, synopsis: 'Inside the Instant Dungeon of Hapjeong Station, Jinwoo battles the Blue Venom-Fanged Kasaka.' }
          ]
        }
      ]
    })
  },

  // 8. Spy × Family - Licensed Partner
  {
    id: '50265',
    mal_id: 50265,
    title: 'Spy × Family',
    japanese_title: 'SPY×FAMILY',
    studio: 'Wit Studio · CloverWorks',
    year: 2022,
    format: 'TV',
    status: 'Completed',
    episodes: 37,
    score: 8.58,
    rating: 'PG-13',
    mature: false,
    is_free: false,
    availability_type: 'licensed-partner',
    simulcast: false,
    channel: 'Licensed Partner · Official Trailer In-App',
    genres: ['Action', 'Comedy'],
    poster_url: 'https://cdn.myanimelist.net/images/anime/1441/122795l.jpg',
    banner_color: '#fb7185',
    free_url: '',
    trailer_url: 'https://www.youtube-nocookie.com/embed/ofXigq9aIpo?rel=0',
    synopsis:
      'Master spy Twilight must build a fake family to infiltrate an elite private academy. Unbeknownst to him, the daughter he adopts is a telepath and the woman he agrees to marry is a lethal assassin.',
    legal_links: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/G4PH0WXPX/spy-x-family', region: 'Global' }
    ],
    seasons: buildPartnerSeasonsForTitle({
      trailerUrl: 'https://www.youtube-nocookie.com/embed/ofXigq9aIpo?rel=0',
      seasonConfigs: [
        {
          season_number: 1,
          name: 'Season 1: Operation Strix',
          year: 2022,
          episodes: [
            { title: 'Operation Strix', duration: '24m', duration_seconds: 1440, synopsis: 'Agent Twilight adopts Anya from an orphanage to approach target Donovan Desmond.' },
            { title: 'Secure a Wife', duration: '24m', duration_seconds: 1440, synopsis: 'Loid and Yor forge a marriage covenant amid a hail of celebratory grenades.' }
          ]
        }
      ]
    })
  },

  // 9. Dandadan - Licensed Partner
  {
    id: '57334',
    mal_id: 57334,
    title: 'Dandadan',
    japanese_title: 'ダンダダン',
    studio: 'Science SARU',
    year: 2024,
    format: 'TV',
    status: 'Ongoing',
    episodes: 12,
    score: 8.75,
    rating: 'R - 17+',
    mature: false,
    is_free: false,
    availability_type: 'licensed-partner',
    simulcast: true,
    channel: 'Licensed Partner · Official Trailer In-App',
    genres: ['Action', 'Comedy', 'Sci-Fi'],
    poster_url: 'https://cdn.myanimelist.net/images/anime/1584/143719l.jpg',
    banner_color: '#f43f5e',
    free_url: '',
    trailer_url: 'https://www.youtube-nocookie.com/embed/0XJxfbN36Uw?rel=0',
    synopsis:
      'Momo Ayase believes in ghosts but not aliens, while her nerdy classmate Okarun believes in aliens but not ghosts. When they bet to prove each other wrong, both turn out to be terrifyingly real.',
    legal_links: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GG5H5XQ87/dandadan', region: 'Global' },
      { name: 'Netflix', url: 'https://www.netflix.com/title/81736884', region: 'Global' }
    ],
    seasons: buildPartnerSeasonsForTitle({
      trailerUrl: 'https://www.youtube-nocookie.com/embed/0XJxfbN36Uw?rel=0',
      seasonConfigs: [
        {
          season_number: 1,
          name: 'Season 1: Turbo Granny',
          year: 2024,
          episodes: [
            { title: "That's How Love Starts, Ya Know!", duration: '24m', duration_seconds: 1440, synopsis: 'Momo and Okarun visit an abandoned hospital and a haunted tunnel on a dare.' },
            { title: "That's a Space Alien, Ain't It?!", duration: '24m', duration_seconds: 1440, synopsis: 'A gigantic Flatwoods Monster traps Momo and Okarun.' }
          ]
        }
      ]
    })
  },

  // 10. Chainsaw Man: Public Safety Uncut (18+) - Licensed Partner
  {
    id: '44511',
    mal_id: 44511,
    title: 'Chainsaw Man: Public Safety Uncut (18+)',
    japanese_title: 'チェンソーマン 無修正版',
    studio: 'MAPPA',
    year: 2022,
    format: 'TV',
    status: 'Completed',
    episodes: 12,
    score: 8.48,
    rating: 'R+ 18+',
    mature: true,
    is_free: false,
    availability_type: 'licensed-partner',
    simulcast: false,
    channel: 'Licensed Partner · Official Trailer In-App',
    genres: ['Action', 'Fantasy', 'Horror'],
    poster_url: 'https://cdn.myanimelist.net/images/anime/1806/126216l.jpg',
    banner_color: '#ef4444',
    free_url: '',
    trailer_url: 'https://www.youtube-nocookie.com/embed/q15CRdE5Bv0?rel=0',
    synopsis:
      'Living in poverty to pay off his deceased father’s debt to the yakuza, Denji works alongside chainsaw devil Pochita until a betrayal leaves him slaughtered. Pochita merges with Denji’s heart to revive him as Chainsaw Man.',
    legal_links: [
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GVDHXJ76E/chainsaw-man', region: 'Global' },
      { name: 'Hulu', url: 'https://www.hulu.com/series/chainsaw-man', region: 'US' }
    ],
    seasons: buildPartnerSeasonsForTitle({
      trailerUrl: 'https://www.youtube-nocookie.com/embed/q15CRdE5Bv0?rel=0',
      seasonConfigs: [
        {
          season_number: 1,
          name: 'Season 1: Public Safety Division 4',
          year: 2022,
          episodes: [
            { title: 'Dog & Chainsaw', duration: '24m', duration_seconds: 1440, synopsis: 'Denji merges with Pochita after being butchered by the Zombie Devil.' },
            { title: 'Arrival in Tokyo', duration: '24m', duration_seconds: 1440, synopsis: 'Makima takes Denji to Tokyo Public Safety headquarters.' }
          ]
        }
      ]
    })
  }
];
