import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEmbedSource,
  filterCatalog,
  isMatureAnime,
  updateWatchProgress,
  verifyAgeFromBirthDate,
  getAvailabilityStatus,
  formatTimestamp
} from './catalogLogic.js';

describe('resolveEmbedSource', () => {
  it('resolves local self-hosted MP4 streams into direct HTML5 video sources', () => {
    const res = resolveEmbedSource('/streams/sintel-ep1.mp4');
    assert.equal(res.type, 'video');
    assert.equal(res.src, '/streams/sintel-ep1.mp4');
    assert.equal(res.provider, 'Kitsune+ Direct HD CDN');
  });

  it('converts YouTube playlist URLs to nocookie videoseries embeds with per-episode index', () => {
    const res = resolveEmbedSource('https://www.youtube.com/playlist?list=PLwLSw1_eDZl1w0323537261', 4);
    assert.equal(res.type, 'iframe');
    assert.equal(
      res.src,
      'https://www.youtube-nocookie.com/embed/videoseries?list=PLwLSw1_eDZl1w0323537261&index=4&rel=0'
    );
  });

  it('converts YouTube watch URLs and short URLs to nocookie embeds', () => {
    const watch = resolveEmbedSource('https://www.youtube.com/watch?v=qig4KOK2R2g');
    assert.equal(watch.type, 'iframe');
    assert.equal(watch.src, 'https://www.youtube-nocookie.com/embed/qig4KOK2R2g?rel=0');

    const short = resolveEmbedSource('https://youtu.be/6ohYYtxfDCg');
    assert.equal(short.type, 'iframe');
    assert.equal(short.src, 'https://www.youtube-nocookie.com/embed/6ohYYtxfDCg?rel=0');
  });

  it('converts Internet Archive detail links to archive.org embeds', () => {
    const res = resolveEmbedSource('https://archive.org/details/gullivers-travels-1939');
    assert.equal(res.type, 'iframe');
    assert.equal(res.src, 'https://archive.org/embed/gullivers-travels-1939');
  });

  it('handles empty or invalid URLs safely', () => {
    assert.deepEqual(resolveEmbedSource(''), { type: 'none', src: '', provider: 'Unknown' });
    assert.deepEqual(resolveEmbedSource(null), { type: 'none', src: '', provider: 'Unknown' });
  });
});

describe('verifyAgeFromBirthDate', () => {
  const refDate = new Date('2026-05-01T00:00:00Z');

  it('approves adults who are 18 or older', () => {
    const res = verifyAgeFromBirthDate({ year: 2000, month: 4, day: 15, minAge: 18 }, refDate);
    assert.equal(res.validInput, true);
    assert.equal(res.eligible, true);
    assert.equal(res.isMinorLock, false);
    assert.equal(res.age, 26);
  });

  it('blocks minors under 18 and activates Minor Lock', () => {
    const res = verifyAgeFromBirthDate({ year: 2011, month: 8, day: 10, minAge: 18 }, refDate);
    assert.equal(res.validInput, true);
    assert.equal(res.eligible, false);
    assert.equal(res.isMinorLock, true);
    assert.equal(res.age, 14);
    assert.match(res.error, /Access denied/);
  });

  it('rejects impossible calendar dates like February 31', () => {
    const res = verifyAgeFromBirthDate({ year: 1999, month: 2, day: 31, minAge: 18 }, refDate);
    assert.equal(res.validInput, false);
    assert.equal(res.eligible, false);
  });
});

describe('getAvailabilityStatus', () => {
  it('marks titles with self-hosted MP4 episodes as direct-hd watchable', () => {
    const status = getAvailabilityStatus({
      title: 'Sintel',
      seasons: [{ season_number: 1, episodes: [{ ep: 1, stream_url: '/streams/sintel-ep1.mp4' }] }]
    });
    assert.equal(status.playability, 'direct-hd');
    assert.equal(status.watchableInApp, true);
  });

  it('marks partner-exclusive titles as licensed-partner and not falsely watchable', () => {
    const status = getAvailabilityStatus({
      title: 'Blue Box',
      availability_type: 'licensed-partner',
      is_free: false,
      trailer_url: 'https://www.youtube.com/embed/v=123'
    });
    assert.equal(status.playability, 'licensed-partner');
    assert.equal(status.watchableInApp, false);
    assert.ok(status.legalLinks.length > 0);
  });
});

