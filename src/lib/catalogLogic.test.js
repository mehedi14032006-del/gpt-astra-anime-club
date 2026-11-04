import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isMatureRating,
  resolveEmbedSource,
  filterCatalog,
  toggleWatchlistItem,
  updateWatchProgress,
  validateAuthCredentials,
} from './catalogLogic.js'

test('isMatureRating identifies R-17+, R+, and explicit mature flags accurately', () => {
  assert.equal(isMatureRating('R - 17+ (violence & profanity)', false), true)
  assert.equal(isMatureRating('PG-13 - Teens 13 or older', false), false)
  assert.equal(isMatureRating('PG-13', true), true)
  assert.equal(isMatureRating('', false), false)
})

test('resolveEmbedSource transforms YouTube playlists, watch URLs, Archive.org, and MP4 URLs', () => {
  const ytPlaylist = resolveEmbedSource(
    'https://www.youtube.com/playlist?list=PLwLSw1_eDZl2XdtLhB9NG2Ch050jWFm9G',
  )
  assert.deepEqual(ytPlaylist, {
    type: 'iframe',
    provider: 'youtube-playlist',
    src: 'https://www.youtube-nocookie.com/embed/videoseries?autoplay=1&list=PLwLSw1_eDZl2XdtLhB9NG2Ch050jWFm9G',
  })

  const ytVideo = resolveEmbedSource('https://youtu.be/dQw4w9WgXcQ')
  assert.equal(ytVideo?.type, 'iframe')
  assert.equal(
    ytVideo?.src,
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
  )

  const archiveEmbed = resolveEmbedSource('https://archive.org/details/night_of_the_living_dead')
  assert.equal(archiveEmbed?.src, 'https://archive.org/embed/night_of_the_living_dead')

  const directVideo = resolveEmbedSource('https://cdn.example.com/episodes/ep1.mp4')
  assert.deepEqual(directVideo, {
    type: 'video',
    provider: 'direct',
    src: 'https://cdn.example.com/episodes/ep1.mp4',
  })

  assert.equal(resolveEmbedSource('not-a-url'), null)
})

test('filterCatalog filters by search query, genre, audio track, free status, and sorts', () => {
  const sample = [
    {
      id: '1',
      title: 'One Punch Man',
      genre: 'Action',
      genres: ['Action', 'Comedy'],
      score: 8.5,
      year: 2015,
      is_free_series: true,
      has_dub: true,
      is_mature: false,
      popularity_rank: 2,
    },
    {
      id: '2',
      title: 'Frieren: Beyond Journey’s End',
      genre: 'Fantasy',
      genres: ['Fantasy', 'Adventure'],
      score: 9.3,
      year: 2023,
      is_free_series: false,
      has_dub: true,
      is_mature: false,
      popularity_rank: 1,
    },
    {
      id: '3',
      title: 'Attack on Titan',
      genre: 'Action',
      genres: ['Action', 'Drama'],
      score: 9.0,
      year: 2013,
      is_free_series: true,
      has_dub: false,
      is_mature: true,
      popularity_rank: 3,
    },
  ]

  const actionOnly = filterCatalog(sample, { genre: 'Action' })
  assert.equal(actionOnly.length, 2)

  const freeActionNonMature = filterCatalog(sample, {
    genre: 'Action',
    onlyFree: true,
    hideMature: true,
  })
  assert.equal(freeActionNonMature.length, 1)
  assert.equal(freeActionNonMature[0].title, 'One Punch Man')

  const byScore = filterCatalog(sample, { sortBy: 'score' })
  assert.equal(byScore[0].title, 'Frieren: Beyond Journey’s End')

  const queryMatch = filterCatalog(sample, { query: 'titan' })
  assert.equal(queryMatch.length, 1)
  assert.equal(queryMatch[0].id, '3')
})

test('toggleWatchlistItem adds and removes anime IDs deterministically', () => {
  const step1 = toggleWatchlistItem([], 'fb0')
  assert.deepEqual(step1, ['fb0'])

  const step2 = toggleWatchlistItem(step1, 'fb1')
  assert.deepEqual(step2, ['fb1', 'fb0'])

  const step3 = toggleWatchlistItem(step2, 'fb0')
  assert.deepEqual(step3, ['fb1'])
})

test('updateWatchProgress deduplicates and moves latest watched anime to the top', () => {
  const h1 = updateWatchProgress([], {
    animeId: 'fb0',
    episodeNumber: 1,
    episodeTitle: 'The Strongest Man',
    progressPercent: 45,
    timestamp: 1000,
  })
  assert.equal(h1.length, 1)
  assert.equal(h1[0].progressPercent, 45)

  const h2 = updateWatchProgress(h1, {
    animeId: 'fb1',
    episodeNumber: 2,
    progressPercent: 80,
    timestamp: 2000,
  })
  assert.equal(h2[0].animeId, 'fb1')

  const h3 = updateWatchProgress(h2, {
    animeId: 'fb0',
    episodeNumber: 3,
    progressPercent: 90,
    timestamp: 3000,
  })
  assert.equal(h3.length, 2)
  assert.equal(h3[0].animeId, 'fb0')
  assert.equal(h3[0].episodeNumber, 3)
})

test('validateAuthCredentials enforces email format and password length requirements', () => {
  assert.equal(validateAuthCredentials({ email: '', password: 'password123' }).valid, false)
  assert.equal(validateAuthCredentials({ email: 'bad-email', password: 'password123' }).valid, false)
  assert.equal(
    validateAuthCredentials({ email: 'fan@kitsune.plus', password: 'short', mode: 'signup' }).valid,
    false,
  )
  assert.equal(
    validateAuthCredentials({ email: 'fan@kitsune.plus', password: 'strongPassword9!', mode: 'signup' })
      .valid,
    true,
  )
})
