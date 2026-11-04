import React, { useState, useEffect, useRef } from 'react';
import { queryAniList, ANILIST_AUTOCOMPLETE_QUERY } from '../lib/anilistClient.js';

export const ANILIST_GENRES = [
  'All',
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller'
];

export const ANILIST_FORMATS = [
  { id: 'All', label: 'All Formats' },
  { id: 'TV', label: 'TV Series' },
  { id: 'MOVIE', label: 'Movies' },
  { id: 'TV_SHORT', label: 'TV Shorts' },
  { id: 'OVA', label: 'OVA' },
  { id: 'ONA', label: 'ONA' },
  { id: 'SPECIAL', label: 'Specials' }
];

export const ANILIST_SEASONS = [
  { id: 'All', label: 'All Seasons' },
  { id: 'WINTER', label: 'Winter' },
  { id: 'SPRING', label: 'Spring' },
  { id: 'SUMMER', label: 'Summer' },
  { id: 'FALL', label: 'Fall' }
];

export const ANILIST_SORTS = [
  { id: 'TRENDING_DESC', label: 'Trending' },
  { id: 'POPULARITY_DESC', label: 'Popularity' },
  { id: 'SCORE_DESC', label: 'Top Rated' },
  { id: 'START_DATE_DESC', label: 'Release Date (Newest)' },
  { id: 'FAVOURITES_DESC', label: 'Most Anticipated / Favorited' }
];

