/**
 * Curated Anime Library for Kitsune+ / GPT Astra Anime Club
 *
 * Implements strict anime-to-video source separation & content-type isolation:
 * 1. Verified Full-Length Playable Productions (`availability_type: 'direct-hd'`, `content_type: 'full_episode'`):
 *    11 productions (45+ distinct full-length TV episodes, OVAs, and feature films from 7m to 88m)
 *    with real verified durations read directly from the media stream and explicit content classification
 *    (`japanese_anime`, `asian_animation_heritage`, `open_source_animated_film`, `classic_theatrical_animation`).
 * 2. Licensed Partner Anime (`availability_type: 'licensed-partner'`, `content_type: 'external_licensed_episode'`):
 *    Point strictly to authorized external distributors (Crunchyroll, Netflix, HIDIVE, Muse Asia, Ani-One Asia)
 *    with explicit partner link classifications (`external_series_page` vs `provider_search_query`).
 *    Promotional trailers are kept strictly separate (`trailer_url`, `content_type: 'trailer'`) and NEVER
 *    assigned to `episode.stream_url` or `episode.embed_url`.
 */

import { VERIFIED_DIRECT_ANIME, DEFAULT_SUBTITLES } from '../lib/videoRegistry.js';

export const SUBTITLE_TRACKS = DEFAULT_SUBTITLES;

function buildPartnerSeasonsForTitle({
  animeId,
  partnerSeriesUrl,
  providerName = 'Crunchyroll',
  seasonConfigs
}) {
  return seasonConfigs.map((sConfig) => ({
    season_number: sConfig.season_number,
    name: sConfig.name,
    year: sConfig.year,
    episodes: sConfig.episodes.map((epMeta, idx) => {
      const epNum = idx + 1;
      return {
        episode_id: `${animeId}:s${sConfig.season_number}:e${epNum}`,
        ep: epNum,
        season: sConfig.season_number,
        content_type: 'external_licensed_episode',
        title: epMeta.title,
        synopsis: epMeta.synopsis,
        duration: epMeta.broadcast_runtime || 'External Partner',
        duration_seconds: null, // Never hardcode a fake in-app duration for unhosted external episodes
        air_date: epMeta.air_date || `${sConfig.year || 2024}`,
        audio_tracks: [],
        subtitle_status: 'Provided on External Partner Platform',
        stream_url: null, // Strictly null: No fake clip or fallback
        embed_url: null,  // Strictly null: Never assign a promotional trailer as an episode embed
        external_episode_url: epMeta.episode_url || null, // Only set if an exact episode URL is known
        external_series_url: partnerSeriesUrl || null,
        link_type: epMeta.episode_url ? 'external_episode_link' : 'external_series_page',
        provider_id: providerName,
        source_status: 'external-partner',
        subtitles: [],
        is_preview_only: false
      };
    })
  }));
}

