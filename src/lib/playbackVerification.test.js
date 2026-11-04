import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEpisodeVideo, VERIFIED_DIRECT_ANIME } from './videoRegistry.js';
import { CURATED_ANIME } from '../data/animeData.js';
import { mapAniListMediaToAnime } from './anilistClient.js';

describe('Mandatory Playback Mapping Verification: 10+ Titles & Multiple Episodes', () => {
  // Title 1: Sintel
  it('Title 1: Sintel loads distinct videos for Episode 1 and Episode 2', async () => {
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
    assert.equal(ep1.streamUrl, '/streams/sintel-ep1.mp4');
    assert.equal(ep2.streamUrl, '/streams/sintel-ep2.mp4');
    assert.notEqual(ep1.streamUrl, ep2.streamUrl);
  });

  // Title 2: Tears of Steel
  it('Title 2: Tears of Steel loads distinct mecha videos, different from Sintel', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['tears-of-steel'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    const ep2 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['tears-of-steel'],
      seasonNumber: 1,
      episodeNumber: 2
    });

    assert.equal(ep1.available, true);
    assert.equal(ep2.available, true);
    assert.equal(ep1.streamUrl, '/streams/tears-ep1.mp4');
    assert.equal(ep2.streamUrl, '/streams/tears-ep2.mp4');
    assert.notEqual(ep1.streamUrl, ep2.streamUrl);
    assert.notEqual(ep1.streamUrl, '/streams/sintel-ep1.mp4');
  });

  // Title 3: Elephants Dream
  it('Title 3: Elephants Dream loads distinct steampunk videos', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['elephants-dream'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    const ep2 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['elephants-dream'],
      seasonNumber: 1,
      episodeNumber: 2
    });

    assert.equal(ep1.available, true);
    assert.equal(ep2.available, true);
    assert.equal(ep1.streamUrl, '/streams/elephants-ep1.mp4');
    assert.equal(ep2.streamUrl, '/streams/elephants-ep2.mp4');
    assert.notEqual(ep1.streamUrl, '/streams/tears-ep1.mp4');
    assert.notEqual(ep1.streamUrl, '/streams/sintel-ep1.mp4');
  });

  // Title 4: Popeye
  it('Title 4: Popeye loads distinct vintage animation videos', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['popeye-sailor-chronicles'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    assert.equal(ep1.available, true);
    assert.equal(ep1.streamUrl, '/streams/popeye-ep1.mp4');
  });

  // Title 5: Superman
  it('Title 5: Superman loads distinct superhero animation videos', async () => {
    const ep1 = await resolveEpisodeVideo({
      anime: VERIFIED_DIRECT_ANIME['superman-1941-fleischer'],
      seasonNumber: 1,
      episodeNumber: 1
    });
    assert.equal(ep1.available, true);
    assert.equal(ep1.streamUrl, '/streams/superman-ep1.mp4');
  });

  // Title 6: Frieren (Licensed Partner)
  it('Title 6: Frieren is strictly partner-only and NEVER plays another title video', async () => {
    const frieren = CURATED_ANIME.find(a => a.id === '52991');
    assert.equal(frieren.availability_type, 'licensed-partner');
    const ep1 = await resolveEpisodeVideo({
      anime: frieren,
      seasonNumber: 1,
      episodeNumber: 1
    });
    assert.equal(ep1.available, false);
    assert.equal(ep1.streamUrl, null);
    assert.equal(ep1.embedUrl, 'https://www.youtube-nocookie.com/embed/ZEkwCGJ3o7M?rel=0');
  });

  // Title 7: Solo Leveling (Licensed Partner)
  it('Title 7: Solo Leveling is strictly partner-only without fake stream reuse', async () => {
    const solo = CURATED_ANIME.find(a => a.id === '52299');
    assert.equal(solo.availability_type, 'licensed-partner');
    const ep1 = await resolveEpisodeVideo({
      anime: solo,
      seasonNumber: 1,
      episodeNumber: 1
    });
    assert.equal(ep1.available, false);
    assert.equal(ep1.streamUrl, null);
    assert.equal(ep1.embedUrl, 'https://www.youtube-nocookie.com/embed/bssSj4cKsrI?rel=0');
  });

  // Title 8: Boku no Pico (from User's Screenshot #1)
  it('Title 8: Boku no Pico (AniList ID 539) resolves to unavailable without playing any video', async () => {
    const bokuNoPico = mapAniListMediaToAnime({
      id: 539,
      title: { english: 'Boku no Pico', romaji: 'Boku no Pico' },
      isAdult: true,
      episodes: 1,
      duration: 34
    });

    const res = await resolveEpisodeVideo({
      anime: bokuNoPico,
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(res.available, false);
    assert.equal(res.streamUrl, null, 'MUST NEVER PLAY A FALLBACK VIDEO!');
    assert.match(res.reason, /In-app direct video stream is not hosted/);
  });

  // Title 9: Taboo Charming Mother (from User's Screenshot #2)
  it('Title 9: Taboo Charming Mother (AniList ID 11210) resolves to unavailable without playing any video', async () => {
    const taboo = mapAniListMediaToAnime({
      id: 11210,
      title: { english: 'Taboo Charming Mother', romaji: 'Taboo Charming Mother' },
      isAdult: true,
      episodes: 1,
      duration: 30
    });

    const res = await resolveEpisodeVideo({
      anime: taboo,
      seasonNumber: 1,
      episodeNumber: 1
    });

    assert.equal(res.available, false);
    assert.equal(res.streamUrl, null, 'MUST NEVER PLAY A FALLBACK VIDEO!');
  });

  // Title 10: Chainsaw Man
  it('Title 10: Chainsaw Man is strictly partner-only with official trailer', async () => {
    const csm = CURATED_ANIME.find(a => a.id === '44511');
    const res = await resolveEpisodeVideo({
      anime: csm,
      seasonNumber: 1,
      episodeNumber: 1
    });
    assert.equal(res.available, false);
    assert.equal(res.streamUrl, null);
    assert.equal(res.embedUrl, 'https://www.youtube-nocookie.com/embed/q15CRdE5Bv0?rel=0');
  });

  // Title 11: Spy x Family
  it('Title 11: Spy x Family is strictly partner-only with official trailer', async () => {
    const sxf = CURATED_ANIME.find(a => a.id === '50265');
    const res = await resolveEpisodeVideo({
      anime: sxf,
      seasonNumber: 1,
      episodeNumber: 1
    });
    assert.equal(res.available, false);
    assert.equal(res.streamUrl, null);
    assert.equal(res.embedUrl, 'https://www.youtube-nocookie.com/embed/ofXigq9aIpo?rel=0');
  });

  // Title 12: Dandadan
  it('Title 12: Dandadan is strictly partner-only with official trailer', async () => {
    const ddd = CURATED_ANIME.find(a => a.id === '57334');
    const res = await resolveEpisodeVideo({
      anime: ddd,
      seasonNumber: 1,
      episodeNumber: 1
    });
    assert.equal(res.available, false);
    assert.equal(res.streamUrl, null);
    assert.equal(res.embedUrl, 'https://www.youtube-nocookie.com/embed/0XJxfbN36Uw?rel=0');
  });
});