export function AniListSearch({
  query,
  onQueryChange,
  onSelectAnime,
  isAdultAllowed = false,
  selectedGenre = 'All',
  onSelectGenre,
  selectedFormat = 'All',
  onSelectFormat,
  selectedSeason = 'All',
  onSelectSeason,
  selectedYear = 'All',
  onSelectYear,
  selectedSort = 'TRENDING_DESC',
  onSelectSort,
  onOpenAdvancedFilters,
  showFilters = false,
  onToggleFilters
}) {
  const [autocompleteItems, setAutocompleteItems] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Debounced autocomplete search against AniList GraphQL
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setAutocompleteItems([]);
      setShowDropdown(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const res = await queryAniList(ANILIST_AUTOCOMPLETE_QUERY, {
          search: trimmed,
          isAdult: isAdultAllowed
        });

        if (cancelled) return;
        const items = res?.Page?.media || [];
        const seen = new Set();
        const deduped = items.filter((m) => {
          if (!m || !m.id || seen.has(String(m.id))) return false;
          seen.add(String(m.id));
          return true;
        });
        setAutocompleteItems(deduped);
        setShowDropdown(deduped.length > 0);
      } catch (err) {
        if (!cancelled) {
          console.warn('[AniList Autocomplete] Search error:', err.message);
          setAutocompleteItems([]);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isAdultAllowed]);

  // Click outside listener to dismiss autocomplete
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            if (e.target.value.trim().length >= 2) setShowDropdown(true);
          }}
          onFocus={() => {
            if (autocompleteItems.length > 0) setShowDropdown(true);
          }}
          placeholder="Search thousands of anime by English, Romaji, or Japanese title..."
          aria-label="Search anime by title"
          className="w-full rounded-xl border border-white/15 bg-[#13121A] px-4 py-2.5 pl-10 pr-24 text-sm text-white placeholder-[#94A3B8] focus:border-[#F43F5E] focus:outline-none transition shadow-inner"
        />
        <span className="absolute left-3.5 text-[#94A3B8] text-sm pointer-events-none">🔍</span>

        {/* Clear & Filter Toggle Buttons inside input */}
        <div className="absolute right-2 flex items-center gap-1.5">
          {query && (
            <button
              type="button"
              onClick={() => {
                onQueryChange('');
                setAutocompleteItems([]);
                setShowDropdown(false);
              }}
              className="text-[#94A3B8] hover:text-white px-1.5 text-xs font-mono"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}

          <button
            type="button"
            onClick={onToggleFilters}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition flex items-center gap-1 ${
              showFilters
                ? 'border-[#F43F5E] bg-[#F43F5E]/15 text-[#F43F5E]'
                : 'border-white/15 bg-white/5 text-[#94A3B8] hover:text-white'
            }`}
          >
            <span>Filters</span>
            <span className="text-[10px]">{showFilters ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      {/* Instant Autocomplete Suggestions Popover */}
      {showDropdown && autocompleteItems.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-white/15 bg-[#13121A]/95 backdrop-blur-xl shadow-2xl overflow-hidden divide-y divide-white/5">
          <div className="p-2 px-3 text-[11px] font-mono uppercase tracking-wider text-[#94A3B8] flex items-center justify-between bg-[#0B0A0E]/80">
            <span>AniList Instant Match</span>
            {isSearching && <span className="text-[#38BDF8] animate-pulse">Searching...</span>}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {autocompleteItems.map((item, idx) => {
              const displayTitle = item.title?.userPreferred || item.title?.english || item.title?.romaji;
              const subTitle = item.title?.native || item.title?.romaji;

              return (
                <button
                  key={`auto-${item.id}-${idx}`}
                  type="button"
                  onClick={() => {
                    onSelectAnime(item);
                    setShowDropdown(false);
                  }}
                  className="w-full p-2.5 text-left hover:bg-white/5 transition flex items-center gap-3 group"
                >
                  <div className="w-10 h-14 rounded-lg overflow-hidden bg-black/40 shrink-0 border border-white/10">
                    {item.coverImage?.medium && (
                      <img
                        src={item.coverImage.medium}
                        alt={displayTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-bold text-white group-hover:text-[#F43F5E] transition truncate">
                      {displayTitle}
                    </div>
                    {subTitle && (
                      <div className="text-[11px] font-mono text-[#94A3B8] truncate">
                        {subTitle}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-[#64748B]">
                      <span>{item.format || 'TV'}</span>
                      <span>·</span>
                      <span>{item.seasonYear || 'N/A'}</span>
                      <span>·</span>
                      <span className="text-amber-400">★ {item.averageScore ? (item.averageScore / 10).toFixed(1) : '8.0'}</span>
                      <span>·</span>
                      <span className="text-emerald-400 capitalize">{item.status?.toLowerCase() || 'airing'}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable Advanced Filter Drawer */}
      {showFilters && (
        <div className="mt-3 rounded-xl border border-white/10 bg-[#161420] p-4 space-y-3.5 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-[#94A3B8]">
              AniList Catalog Filters & Sort
            </span>
            <button
              type="button"
              onClick={() => {
                onSelectGenre('All');
                onSelectFormat('All');
                onSelectSeason('All');
                onSelectYear('All');
                onSelectSort('TRENDING_DESC');
              }}
              className="text-[11px] text-[#F43F5E] hover:underline font-mono"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* Sort Selector */}
            <div>
              <label className="block text-[11px] font-mono text-[#94A3B8] mb-1">
                Sort Order
              </label>
              <select
                aria-label="Sort order"
                value={selectedSort}
                onChange={(e) => onSelectSort(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-2.5 py-1.5 text-xs text-white"
              >
                {ANILIST_SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Format Selector */}
            <div>
              <label className="block text-[11px] font-mono text-[#94A3B8] mb-1">
                Format
              </label>
              <select
                aria-label="Anime format"
                value={selectedFormat}
                onChange={(e) => onSelectFormat(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-2.5 py-1.5 text-xs text-white"
              >
                {ANILIST_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Season Selector */}
            <div>
              <label className="block text-[11px] font-mono text-[#94A3B8] mb-1">
                Season
              </label>
              <select
                aria-label="Anime season"
                value={selectedSeason}
                onChange={(e) => onSelectSeason(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-2.5 py-1.5 text-xs text-white"
              >
                {ANILIST_SEASONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Selector */}
            <div>
              <label className="block text-[11px] font-mono text-[#94A3B8] mb-1">
                Release Year
              </label>
              <select
                aria-label="Release year"
                value={selectedYear}
                onChange={(e) => onSelectYear(e.target.value)}
                className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-2.5 py-1.5 text-xs text-white"
              >
                <option value="All">All Years</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
                <option value="2021">2021</option>
                <option value="2020">2020</option>
                <option value="2010s">2010 - 2019</option>
                <option value="2000s">2000 - 2009</option>
                <option value="classics">Classics (Pre-2000)</option>
              </select>
            </div>
          </div>

          {/* Genre Chips */}
          <div>
            <label className="block text-[11px] font-mono text-[#94A3B8] mb-1.5">
              Genre Selection
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {ANILIST_GENRES.map((g) => {
                const isSelected = selectedGenre === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onSelectGenre(g)}
                    className={`rounded-md px-2.5 py-1 text-xs transition ${
                      isSelected
                        ? 'bg-[#F43F5E] text-white font-semibold'
                        : 'border border-white/10 bg-white/5 text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
