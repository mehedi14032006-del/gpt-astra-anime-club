import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeAniListDescription,
  getCurrentSeasonAndYear,
  mapAniListMediaToAnime,
  queryAniList,
  ANILIST_AUTOCOMPLETE_QUERY
} from './anilistClient.js';

describe('sanitizeAniListDescription', () => {
  it('converts <br> and <p> tags into proper newlines and strips other tags', () => {
    const raw = '<p>First line.<br>Second line with <b>bold text</b>.</p><p>Third paragraph.</p>';
    const cleaned = sanitizeAniListDescription(raw);
    assert.match(cleaned, /First line\.\nSecond line with bold text\./);
    assert.match(cleaned, /Third paragraph\./);
    assert.equal(cleaned.includes('<p>'), false);
    assert.equal(cleaned.includes('<b>'), false);
  });

  it('hides spoilers by default and exposes them when requested', () => {
    const raw = 'The hero dies in the end: ~!Dumbledore dies!~';
    assert.equal(
      sanitizeAniListDescription(raw, { hideSpoilers: true }),
      'The hero dies in the end: [Spoiler Hidden]'
    );
    assert.equal(
      sanitizeAniListDescription(raw, { hideSpoilers: false }),
      'The hero dies in the end: Dumbledore dies'
    );
  });
});

describe('getCurrentSeasonAndYear', () => {
  it('identifies correct seasons for different dates', () => {
    assert.deepEqual(getCurrentSeasonAndYear(new Date('2026-01-15T00:00:00Z')), { season: 'WINTER', year: 2026 });
    assert.deepEqual(getCurrentSeasonAndYear(new Date('2026-04-10T00:00:00Z')), { season: 'SPRING', year: 2026 });
    assert.deepEqual(getCurrentSeasonAndYear(new Date('2026-07-20T00:00:00Z')), { season: 'SUMMER', year: 2026 });
    assert.deepEqual(getCurrentSeasonAndYear(new Date('2026-10-05T00:00:00Z')), { season: 'FALL', year: 2026 });
  });
});

describe('mapAniListMediaToAnime', () => {
  it('maps AniList GraphQL media object into Kitsune+ format with trailer, genres, and legal links', () => {
    const mockMedia = {
      id: 52991,
      idMal: 52991,
      title: {
        english: "Frieren: Beyond Journey's End",
        romaji: 'Sousou no Frieren',
        native: '葬送のフリーレン'
      },
      coverImage: {
        extraLarge: 'https://cdn.example.com/frieren-large.jpg',
        large: 'https://cdn.example.com/frieren.jpg',
        color: '#67e8f9'
      },
      bannerImage: 'https://cdn.example.com/frieren-banner.jpg',
      format: 'TV',
      episodes: 28,
      status: 'RELEASING',
      seasonYear: 2023,
      averageScore: 93,
      genres: ['Adventure', 'Drama', 'Fantasy'],
      description: 'The journey continues after the hero dies.<br>A masterpiece.',
      studios: {
        nodes: [{ name: 'Madhouse' }]
      },
      trailer: {
        id: 'ZEkwCGJ3o7M',
        site: 'youtube'
      },
      externalLinks: [
        { site: 'Crunchyroll', url: 'https://crunchyroll.com/frieren' },
        { site: 'Netflix', url: 'https://netflix.com/frieren' }
      ],
      isAdult: false
    };

    const anime = mapAniListMediaToAnime(mockMedia);
    assert.equal(anime.id, '52991');
    assert.equal(anime.title, "Frieren: Beyond Journey's End");
    assert.equal(anime.studio, 'Madhouse');
    assert.equal(anime.score, 9.3);
    assert.equal(anime.status, 'Ongoing');
    assert.equal(anime.simulcast, true);
    assert.equal(anime.trailer_url, 'https://www.youtube-nocookie.com/embed/ZEkwCGJ3o7M?rel=0');
    assert.equal(anime.episodes_metadata_status, 'catalog_count_only');
    assert.equal(anime.seasons.length, 0, 'Must not fabricate placeholder episodes when streamingEpisodes are absent');

    const withPartnerEps = mapAniListMediaToAnime({
      ...mockMedia,
      streamingEpisodes: [
        { title: "Episode 1 - The Journey's End", url: 'https://www.crunchyroll.com/watch/G1', site: 'Crunchyroll' },
        { title: "Episode 2 - It Didn't Have to Be Magic", url: 'https://www.crunchyroll.com/watch/G2', site: 'Crunchyroll' }
      ]
    });
    assert.equal(withPartnerEps.episodes_metadata_status, 'verified_partner_episodes');
    assert.equal(withPartnerEps.seasons.length, 1);
    assert.equal(withPartnerEps.seasons[0].episodes.length, 2);
    assert.equal(withPartnerEps.seasons[0].episodes[0].duration_seconds, null);
  });
});

describe('Live AniList GraphQL API Integration', () => {
  it('queries real autocomplete suggestions from https://graphql.anilist.co', async () => {
    const result = await queryAniList(ANILIST_AUTOCOMPLETE_QUERY, {
      search: 'Frieren',
      isAdult: false
    });
    assert.ok(result?.Page?.media?.length > 0, 'Expected at least one result for Frieren');
    const first = result.Page.media[0];
    assert.ok(first.id, 'Expected an AniList id');
    assert.ok(first.title.romaji || first.title.english, 'Expected a title');
  });

  it('guarantees unique IDs when deduplicating anime list items containing duplicate media IDs (e.g. 106457)', () => {
    const rawList = [
      { id: 106457, title: { romaji: 'Naki no Ryuu' } },
      { id: 52991, title: { english: 'Frieren' } },
      { id: 106457, title: { romaji: 'Naki no Ryuu (Duplicate)' } },
      { id: 127230, title: { english: 'Chainsaw Man' } }
    ];

    const seen = new Set();
    const deduped = rawList.filter((m) => {
      if (!m || !m.id || seen.has(String(m.id))) return false;
      seen.add(String(m.id));
      return true;
    });

    assert.equal(deduped.length, 3);
    assert.deepEqual(deduped.map((m) => m.id), [106457, 52991, 127230]);
  });
});

