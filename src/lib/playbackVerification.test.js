import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEpisodeVideo,
  resolveEpisodeVideoSync,
  VERIFIED_DIRECT_ANIME,
  DEFAULT_SUBTITLES,
  classifyPartnerLinks,
  isSafeStreamUrl
} from './videoRegistry.js';
import { CURATED_ANIME } from '../data/animeData.js';
import { mapAniListMediaToAnime } from './anilistClient.js';
import {
  normalizeTitleKey,
  mapJikanMediaToAnime,
  deduplicateCrossApiCatalog
} from './jikanClient.js';

describe('Playback safety, source verification and anti-trailer rules', () => {
  it('keeps rights-unconfirmed copyrighted titles quarantined and never returns their streams', async () => {
    const quarantinedIds = ['1572', '2687', '2747', '3886', '4513', '3902'];

    for (const id of quarantinedIds) {
      const anime = VERIFIED_DIRECT_ANIME[id];
      assert.equal(anime.quarantined, true, `Entry ${id} must remain quarantined until authorization is established.`);

      for (const season of anime.seasons || []) {
        for (const episode of season.episodes || []) {
          const result = await resolveEpisodeVideo({
            anime,
            seasonNumber: season.season_number,
            episodeNumber: episode.ep
          });

          assert.equal(result.available, false, `Entry ${id}, episode ${episode.ep} must not play.`);
          assert.equal(result.sourceStatus, 'source-unverified');
          assert.equal(result.streamUrl, null);
          assert.equal(result.embedUrl, null);
          assert.equal(result.durationSeconds, null);
        }
      }
    }
  });

  it('never falls back to a different season or episode when an exact item is missing', async () => {
    const anime = VERIFIED_DIRECT_ANIME['1572'];

    const missingEp = await resolveEpisodeVideo({
      anime,
      seasonNumber: 1,
      episodeNumber: 99
    });
    assert.equal(missingEp.available, false);
    assert.equal(missingEp.sourceStatus, 'episode-missing');
    assert.equal(missingEp.streamUrl, null);
    assert.equal(missingEp.episodeNumber, 99);

    const missingSeason = await resolveEpisodeVideo({
      anime,
      seasonNumber: 4,
      episodeNumber: 1
    });
    assert.equal(missingSeason.available, false);
    assert.equal(missingSeason.sourceStatus, 'season-missing');
    assert.equal(missingSeason.streamUrl, null);
    assert.equal(missingSeason.seasonNumber, 4);

    const syncMissing = resolveEpisodeVideoSync({
      anime,
      seasonNumber: 1,
      episodeNumber: 42
    });
    assert.equal(syncMissing.available, false);
    assert.equal(syncMissing.streamUrl, null);
    assert.equal(syncMissing.sourceStatus, 'episode-missing');
  });

  it('never attaches universal or fabricated subtitles and returns only declared audio metadata', async () => {
    assert.deepEqual(DEFAULT_SUBTITLES, []);

    const tears = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['tears-of-steel'],
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(tears.available, true);
    assert.deepEqual(tears.subtitles, []);
    assert.equal(tears.subtitleStatus, 'No separate subtitle track');
    assert.ok(Array.isArray(tears.audioTracks) && tears.audioTracks.length > 0);
    assert.match(tears.audioTracks[0], /English/i);
  });

  it('does not invent HTTP verification metadata and quarantined episodes contain no stream', () => {
    for (const [id, entry] of Object.entries(VERIFIED_DIRECT_ANIME)) {
      assert.ok(entry.content_classification, `Entry ${id} must declare content_classification.`);
      assert.ok(entry.verification, `Entry ${id} must include provenance metadata.`);
      assert.ok(entry.verification.provider_identity);

      assert.equal(entry.verification.http_status, null);
      assert.equal(entry.verification.mime_type, null);
      assert.equal(entry.verification.verified_at, null);

      for (const season of entry.seasons || []) {
        for (const episode of season.episodes || []) {
          assert.ok(episode.verification, `Episode ${episode.id} must include provenance metadata.`);
          assert.equal(episode.verification.http_status, null);
          assert.equal(episode.verification.mime_type, null);
          assert.equal(episode.verification.verified_at, null);

          if (entry.quarantined || episode.quarantined) {
            assert.equal(episode.stream_url, null);
          } else if (episode.stream_url) {
            assert.equal(episode.content_type, 'full_episode');
            assert.equal(episode.embed_url, null);
            assert.ok(isSafeStreamUrl(episode.stream_url));
            assert.ok(Array.isArray(episode.audio_tracks) && episode.audio_tracks.length > 0);
          }
        }
      }
    }
  });

  it('classifies series pages and provider search queries without calling either an episode stream', () => {
    const classified = classifyPartnerLinks([
      { name: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/GG5H5XQX4/frieren-beyond-journeys-end' },
      { name: 'Netflix Search', url: 'https://www.netflix.com/search?q=Frieren' }
    ]);
    assert.equal(classified[0].link_type, 'external_series_page');
    assert.equal(classified[1].link_type, 'provider_search_query');
  });

  it('lists the Sintel film once and refuses a fabricated second episode', async () => {
    const anime = VERIFIED_DIRECT_ANIME['sintel-dragon-chronicles'];
    const film = await resolveEpisodeVideo({
      anime,
      seasonNumber: 1,
      episodeNumber: 1
    });
    const missing = await resolveEpisodeVideo({
      anime,
      seasonNumber: 1,
      episodeNumber: 2
    });

    assert.equal(film.available, true);
    assert.equal(film.contentType, 'full_episode');
    assert.equal(film.durationSeconds, 888);
    assert.equal(film.embedUrl, null);
    assert.ok(isSafeStreamUrl(film.streamUrl));

    assert.equal(missing.available, false);
    assert.equal(missing.sourceStatus, 'episode-missing');
    assert.equal(missing.streamUrl, null);
    assert.equal(VERIFIED_DIRECT_ANIME['sintel-dragon-chronicles'].content_classification, 'open_source_animated_film');
  });

  it('resolves the listed open films to distinct allow-listed sources', async () => {
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
    assert.ok(isSafeStreamUrl(tears.streamUrl));
    assert.ok(isSafeStreamUrl(elephants.streamUrl));
  });

  it('resolves listed Fleischer specials while keeping quarantined episodes unavailable', async () => {
    const popeye = VERIFIED_DIRECT_ANIME['popeye-sailor-chronicles'];
    const popeye1 = await resolveEpisodeVideo({ anime: popeye, seasonNumber: 1, episodeNumber: 1 });
    const popeye3 = await resolveEpisodeVideo({ anime: popeye, seasonNumber: 1, episodeNumber: 3 });
    const popeye4 = await resolveEpisodeVideo({ anime: popeye, seasonNumber: 1, episodeNumber: 4 });
    const superman = VERIFIED_DIRECT_ANIME['superman-1941-fleischer'];
    const superman1 = await resolveEpisodeVideo({ anime: superman, seasonNumber: 1, episodeNumber: 1 });

    assert.equal(popeye1.available, true);
    assert.equal(popeye1.durationSeconds, 974);
    assert.equal(popeye3.durationSeconds, 1306);
    assert.equal(popeye4.available, false);
    assert.equal(popeye4.streamUrl, null);
    assert.equal(superman1.available, true);
    assert.equal(superman1.durationSeconds, 621);
    assert.equal(superman1.contentClassification, 'classic_theatrical_animation');
  });

  it('keeps licensed-partner anime separate from promotional trailers', async () => {
    const frieren = CURATED_ANIME.find((anime) => anime.id === '52991');
    assert.ok(frieren);
    assert.equal(frieren.availability_type, 'licensed-partner');

    const result = await resolveEpisodeVideo({
      anime: frieren,
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(result.available, false);
    assert.equal(result.contentType, 'external_licensed_episode');
    assert.equal(result.streamUrl, null);
    assert.equal(result.embedUrl, null);
    assert.equal(result.trailerContentType, 'trailer');
    assert.equal(result.officialTrailer, 'https://www.youtube-nocookie.com/embed/ZEkwCGJ3o7M?rel=0');
  });

  it('keeps licensed partner titles from assigning trailers as episode sources', async () => {
    for (const id of ['52299', '44511', '50265', '57334']) {
      const anime = CURATED_ANIME.find((item) => item.id === id);
      assert.ok(anime, `Expected catalog item ${id}.`);

      const result = await resolveEpisodeVideo({
        anime,
        seasonNumber: 1,
        episodeNumber: 1
      });

      assert.equal(result.available, false);
      assert.equal(result.contentType, 'external_licensed_episode');
      assert.equal(result.streamUrl, null);
      assert.equal(result.embedUrl, null);
      assert.equal(result.trailerContentType, 'trailer');
    }
  });

  it('does not fabricate placeholder episodes for unhosted AniList titles', async () => {
    const bokuNoPico = mapAniListMediaToAnime({
      id: 539,
      title: { english: 'Boku no Pico', romaji: 'Boku no Pico' },
      isAdult: true,
      episodes: 3,
      duration: 34
    });

    assert.equal(bokuNoPico.episodes_metadata_status, 'catalog_count_only');
    assert.equal(bokuNoPico.seasons.length, 0);

    const result = await resolveEpisodeVideo({
      anime: bokuNoPico,
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(result.available, false);
    assert.equal(result.contentType, 'external_licensed_episode');
    assert.equal(result.streamUrl, null);
    assert.equal(result.embedUrl, null);
    assert.equal(result.durationSeconds, null);
  });

  it('deduplicates matching AniList and Jikan records without duplicate keys', () => {
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