describe('filterCatalog & isMatureAnime', () => {
  const sample = [
    { id: 1, title: 'Frieren: Beyond Journey’s End', format: 'TV', simulcast: true, genres: ['Adventure', 'Fantasy'], rating: 'PG-13', seasons: [{ episodes: [{ stream_url: '/streams/fantasy-stream.mp4' }] }] },
    { id: 2, title: 'Chainsaw Man: Public Safety Uncut', format: 'TV', genres: ['Action', 'Horror'], rating: 'R - 17+', mature: true, seasons: [{ episodes: [{ stream_url: '/streams/mature-stream.mp4' }] }] },
    { id: 3, title: 'Suzume', format: 'Movie', genres: ['Adventure', 'Fantasy'], rating: 'PG-13', seasons: [{ episodes: [{ stream_url: '/streams/drama-stream.mp4' }] }] }
  ];

  it('identifies mature anime and filters by format, genre, query, and hideMature', () => {
    assert.equal(isMatureAnime(sample[0]), false);
    assert.equal(isMatureAnime(sample[1]), true);

    const safeOnly = filterCatalog(sample, { hideMature: true });
    assert.equal(safeOnly.length, 2);

    const moviesOnly = filterCatalog(sample, { format: 'Movie' });
    assert.equal(moviesOnly.length, 1);
    assert.equal(moviesOnly[0].title, 'Suzume');
  });
});

describe('updateWatchProgress & formatTimestamp', () => {
  it('calculates progress percentage and stores second-accurate resume timestamps', () => {
    const map = updateWatchProgress({}, {
      animeId: '52991',
      seasonNumber: 2,
      episodeNumber: 3,
      totalEpisodes: 12,
      episodeTitle: 'Episode 3',
      resumeSeconds: 480,
      durationSeconds: 960
    });
    assert.equal(map['52991'].seasonNumber, 2);
    assert.equal(map['52991'].episodeNumber, 3);
    assert.equal(map['52991'].resumeSeconds, 480);
    assert.equal(formatTimestamp(125), '02:05');
  });
});

describe('resolveEpisodeVideo (videoRegistry)', () => {
  it('keeps rights-unconfirmed copyrighted sources unavailable instead of returning a video', async () => {
    const { resolveEpisodeVideo } = await import('./videoRegistry.js');
    const cases = [
      { id: '1572', title: 'Jungle Emperor Leo (The New Adventures of Kimba)' },
      { id: '2687', title: 'Shin Tetsujin 28-gō (The New Adventures of Gigantor)' }
    ];

    for (const anime of cases) {
      const result = await resolveEpisodeVideo({
        anime,
        seasonNumber: 1,
        episodeNumber: 1
      });
      assert.equal(result.available, false);
      assert.equal(result.sourceStatus, 'source-unverified');
      assert.equal(result.streamUrl, null);
      assert.equal(result.embedUrl, null);
      assert.equal(result.durationSeconds, null);
    }
  });

  it('resolves distinct allow-listed sources only for exact, catalogued open-film entries', async () => {
    const { resolveEpisodeVideo } = await import('./videoRegistry.js');
    const sintel = await resolveEpisodeVideo({
      anime: { id: 'sintel-dragon-chronicles', title: 'Sintel (Blender Open Animated Film)' },
      seasonNumber: 1,
      episodeNumber: 1
    });
    const tears = await resolveEpisodeVideo({
      anime: { id: 'tears-of-steel', title: 'Tears of Steel (Mango Open Sci-Fi Film)' },
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(sintel.available, true);
    assert.equal(tears.available, true);
    assert.ok(sintel.streamUrl.toLowerCase().includes('sintel'));
    assert.ok(tears.streamUrl.toLowerCase().includes('tears'));
    assert.notEqual(sintel.streamUrl, tears.streamUrl);
  });

  it('marks unhosted AniList anime as unavailable without playing another title video or auto-playing a trailer', async () => {
    const { resolveEpisodeVideo } = await import('./videoRegistry.js');
    const bokuNoPico = await resolveEpisodeVideo({
      anime: { id: '539', title: 'Boku no Pico' },
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(bokuNoPico.available, false);
    assert.equal(bokuNoPico.contentType, 'external_licensed_episode');
    assert.equal(bokuNoPico.streamUrl, null, 'Must NEVER return a fallback or another anime video!');
    assert.equal(bokuNoPico.embedUrl, null, 'Must NEVER assign a trailer embedUrl to an episode!');
    assert.match(bokuNoPico.reason, /Trailers are never substituted for full episodes/);
  });
});


