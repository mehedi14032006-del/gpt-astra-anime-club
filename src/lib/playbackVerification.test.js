import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEpisodeVideo,
  resolveEpisodeVideoSync,
  VERIFIED_DIRECT_ANIME,
  DEFAULT_SUBTITLES,
  classifyPartnerLinks
} from './videoRegistry.js';
import { CURATED_ANIME } from '../data/animeData.js';
import { mapAniListMediaToAnime } from './anilistClient.js';
import {
  normalizeTitleKey,
  mapJikanMediaToAnime,
  deduplicateCrossApiCatalog
} from './jikanClient.js';

describe('Mandatory Full-Length Anime Episode Playback & Anti-Trailer Verification', () => {
  // Title 1: Jungle Emperor Leo (1989) - 12 Complete ~24m 42s TV Anime Episodes
  it('Title 1: Jungle Emperor Leo (1989) resolves 12 distinct full-length (~24m 42s) TV anime episodes and never uses a trailer', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['1572'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    const ep2 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['1572'],
      seasonNumber: 1,
      episodeNumber: 2
    });
    const ep12 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['1572'],
      seasonNumber: 1,
      episodeNumber: 12
    });

    assert.equal(ep1.available, true);
    assert.equal(ep2.available, true);
    assert.equal(ep12.available, true);
    assert.equal(ep1.contentType, 'full_episode');
    assert.equal(ep2.contentType, 'full_episode');
    assert.equal(ep1.embedUrl, null, 'Full episode must never have a trailer embedUrl');
    assert.ok(ep1.durationSeconds >= 1400, 'Standard TV anime episode must be ~24 minutes');
    assert.ok(ep2.durationSeconds >= 1400);
    assert.ok(ep12.durationSeconds >= 1400);
    assert.notEqual(ep1.streamUrl, ep2.streamUrl);
    assert.notEqual(ep2.streamUrl, ep12.streamUrl);
    assert.notEqual(ep1.mediaSourceId, ep2.mediaSourceId);
  });

  // Strict Anti-Fallback Test: Missing Episode or Season NEVER falls back to Episode 1
  it('Strict Anti-Fallback: Requesting a missing episode or season never falls back to Season 1 Episode 1', async () => {
    const missingEp = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['1572'],
      seasonNumber: 1,
      episodeNumber: 99
    });
    assert.equal(missingEp.available, false);
    assert.equal(missingEp.sourceStatus, 'episode-missing');
    assert.equal(missingEp.streamUrl, null, 'Missing episode 99 must NEVER return Episode 1 stream URL');
    assert.equal(missingEp.episodeNumber, 99);

    const missingSeason = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['1572'],
      seasonNumber: 4,
      episodeNumber: 1
    });
    assert.equal(missingSeason.available, false);
    assert.equal(missingSeason.sourceStatus, 'season-missing');
    assert.equal(missingSeason.streamUrl, null, 'Missing Season 4 must NEVER return Season 1 Episode 1 stream URL');
    assert.equal(missingSeason.seasonNumber, 4);

    const syncMissing = resolveEpisodeVideoSync({
      anime: VERIFIED_DIRECT_ANIME['1572'],
      seasonNumber: 1,
      episodeNumber: 42
    });
    assert.equal(syncMissing.available, false);
    assert.equal(syncMissing.streamUrl, null);
    assert.equal(syncMissing.sourceStatus, 'episode-missing');
  });

  // Authentic Subtitle & Audio Verification (Zero Universal Fictional VTT Files)
  it('Authentic Subtitle & Audio: Universal fictional VTT subtitles are removed and episodes report true audio/subtitle metadata', async () => {
    assert.deepEqual(DEFAULT_SUBTITLES, [], 'DEFAULT_SUBTITLES must be empty so universal fictional VTT files are never attached');

    const leoEp1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['1572'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    assert.deepEqual(leoEp1.subtitles, []);
    assert.match(leoEp1.subtitleStatus, /Burned-in English Subtitles/i);
    assert.ok(Array.isArray(leoEp1.audioTracks) && leoEp1.audioTracks.length > 0);
    assert.match(leoEp1.audioTracks[0], /Japanese/i);
  });

  // Source Verification Metadata & Content Classification
  it('Video Source Registry: Every verified entry contains verification metadata and explicit content_classification', () => {
    for (const [id, entry] of Object.entries(VERIFIED_DIRECT_ANIME)) {
      assert.ok(entry.content_classification, `Entry ${id} must declare content_classification`);
      assert.ok(entry.verification, `Entry ${id} must include verification metadata`);
      assert.equal(entry.verification.http_status, 200);
      assert.equal(entry.verification.mime_type, 'video/mp4');
      assert.ok(entry.verification.verified_at);
      assert.ok(entry.verification.provider_identity);

      for (const season of entry.seasons || []) {
        for (const ep of season.episodes || []) {
          assert.ok(ep.verification, `Episode ${ep.id} must include verification metadata`);
          assert.equal(ep.verification.http_status, 200);
          assert.ok(ep.subtitle_status, `Episode ${ep.id} must declare subtitle_status`);
          assert.ok(Array.isArray(ep.audio_tracks) && ep.audio_tracks.length > 0, `Episode ${ep.id} must declare audio_tracks`);
        }
      }
    }
  });

  // Partner Link Classification
  it('Partner Link Classification distinguishes series pages from provider search queries', () => {
    const classified = classifyPartnerLinks([
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GG5H5XQX4/frieren-beyond-journeys-end' },
      { name: 'Netflix Search', url: 'https://www.netflix.com/search?q=Frieren' }
    ]);
    assert.equal(classified[0].link_type, 'external_series_page');
    assert.equal(classified[1].link_type, 'provider_search_query');
  });

  // Title 2: Shin Tetsujin 28-gō (1980) - 8 Complete ~21m TV Anime Episodes
  it('Title 2: Shin Tetsujin 28-go (1980) resolves 8 distinct full-length (~21m) mecha TV anime episodes', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['2687'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    const ep2 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['2687'],
      seasonNumber: 1,
      episodeNumber: 2
    });
    const ep8 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['2687'],
      seasonNumber: 1,
      episodeNumber: 8
    });

    assert.equal(ep1.available, true);
    assert.equal(ep2.available, true);
    assert.equal(ep8.available, true);
    assert.equal(ep1.contentType, 'full_episode');
    assert.ok(ep1.durationSeconds >= 1200, 'Mecha TV episode must be ~21 minutes');
    assert.notEqual(ep1.streamUrl, ep2.streamUrl);
    assert.notEqual(ep1.streamUrl, VERIFIED_DIRECT_ANIME['1572'].seasons[0].episodes[0].stream_url);
  });

  // Title 3: Astro Boy (Tetsuwan Atom) & Tezuka Sci-Fi Classics
  it('Title 3: Astro Boy (2747) resolves complete 24m-88m episodes and feature films', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['2747'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    const ep3 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['2747'],
      seasonNumber: 1,
      episodeNumber: 3
    });

    assert.equal(ep1.available, true);
    assert.equal(ep3.available, true);
    assert.equal(ep1.contentType, 'full_episode');
    assert.equal(ep1.durationSeconds, 1454);
    assert.equal(ep3.durationSeconds, 5277);
    assert.notEqual(ep1.streamUrl, ep3.streamUrl);
  });

  // Title 4: Hakujaden / The White Snake Enchantress (1958) - 75m Feature Film
  it('Title 4: Hakujaden (4513) resolves complete 75-minute Toei Animation feature film', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['4513'],
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(ep1.available, true);
    assert.equal(ep1.contentType, 'full_episode');
    assert.equal(ep1.durationSeconds, 4503);
    assert.match(ep1.streamUrl, /panda-and-the-magic-serpent/i);
  });

  // Title 5: Momotaro & Japanese Folklore Anime Anthology (3886)
  it('Title 5: Momotaro Anthology (3886) resolves 4 distinct full-length OVA & feature episodes', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['3886'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    const ep4 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['3886'],
      seasonNumber: 1,
      episodeNumber: 4
    });

    assert.equal(ep1.available, true);
    assert.equal(ep4.available, true);
    assert.equal(ep1.durationSeconds, 991);
    assert.equal(ep4.durationSeconds, 2790);
    assert.notEqual(ep1.streamUrl, ep4.streamUrl);
  });

  // Title 6: Princess Iron Fan (1941)
  it('Title 6: Princess Iron Fan (3902) resolves complete 72m feature and 24m broadcast cut', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['3902'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    const ep2 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['3902'],
      seasonNumber: 1,
      episodeNumber: 2
    });

    assert.equal(ep1.available, true);
    assert.equal(ep2.available, true);
    assert.equal(ep1.durationSeconds, 4367);
    assert.equal(ep2.durationSeconds, 1441);
    assert.notEqual(ep1.streamUrl, ep2.streamUrl);
  });

  // Title 7: Sintel (Complete 14m 48s film, no longer 30s sample)
  it('Title 7: Sintel resolves complete 14m 48s (888s) film, not a 30s sample clip', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['sintel-dragon-chronicles'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    const ep2 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['sintel-dragon-chronicles'],
      seasonNumber: 1,
      episodeNumber: 2
    });

    assert.equal(ep1.available, true);
    assert.equal(ep2.available, true);
    assert.equal(ep1.durationSeconds, 888);
    assert.equal(ep2.durationSeconds, 888);
    assert.notEqual(ep1.streamUrl, ep2.streamUrl);
    assert.equal(VERIFIED_DIRECT_ANIME['sintel-dragon-chronicles'].content_classification, 'open_source_animated_film');
  });

  // Title 8: Tears of Steel & Elephants Dream (Complete 12m 14s and 10m 54s films)
  it('Title 8: Tears of Steel and Elephants Dream resolve complete films (734s & 654s)', async () => {
    const tears = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['tears-of-steel'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    const elephants = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['elephants-dream'],
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(tears.available, true);
    assert.equal(tears.durationSeconds, 734);
    assert.equal(elephants.available, true);
    assert.equal(elephants.durationSeconds, 654);
    assert.notEqual(tears.streamUrl, elephants.streamUrl);
  });

  // Title 9: Popeye & Superman Complete Specials (16m-22m & 8m-10m)
  it('Title 9: Popeye and Superman resolve complete multi-episode specials', async () => {
    const popeye1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['popeye-sailor-chronicles'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    const popeye3 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['popeye-sailor-chronicles'],
      seasonNumber: 1,
      episodeNumber: 3
    });
    const superman1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['superman-1941-fleischer'],
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(popeye1.available, true);
    assert.equal(popeye1.durationSeconds, 974);
    assert.equal(popeye3.durationSeconds, 1306);
    assert.equal(superman1.available, true);
    assert.equal(superman1.durationSeconds, 621);
    assert.equal(VERIFIED_DIRECT_ANIME['superman-1941-fleischer'].content_classification, 'classic_theatrical_animation');
  });

  // Title 10: Frieren (Licensed Partner) - Never assigns trailer as episode embedUrl
  it('Title 10: Frieren separates promotional trailer from episode source and never plays a trailer as an episode', async () => {
    const frieren = CURATED_ANIME.find((a) => a.id === '52991');
    assert.equal(frieren.availability_type, 'licensed-partner');
    const ep1 = await resolveEpisodeVideo({
      anime: frieren,
      seasonNumber: 1,
      episodeNumber: 1
    });
    assert.equal(ep1.available, false);
    assert.equal(ep1.contentType, 'external_licensed_episode');
    assert.equal(ep1.streamUrl, null);
    assert.equal(ep1.embedUrl, null, 'Episode embedUrl MUST be null so trailers never auto-play as episodes');
    assert.equal(ep1.trailerContentType, 'trailer');
    assert.equal(ep1.officialTrailer, 'https://www.youtube-nocookie.com/embed/ZEkwCGJ3o7M?rel=0');
  });

  // Title 11: Solo Leveling, Chainsaw Man, Spy x Family, Dandadan
  it('Title 11: Licensed partner titles (Solo Leveling, Chainsaw Man, Spy x Family, Dandadan) strictly isolate trailers from episodes', async () => {
    for (const id of ['52299', '44511', '50265', '57334']) {
      const anime = CURATED_ANIME.find((a) => a.id === id);
      const res = await resolveEpisodeVideo({
        anime,
        seasonNumber: 1,
        episodeNumber: 1
      });
      assert.equal(res.available, false);
      assert.equal(res.contentType, 'external_licensed_episode');
      assert.equal(res.streamUrl, null);
      assert.equal(res.embedUrl, null);
      assert.equal(res.trailerContentType, 'trailer');
    }
  });

  // Title 12: Unhosted AniList Titles (Boku no Pico & Taboo Charming Mother) do NOT fabricate placeholder episodes
  it('Title 12: Unhosted AniList & Jikan titles do not fabricate placeholder episodes and resolve to unavailable', async () => {
    const bokuNoPico = mapAniListMediaToAnime({
      id: 539,
      title: { english: 'Boku no Pico', romaji: 'Boku no Pico' },
      isAdult: true,
      episodes: 3,
      duration: 34
    });

    assert.equal(bokuNoPico.episodes_metadata_status, 'catalog_count_only');
    assert.equal(bokuNoPico.seasons.length, 0, 'Must not fabricate placeholder Episode 1..3 records when streamingEpisodes are absent');

    const res = await resolveEpisodeVideo({
      anime: bokuNoPico,
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(res.available, false);
    assert.equal(res.contentType, 'external_licensed_episode');
    assert.equal(res.streamUrl, null);
    assert.equal(res.embedUrl, null);
    assert.equal(res.durationSeconds, null, 'Must never fabricate a duration for unhosted episodes');
  });

  // Cross-API Jikan & AniList Deduplication
  it('Cross-API Deduplication merges AniList and Jikan (MAL) entries without duplicate keys', () => {
    const anilistItem = mapAniListMediaToAnime({
      id: 154587,
      idMal: 52991,
      title: { english: "Frieren: Beyond Journey's End", romaji: 'Sousou no Frieren' },
      format: 'TV'
    });
    const jikanItem = mapJikanMediaToAnime({
      mal_id: 52991,
      title: 'Sousou no Frieren',
      title_english: "Frieren: Beyond Journey's End",
      type: 'TV',
      score: 9.3
    });

    const deduped = deduplicateCrossApiCatalog([anilistItem, jikanItem]);
    assert.equal(deduped.length, 1);
    assert.equal(normalizeTitleKey("Frieren: Beyond Journey's End!"), 'frierenbeyondjourneysend');
  });
});