export const CURATED_ANIME = [
  // 1. Jungle Emperor Leo (1989) - 12 Full 24m 42s TV Anime Episodes (Tezuka Productions)
  VERIFIED_DIRECT_ANIME['1572'],

  // 2. Shin Tetsujin 28-gō / The New Adventures of Gigantor (1980) - 8 Full 21m TV Anime Episodes (TMS)
  VERIFIED_DIRECT_ANIME['2687'],

  // 3. Astro Boy (Tetsuwan Atom) & Tezuka Sci-Fi Classics - Full 24m-88m Episodes & Feature (Mushi Production)
  VERIFIED_DIRECT_ANIME['2747'],

  // 4. The White Snake Enchantress / Hakujaden (1958) - Full 75m Color Anime Feature Film (Toei Animation)
  VERIFIED_DIRECT_ANIME['4513'],

  // 5. Momotarō & Japanese Folklore Anime Anthology (1981-1989) - 4 Full OVA & Feature Specials (10m-46m)
  VERIFIED_DIRECT_ANIME['3886'],

  // 6. Princess Iron Fan (1941) - Complete 73m Animated Feature & 24m Broadcast Cut
  VERIFIED_DIRECT_ANIME['3902'],

  // 7. Sintel - Complete 14m 48s Open-Source Animated Film (Blender Studio CC-BY 3.0)
  VERIFIED_DIRECT_ANIME['sintel-dragon-chronicles'],

  // 8. Tears of Steel - Complete 12m 14s Open-Source Sci-Fi Film (Blender Studio CC-BY 3.0)
  VERIFIED_DIRECT_ANIME['tears-of-steel'],

  // 9. Elephants Dream - Complete 10m 54s Open-Source Surreal Film (Orange Studio CC-BY)
  VERIFIED_DIRECT_ANIME['elephants-dream'],

  // 10. Popeye the Sailor (Fleischer Technicolor Specials) - 5 Full 7m-22m Public Domain Specials
  VERIFIED_DIRECT_ANIME['popeye-sailor-chronicles'],

  // 11. Superman (Fleischer Theatrical Series 1941-1942) - 6 Full 8m-10m Public Domain Episodes
  VERIFIED_DIRECT_ANIME['superman-1941-fleischer'],

  // 12. Frieren: Beyond Journey's End - Licensed Partner Series
  {
    id: '52991',
    mal_id: 52991,
    anilist_id: 154587,
    title: "Frieren: Beyond Journey's End",
    japanese_title: '葬送のフリーレン',
    studio: 'Madhouse',
    year: 2023,
    format: 'TV',
    content_classification: 'japanese_anime',
    status: 'Completed',
    episodes: 28,
    score: 9.31,
    rating: 'PG-13',
    mature: false,
    is_free: false,
    availability_type: 'licensed-partner',
    simulcast: true,
    channel: 'Licensed Partner · Official Series on Crunchyroll & Netflix',
    genres: ['Adventure', 'Drama', 'Fantasy'],
    poster_url: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
    banner_color: '#67e8f9',
    free_url: '',
    trailer_url: 'https://www.youtube-nocookie.com/embed/ZEkwCGJ3o7M?rel=0',
    trailer_content_type: 'trailer',
    synopsis:
      'After a ten-year quest alongside the hero Himmel and his party, the elven mage Frieren defeats the Demon King and brings peace to the realm. Immortal and unhurried by human time, she embarks on a new journey to understand the fleeting hearts of the companions she once knew.',
    legal_links: [
      {
        name: 'Crunchyroll (Official Series Page)',
        url: 'https://www.crunchyroll.com/series/GG5H5XMQ5/frieren-beyond-journeys-end',
        region: 'Global',
        link_type: 'external_series_page'
      },
      {
        name: 'Netflix (Official Series Page)',
        url: 'https://www.netflix.com/title/81726714',
        region: 'Selected Regions',
        link_type: 'external_series_page'
      },
      {
        name: 'Muse Asia (Channel Search)',
        url: 'https://www.youtube.com/@MuseAsia/search?query=Frieren',
        region: 'Asia',
        link_type: 'provider_search_query'
      }
    ],
    seasons: buildPartnerSeasonsForTitle({
      animeId: '52991',
      partnerSeriesUrl: 'https://www.crunchyroll.com/series/GG5H5XMQ5/frieren-beyond-journeys-end',
      providerName: 'Crunchyroll',
      seasonConfigs: [
        {
          season_number: 1,
          name: 'Season 1: Verified Broadcast Episode Guide (28 Total Episodes)',
          year: 2023,
          episodes: [
            { title: "The Journey's End", synopsis: 'The Hero Party returns victorious to the royal capital as a fifty-year meteor shower illuminates the sky.' },
            { title: "It Didn't Have to Be Magic...", synopsis: 'Frieren takes young Fern as her apprentice and deciphers a legendary grimoire.' },
            { title: 'Killing Magic', synopsis: 'Frieren and Fern unseal Qual, the Elder Sage of Corruption, who invented Zoltraak.' },
            { title: 'The Land Where Souls Rest', synopsis: 'Seeking Aureole at the northernmost edge of the continent, Frieren visits Eisen.' }
          ]
        }
      ]
    })
  },

  // 13. Solo Leveling - Licensed Partner Series
  {
    id: '52299',
    mal_id: 52299,
    anilist_id: 151807,
    title: 'Solo Leveling',
    japanese_title: '俺だけレベルアップな件',
    studio: 'A-1 Pictures',
    year: 2024,
    format: 'TV',
    content_classification: 'japanese_anime',
    status: 'Ongoing',
    episodes: 25,
    score: 8.62,
    rating: 'R - 17+',
    mature: false,
    is_free: false,
    availability_type: 'licensed-partner',
    simulcast: true,
    channel: 'Licensed Partner · Official Series on Crunchyroll',
    genres: ['Action', 'Adventure', 'Fantasy'],
    poster_url: 'https://cdn.myanimelist.net/images/anime/1801/142390l.jpg',
    banner_color: '#818cf8',
    free_url: '',
    trailer_url: 'https://www.youtube-nocookie.com/embed/bssSj4cKsrI?rel=0',
    trailer_content_type: 'trailer',
    synopsis:
      'In a world where hunters must battle deadly monsters inside dimensional Gates, Sung Jinwoo—known as the weakest hunter of all mankind—survives a brutal double dungeon and awakens a secret System that allows him alone to level up without limit.',
    legal_links: [
      {
        name: 'Crunchyroll (Official Series Page)',
        url: 'https://www.crunchyroll.com/series/GEXH3W20Z/solo-leveling',
        region: 'Global',
        link_type: 'external_series_page'
      }
    ],
    seasons: buildPartnerSeasonsForTitle({
      animeId: '52299',
      partnerSeriesUrl: 'https://www.crunchyroll.com/series/GEXH3W20Z/solo-leveling',
      providerName: 'Crunchyroll',
      seasonConfigs: [
        {
          season_number: 1,
          name: 'Season 1: Awakening of the Shadow Monarch (Licensed Partner)',
          year: 2024,
          episodes: [
            { title: "I'm Used to It", synopsis: 'E-Rank Hunter Sung Jinwoo enters a routine raid that conceals a hidden double lair.' },
            { title: 'If I Had One More Chance', synopsis: 'Faced with the giant stone tablets of the Cartenon Temple, Jinwoo solves the three commandments.' },
            { title: "It's Like a Game", synopsis: 'Jinwoo awakens in a hospital bed with a floating quest interface only he can see.' },
            { title: "I've Gotta Get Stronger", synopsis: 'Inside the Instant Dungeon of Hapjeong Station, Jinwoo battles the Blue Venom-Fanged Kasaka.' }
          ]
        }
      ]
    })
  },

  // 14. Spy × Family - Licensed Partner Series
  {
    id: '50265',
    mal_id: 50265,
    anilist_id: 140960,
    title: 'Spy × Family',
    japanese_title: 'SPY×FAMILY',
    studio: 'Wit Studio · CloverWorks',
    year: 2022,
    format: 'TV',
    content_classification: 'japanese_anime',
    status: 'Completed',
    episodes: 37,
    score: 8.58,
    rating: 'PG-13',
    mature: false,
    is_free: false,
    availability_type: 'licensed-partner',
    simulcast: false,
    channel: 'Licensed Partner · Official Series on Crunchyroll & Muse Asia',
    genres: ['Action', 'Comedy'],
    poster_url: 'https://cdn.myanimelist.net/images/anime/1441/122795l.jpg',
    banner_color: '#fb7185',
    free_url: '',
    trailer_url: 'https://www.youtube-nocookie.com/embed/ofXigq9aIpo?rel=0',
    trailer_content_type: 'trailer',
    synopsis:
      'Master spy Twilight must build a fake family to infiltrate an elite private academy. Unbeknownst to him, the daughter he adopts is a telepath and the woman he agrees to marry is a lethal assassin.',
    legal_links: [
      {
        name: 'Crunchyroll (Official Series Page)',
        url: 'https://www.crunchyroll.com/series/G4PH0WXPX/spy-x-family',
        region: 'Global',
        link_type: 'external_series_page'
      },
      {
        name: 'Muse Asia (Channel Search)',
        url: 'https://www.youtube.com/@MuseAsia/search?query=Spy+x+Family',
        region: 'Asia',
        link_type: 'provider_search_query'
      }
    ],
    seasons: buildPartnerSeasonsForTitle({
      animeId: '50265',
      partnerSeriesUrl: 'https://www.crunchyroll.com/series/G4PH0WXPX/spy-x-family',
      providerName: 'Crunchyroll',
      seasonConfigs: [
        {
          season_number: 1,
          name: 'Season 1: Operation Strix (Licensed Partner)',
          year: 2022,
          episodes: [
            { title: 'Operation Strix', synopsis: 'Agent Twilight adopts Anya from an orphanage to approach target Donovan Desmond.' },
            { title: 'Secure a Wife', synopsis: 'Loid and Yor forge a marriage covenant amid a hail of celebratory grenades.' }
          ]
        }
      ]
    })
  },

  // 15. Dandadan - Licensed Partner Series
  {
    id: '57334',
    mal_id: 57334,
    anilist_id: 171018,
    title: 'Dandadan',
    japanese_title: 'ダンダダン',
    studio: 'Science SARU',
    year: 2024,
    format: 'TV',
    content_classification: 'japanese_anime',
    status: 'Ongoing',
    episodes: 12,
    score: 8.75,
    rating: 'R - 17+',
    mature: false,
    is_free: false,
    availability_type: 'licensed-partner',
    simulcast: true,
    channel: 'Licensed Partner · Official Series on Crunchyroll, Netflix & Muse Asia',
    genres: ['Action', 'Comedy', 'Sci-Fi'],
    poster_url: 'https://cdn.myanimelist.net/images/anime/1584/143719l.jpg',
    banner_color: '#f43f5e',
    free_url: '',
    trailer_url: 'https://www.youtube-nocookie.com/embed/0XJxfbN36Uw?rel=0',
    trailer_content_type: 'trailer',
    synopsis:
      'Momo Ayase believes in ghosts but not aliens, while her nerdy classmate Okarun believes in aliens but not ghosts. When they bet to prove each other wrong, both turn out to be terrifyingly real.',
    legal_links: [
      {
        name: 'Crunchyroll (Official Series Page)',
        url: 'https://www.crunchyroll.com/series/GG5H5XQ87/dandadan',
        region: 'Global',
        link_type: 'external_series_page'
      },
      {
        name: 'Netflix (Official Series Page)',
        url: 'https://www.netflix.com/title/81736884',
        region: 'Global',
        link_type: 'external_series_page'
      },
      {
        name: 'Muse Asia (Channel Search)',
        url: 'https://www.youtube.com/@MuseAsia/search?query=Dandadan',
        region: 'Asia',
        link_type: 'provider_search_query'
      }
    ],
    seasons: buildPartnerSeasonsForTitle({
      animeId: '57334',
      partnerSeriesUrl: 'https://www.crunchyroll.com/series/GG5H5XQ87/dandadan',
      providerName: 'Crunchyroll',
      seasonConfigs: [
        {
          season_number: 1,
          name: 'Season 1: Turbo Granny (Licensed Partner)',
          year: 2024,
          episodes: [
            { title: "That's How Love Starts, Ya Know!", synopsis: 'Momo and Okarun visit an abandoned hospital and a haunted tunnel on a dare.' },
            { title: "That's a Space Alien, Ain't It?!", synopsis: 'A gigantic Flatwoods Monster traps Momo and Okarun.' }
          ]
        }
      ]
    })
  },

  // 16. Chainsaw Man: Public Safety Uncut (18+) - Licensed Partner Series
  {
    id: '44511',
    mal_id: 44511,
    anilist_id: 127230,
    title: 'Chainsaw Man: Public Safety Uncut (18+)',
    japanese_title: 'チェンソーマン 無修正版',
    studio: 'MAPPA',
    year: 2022,
    format: 'TV',
    content_classification: 'japanese_anime',
    status: 'Completed',
    episodes: 12,
    score: 8.48,
    rating: 'R+ 18+',
    mature: true,
    is_free: false,
    availability_type: 'licensed-partner',
    simulcast: false,
    channel: 'Licensed Partner · Official Series on Crunchyroll & Hulu',
    genres: ['Action', 'Fantasy', 'Horror'],
    poster_url: 'https://cdn.myanimelist.net/images/anime/1806/126216l.jpg',
    banner_color: '#ef4444',
    free_url: '',
    trailer_url: 'https://www.youtube-nocookie.com/embed/q15CRdE5Bv0?rel=0',
    trailer_content_type: 'trailer',
    synopsis:
      'Living in poverty to pay off his deceased father’s debt to the yakuza, Denji works alongside chainsaw devil Pochita until a betrayal leaves him slaughtered. Pochita merges with Denji’s heart to revive him as Chainsaw Man.',
    legal_links: [
      {
        name: 'Crunchyroll (Official Series Page)',
        url: 'https://www.crunchyroll.com/series/GVDHXJ76E/chainsaw-man',
        region: 'Global',
        link_type: 'external_series_page'
      },
      {
        name: 'Hulu (Official Series Page)',
        url: 'https://www.hulu.com/series/chainsaw-man',
        region: 'US',
        link_type: 'external_series_page'
      }
    ],
    seasons: buildPartnerSeasonsForTitle({
      animeId: '44511',
      partnerSeriesUrl: 'https://www.crunchyroll.com/series/GVDHXJ76E/chainsaw-man',
      providerName: 'Crunchyroll',
      seasonConfigs: [
        {
          season_number: 1,
          name: 'Season 1: Public Safety Division 4 (Licensed Partner)',
          year: 2022,
          episodes: [
            { title: 'Dog & Chainsaw', synopsis: 'Denji merges with Pochita after being butchered by the Zombie Devil.' },
            { title: 'Arrival in Tokyo', synopsis: 'Makima takes Denji to Tokyo Public Safety headquarters.' }
          ]
        }
      ]
    })
  }
];
