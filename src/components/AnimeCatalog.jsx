import { useMemo, useState } from 'react'

const anime = [
  {
    title: 'Cowboy Bebop',
    year: 1998,
    rating: 9.2,
    genres: ['Sci-Fi', 'Action', 'Space Fantasy'],
    description: 'A crew of bounty hunters drifts through a future shaped by music, mystery, and second chances.',
    poster: 'bebop',
  },
  {
    title: 'Cyberpunk: Edgerunners',
    year: 2022,
    rating: 8.7,
    genres: ['Sci-Fi', 'Action', 'Drama'],
    description: 'A determined street kid fights to survive in a city that never stops taking.',
    poster: 'cyberpunk',
  },
  {
    title: 'Sailor Moon',
    year: 1992,
    rating: 8.4,
    genres: ['Space Fantasy', 'Action', 'Romance'],
    description: 'A schoolgirl discovers a cosmic destiny alongside a team of guardian heroes.',
    poster: 'sailor',
  },
  {
    title: 'Mobile Suit Gundam: The Witch from Mercury',
    year: 2022,
    rating: 8.2,
    genres: ['Mecha', 'Sci-Fi', 'Action'],
    description: 'A new student arrives at an elite mobile-suit academy with a mysterious machine.',
    poster: 'gundam',
  },
  {
    title: 'Frieren: Beyond Journey’s End',
    year: 2023,
    rating: 9.4,
    genres: ['Fantasy', 'Adventure', 'Drama'],
    description: 'An elven mage retraces an old adventure and learns what a lifetime means to others.',
    poster: 'frieren',
  },
  {
    title: 'One-Punch Man',
    year: 2015,
    rating: 8.6,
    genres: ['Action', 'Sci-Fi', 'Comedy'],
    description: 'A hero who wins every fight searches for a challenge worthy of his strength.',
    poster: 'punch',
  },
  {
    title: 'Violet Evergarden',
    year: 2018,
    rating: 8.8,
    genres: ['Drama', 'Fantasy', 'Romance'],
    description: 'A former soldier discovers the meaning of love while writing letters for others.',
    poster: 'violet',
  },
  {
    title: 'Space Dandy',
    year: 2014,
    rating: 8.1,
    genres: ['Sci-Fi', 'Space Fantasy', 'Comedy'],
    description: 'An eccentric alien hunter explores a colorful universe with his unusual crew.',
    poster: 'dandy',
  },
]

const categories = [
  'All',
  'Sci-Fi',
  'Action',
  'Space Fantasy',
  'Mecha',
  'Adventure',
  'Drama',
  'Fantasy',
  'Romance',
  'Comedy',
]

function AnimeCard({ title, year, rating, genres, description, poster }) {
  return (
    <article className="anime-card">
      <div
        aria-label={`Stylized color artwork for ${title}`}
        className={`anime-poster anime-poster--${poster}`}
        role="img"
      >
        <span aria-hidden="true" className="anime-poster__orbit" />
        <span aria-hidden="true" className="anime-poster__glow" />
        <span className="anime-poster__eyebrow">ASTRA ANIME GUIDE · {year}</span>
        <span className="anime-poster__title">{title}</span>
        <span className="anime-rating" aria-label={`Astra editorial score: ${rating.toFixed(1)} out of 10`}>
          <span aria-hidden="true">★</span> {rating.toFixed(1)}
        </span>
      </div>
      <div className="anime-card__details">
        <div className="anime-card__heading">
          <h3>{title}</h3>
          <span>{year}</span>
        </div>
        <p>{description}</p>
        <ul aria-label={`${title} genres`} className="anime-card__genres">
          {genres.map((genre) => <li key={genre}>{genre}</li>)}
        </ul>
      </div>
    </article>
  )
}

export default function AnimeCatalog() {
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase()
  const filteredAnime = useMemo(
    () => anime.filter((item) => {
      const matchesCategory = activeCategory === 'All' || item.genres.includes(activeCategory)
      const matchesSearch = !normalizedSearch
        || [item.title, item.description, ...item.genres]
          .some((value) => value.toLocaleLowerCase().includes(normalizedSearch))

      return matchesCategory && matchesSearch
    }),
    [activeCategory, normalizedSearch],
  )

  return (
    <section aria-labelledby="gallery-title" className="gallery-section" id="gallery">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Find your next favorite</span>
          <h2 id="gallery-title">
            Stories across
            <br className="mobile-break" /> <span>the stars.</span>
          </h2>
        </div>
        <p>
          Explore a handpicked anime guide by genre or search for a story
          that fits your mood.
        </p>
      </div>
      <div className="anime-catalog__search-row">
        <label className="anime-catalog__search">
          <span aria-hidden="true">⌕</span>
          <input
            onChange={(event) => setSearchTerm(event.currentTarget.value)}
            placeholder="Search titles, stories, or genres"
            type="search"
            value={searchTerm}
          />
          <span className="visually-hidden">Search anime catalog</span>
        </label>
        <span className="anime-catalog__count" aria-live="polite">
          {filteredAnime.length} {filteredAnime.length === 1 ? 'title' : 'titles'}
        </span>
      </div>
      <div aria-label="Filter anime by genre" className="catalog-filters">
        {categories.map((category) => (
          <button
            aria-pressed={activeCategory === category}
            className={`catalog-filter${activeCategory === category ? ' is-active' : ''}`}
            key={category}
            onClick={() => setActiveCategory(category)}
            type="button"
          >
            {category}
          </button>
        ))}
      </div>
      {filteredAnime.length > 0 ? (
        <div aria-live="polite" className="anime-card-grid">
          {filteredAnime.map((item) => <AnimeCard key={item.title} {...item} />)}
        </div>
      ) : (
        <p className="anime-catalog__empty" role="status">
          No titles match that search. Try another title or genre.
        </p>
      )}
      <p className="anime-catalog__rating-note">
        Ratings are Astra’s editorial picks, not live review aggregates.
      </p>
    </section>
  )
}
