import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CURATED_ANIME } from './data/animeData.js';
import {
  GENRES,
  FORMAT_FILTERS,
  filterCatalog,
  isMatureAnime,
  updateWatchProgress,
  verifyAgeFromBirthDate,
  getAvailabilityStatus,
  getAnimeSeasons,
  formatTimestamp
} from './lib/catalogLogic.js';
import {
  queryAniList,
  ANILIST_DISCOVERY_QUERY,
  ANILIST_SEARCH_QUERY,
  ANILIST_MEDIA_DETAIL_QUERY,
  mapAniListMediaToAnime,
  getCurrentSeasonAndYear
} from './lib/anilistClient.js';
import {
  fetchJikan,
  mapJikanMediaToAnime,
  deduplicateCrossApiCatalog
} from './lib/jikanClient.js';
import { ScreeningModal } from './components/ScreeningModal.jsx';
import { AnimeArtwork } from './components/AnimeArtwork.jsx';
import { AnimeDetailModal } from './components/AnimeDetailModal.jsx';
import { AniListSearch } from './components/AniListSearch.jsx';
import { AniListSyncModal } from './components/AniListSyncModal.jsx';
import { AdminCatalogModal } from './components/AdminCatalogModal.jsx';
import { supabase, isSupabaseConfigured } from './lib/supabase.js';

const STORAGE_KEYS = {
  WATCH_PROGRESS: 'kitsune_watch_progress_v2',
  WATCHLIST: 'kitsune_watchlist_v2',
  USER_LISTS: 'kitsune_user_lists_v2',
  RECENTLY_VIEWED: 'kitsune_recently_viewed_v2',
  AGE_VERIFICATION: 'kitsune_age_verification_v2',
  PREMIUM: 'kitsune_premium_v2',
  SYNCED_ANILIST_USER: 'kitsune_synced_anilist_user_v2'
};

export default function App() {
  // Direct curated matches dictionary for instant full-episode stream resolution
  const curatedDirectMatches = useMemo(() => {
    const map = {};
    for (const item of CURATED_ANIME) {
      if (item.id) map[String(item.id)] = item;
      if (item.mal_id) map[String(item.mal_id)] = item;
      if (item.anilist_id) map[String(item.anilist_id)] = item;
    }
    return map;
  }, []);

  // Main Discovery & Search State
  const [activeNav, setActiveNav] = useState('discovery'); // 'discovery' | 'direct-streams' | 'library' | 'simulcast'
  const [discoverySection, setDiscoverySection] = useState('trending');

  // AniList + Jikan Discovery Cached Buckets
  const [discoveryData, setDiscoveryData] = useState({
    trending: [],
    popular: [],
    topRated: [],
    airing: [],
    upcoming: [],
    seasonal: [],
    movies: [],
    classic: [],
    underrated: []
  });
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState(null);
  const [discoveryPageBySection, setDiscoveryPageBySection] = useState({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [selectedFormat, setSelectedFormat] = useState('All');
  const [selectedSeason, setSelectedSeason] = useState('All');
  const [selectedYear, setSelectedYear] = useState('All');
  const [selectedSort, setSelectedSort] = useState('TRENDING_DESC');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Dynamic AniList Search Results
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Detail Modal, Screening Modal & Admin Console Modal
  const [selectedDetailAnime, setSelectedDetailAnime] = useState(null);
  const [activeScreening, setActiveScreening] = useState(null);
  const [showAdminModal, setShowAdminModal] = useState(false);

  // AniList Account Sync Modal
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncedUser, setSyncedUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SYNCED_ANILIST_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Strict 18+ Age Verification & Minor Protection State
  const [ageState, setAgeState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.AGE_VERIFICATION);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return {
      verifiedAdult: false,
      isMinorLock: false,
      safeModeEnabled: true,
      verifiedAge: null,
      regionMinAge: 18
    };
  });

  // DOB Form State inside 18+ Verification Gate
  const [dobYear, setDobYear] = useState('2000');
  const [dobMonth, setDobMonth] = useState('04');
  const [dobDay, setDobDay] = useState('15');
  const [regionMinAge, setRegionMinAge] = useState(18);
  const [ageGateError, setAgeGateError] = useState('');
  const [pendingMatureSelect, setPendingMatureSelect] = useState(null);
  const [showAgeModal, setShowAgeModal] = useState(false);

  // Categorized User Lists (Watching, Plan to Watch, Completed, Favorites, Dropped, On Hold)
  const [userLists, setUserLists] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_LISTS);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return {
      watching: ['52991'],
      planToWatch: ['52299'],
      completed: ['32281'],
      favorites: ['52991', '50265'],
      onHold: [],
      dropped: []
    };
  });

  // Recently Viewed History
  const [recentlyViewed, setRecentlyViewed] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.RECENTLY_VIEWED);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [isPremium, setIsPremium] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.PREMIUM) === '1';
    } catch {
      return false;
    }
  });

  const [watchProgress, setWatchProgress] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.WATCH_PROGRESS);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Auth & Premium Modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [userSession, setUserSession] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authStatusMsg, setAuthStatusMsg] = useState('');

  // Persist State to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.WATCH_PROGRESS, JSON.stringify(watchProgress));
    } catch {
      // ignore
    }
  }, [watchProgress]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USER_LISTS, JSON.stringify(userLists));
    } catch {
      // ignore
    }
  }, [userLists]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.RECENTLY_VIEWED, JSON.stringify(recentlyViewed));
    } catch {
      // ignore
    }
  }, [recentlyViewed]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.AGE_VERIFICATION, JSON.stringify(ageState));
    } catch {
      // ignore
    }
  }, [ageState]);

  useEffect(() => {
    try {
      if (syncedUser) {
        localStorage.setItem(STORAGE_KEYS.SYNCED_ANILIST_USER, JSON.stringify(syncedUser));
      } else {
        localStorage.removeItem(STORAGE_KEYS.SYNCED_ANILIST_USER);
      }
    } catch {
      // ignore
    }
  }, [syncedUser]);

  // Adult content allowed flag
  const isAdultAllowed = ageState.verifiedAdult && !ageState.safeModeEnabled && !ageState.isMinorLock;

  // 1. Fetch AniList Discovery Sections on Load (with Jikan v4 secondary fallback & cross-API deduplication)
  useEffect(() => {
    let cancelled = false;
    setIsDiscoveryLoading(true);
    setDiscoveryError(null);

    async function fetchDiscovery() {
      const { season, year } = getCurrentSeasonAndYear();

      try {
        const data = await queryAniList(ANILIST_DISCOVERY_QUERY, {
          season,
          seasonYear: year,
          isAdult: isAdultAllowed
        });

        if (cancelled) return;

        const mapSection = (pageData) => {
          const media = pageData?.media || [];
          const mapped = media
            .map((m) => mapAniListMediaToAnime(m, curatedDirectMatches))
            .filter(Boolean);
          return deduplicateCrossApiCatalog(mapped);
        };

        const verifiedFullSeries = CURATED_ANIME.filter(
          (a) => a.availability_type === 'direct-hd'
        );
        const verifiedMovies = verifiedFullSeries.filter((a) => a.format === 'Movie');

        setDiscoveryData({
          trending: deduplicateCrossApiCatalog([
            ...verifiedFullSeries.slice(0, 6),
            ...mapSection(data?.trending)
          ]),
          popular: mapSection(data?.popular),
          topRated: mapSection(data?.topRated),
          airing: mapSection(data?.airing),
          upcoming: mapSection(data?.upcoming),
          seasonal: mapSection(data?.seasonal),
          movies: deduplicateCrossApiCatalog([
            ...verifiedMovies,
            ...mapSection(data?.movies)
          ]),
          classic: deduplicateCrossApiCatalog([
            ...verifiedFullSeries,
            ...mapSection(data?.classic)
          ]),
          underrated: mapSection(data?.underrated)
        });
      } catch (err) {
        if (cancelled) return;
        console.warn('[AniList Discovery] Trying Jikan v4 secondary metadata fallback:', err.message);

        try {
          const jikanRes = await fetchJikan('/top/anime?limit=18');
          if (!cancelled && Array.isArray(jikanRes?.data) && jikanRes.data.length > 0) {
            const jikanMapped = deduplicateCrossApiCatalog(
              jikanRes.data.map((item) => mapJikanMediaToAnime(item, curatedDirectMatches)).filter(Boolean)
            );
            setDiscoveryData({
              trending: jikanMapped,
              popular: jikanMapped,
              topRated: jikanMapped,
              airing: jikanMapped.filter((a) => a.simulcast),
              upcoming: jikanMapped,
              seasonal: jikanMapped,
              movies: jikanMapped.filter((a) => a.format === 'Movie'),
              classic: jikanMapped,
              underrated: jikanMapped
            });
            return;
          }
        } catch {
          // Proceed to curated fallback
        }

        setDiscoveryError('AniList network sync delayed. Showing verified streaming library.');
        setDiscoveryData({
          trending: CURATED_ANIME,
          popular: CURATED_ANIME,
          topRated: CURATED_ANIME,
          airing: CURATED_ANIME.filter((a) => a.simulcast),
          upcoming: CURATED_ANIME,
          seasonal: CURATED_ANIME,
          movies: CURATED_ANIME.filter((a) => a.format === 'Movie'),
          classic: CURATED_ANIME,
          underrated: CURATED_ANIME
        });
      } finally {
        if (!cancelled) setIsDiscoveryLoading(false);
      }
    }

    fetchDiscovery();
    return () => {
      cancelled = true;
    };
  }, [isAdultAllowed, curatedDirectMatches]);

  // 2. Execute Dynamic AniList Search when query or filters change
  useEffect(() => {
    const hasSearch = searchQuery.trim().length > 0;
    const hasFilters =
      selectedGenre !== 'All' ||
      selectedFormat !== 'All' ||
      selectedSeason !== 'All' ||
      selectedYear !== 'All' ||
      selectedSort !== 'TRENDING_DESC';

    if (!hasSearch && !hasFilters) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const variables = {
          page: 1,
          perPage: 24,
          isAdult: isAdultAllowed,
          sort: [selectedSort]
        };

        if (hasSearch) {
          variables.search = searchQuery.trim();
        }
        if (selectedGenre !== 'All') {
          variables.genre_in = [selectedGenre];
        }
        if (selectedFormat !== 'All') {
          variables.format_in = [selectedFormat];
        }
        if (selectedSeason !== 'All') {
          variables.season = selectedSeason;
        }
        if (selectedYear !== 'All') {
          const numYear = parseInt(selectedYear, 10);
          if (!Number.isNaN(numYear)) {
            variables.seasonYear = numYear;
          }
        }

        const data = await queryAniList(ANILIST_SEARCH_QUERY, variables);
        if (cancelled) return;

        const mediaList = data?.Page?.media || [];
        const seen = new Set();
        const deduped = mediaList.filter((m) => {
          if (!m || !m.id || seen.has(String(m.id))) return false;
          seen.add(String(m.id));
          return true;
        });
        const mapped = deduped.map((m) => mapAniListMediaToAnime(m, curatedDirectMatches)).filter(Boolean);
        setSearchResults(mapped);
      } catch (err) {
        if (!cancelled) {
          console.warn('[AniList Search] Search failed:', err.message);
          setSearchError('Search query failed or rate limited. Please try a different query.');
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    searchQuery,
    selectedGenre,
    selectedFormat,
    selectedSeason,
    selectedYear,
    selectedSort,
    isAdultAllowed,
    curatedDirectMatches
  ]);

  // Current active display items based on navigation & discovery tabs
  const displayedItems = useMemo(() => {
    let list = [];

    // 1. If actively searching or filtering, show searchResults
    if (searchQuery.trim().length > 0 || selectedGenre !== 'All' || selectedFormat !== 'All' || selectedSeason !== 'All' || selectedYear !== 'All') {
      list = searchResults;
    } else if (activeNav === 'direct-streams') {
      // 2. In-App Direct Streams Navigation (5 verified productions with genuine distinct episode video files)
      list = CURATED_ANIME.filter((a) => a.availability_type === 'direct-hd');
    } else if (activeNav === 'simulcast') {
      // 3. Simulcast Navigation
      list = discoveryData.airing.length > 0
        ? discoveryData.airing
        : CURATED_ANIME.filter((a) => a.simulcast);
    } else if (activeNav === 'library') {
      // 4. User Library / Personalization Navigation
      const allSavedIds = new Set([
        ...userLists.watching,
        ...userLists.planToWatch,
        ...userLists.completed,
        ...userLists.favorites,
        ...userLists.onHold,
        ...userLists.dropped
      ]);

      const matched = [];
      const idMap = new Map();

      // Look up in discovery cache, curated items, and search cache
      const pool = [
        ...discoveryData.trending,
        ...discoveryData.popular,
        ...discoveryData.topRated,
        ...CURATED_ANIME,
        ...searchResults
      ];

      for (const item of pool) {
        if (allSavedIds.has(String(item.id)) && !idMap.has(String(item.id))) {
          idMap.set(String(item.id), item);
          matched.push(item);
        }
      }

      list = matched;
    } else {
      // 5. Discovery Navigation: Selected Discovery Section
      const currentSectionList = discoveryData[discoverySection] || [];
      list = currentSectionList.length > 0 ? currentSectionList : CURATED_ANIME;
    }

    // Strictly deduplicate by ID to guarantee unique React child keys
    const seen = new Set();
    return list.filter((item) => {
      if (!item || !item.id) return false;
      const key = String(item.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [
    searchQuery,
    selectedGenre,
    selectedFormat,
    selectedSeason,
    selectedYear,
    searchResults,
    activeNav,
    discoverySection,
    discoveryData,
    userLists
  ]);

  // Spotlight Featured Hero (Frieren or first discovery item)
  const heroAnime = useMemo(() => {
    return discoveryData.trending[0] || CURATED_ANIME[0];
  }, [discoveryData.trending]);

  // Track recently viewed anime
  const trackRecentlyViewed = useCallback((anime) => {
    if (!anime?.id) return;
    setRecentlyViewed((prev) => {
      const filtered = prev.filter((item) => String(item.id) !== String(anime.id));
      return [anime, ...filtered].slice(0, 10);
    });
  }, []);

  // Strict 18+ Adult Gating before opening any Mature anime
  const handleOpenAnime = useCallback((anime, seasonNumber = 1, episodeNumber = 1) => {
    if (!anime) return;
    trackRecentlyViewed(anime);

    if (isMatureAnime(anime)) {
      if (ageState.isMinorLock) {
        setAgeGateError(
          'Access Denied: Minor protection lock is active for this session. 18+ adult anime cannot be accessed.'
        );
        setPendingMatureSelect(null);
        setShowAgeModal(true);
        return;
      }
      if (!ageState.verifiedAdult || ageState.safeModeEnabled) {
        setAgeGateError('');
        setPendingMatureSelect({ anime, seasonNumber, episodeNumber });
        setShowAgeModal(true);
        return;
      }
    }

    const existing = watchProgress[String(anime.id)];
    const targetSeason = existing?.seasonNumber || seasonNumber || 1;
    const targetEp = existing?.episodeNumber || episodeNumber || 1;
    const seasons = getAnimeSeasons(anime);
    const activeSeasonObj =
      seasons.find((s) => s.season_number === targetSeason) || seasons[0];
    const epObj =
      activeSeasonObj?.episodes?.find((e) => e.ep === targetEp) ||
      activeSeasonObj?.episodes?.[0];

    if (epObj?.stream_url) {
      setWatchProgress((prev) =>
        updateWatchProgress(prev, {
          animeId: anime.id,
          seasonNumber: targetSeason,
          episodeNumber: targetEp,
          totalEpisodes: activeSeasonObj?.episodes?.length || anime.episodes || 12,
          episodeTitle: epObj?.title || `Episode ${targetEp}`,
          resumeSeconds: existing?.resumeSeconds || 0,
          durationSeconds: epObj?.duration_seconds || 0
        })
      );
    }

    setActiveScreening({
      anime,
      seasonNumber: targetSeason,
      episodeNumber: targetEp
    });
  }, [ageState, watchProgress, trackRecentlyViewed]);

  const handleOpenDetailModal = useCallback((rawAnime) => {
    if (!rawAnime) return;
    const anime = rawAnime.rawMedia || rawAnime.coverImage?.large || typeof rawAnime.title === 'object'
      ? mapAniListMediaToAnime(rawAnime, curatedDirectMatches)
      : rawAnime;

    trackRecentlyViewed(anime);

    if (isMatureAnime(anime)) {
      if (ageState.isMinorLock) {
        setAgeGateError('Access Denied: 18+ adult anime cannot be viewed while Minor Protection is active.');
        setShowAgeModal(true);
        return;
      }
      if (!ageState.verifiedAdult || ageState.safeModeEnabled) {
        setPendingMatureSelect({ detailAnime: anime });
        setShowAgeModal(true);
        return;
      }
    }

    setSelectedDetailAnime(anime);
  }, [ageState, curatedDirectMatches, trackRecentlyViewed]);

  const handleUpdateUserListStatus = useCallback((animeId, newCategory) => {
    const idStr = String(animeId);
    setUserLists((prev) => {
      const next = {
        watching: prev.watching.filter((id) => id !== idStr),
        planToWatch: prev.planToWatch.filter((id) => id !== idStr),
        completed: prev.completed.filter((id) => id !== idStr),
        favorites: prev.favorites.filter((id) => id !== idStr),
        onHold: (prev.onHold || []).filter((id) => id !== idStr),
        dropped: (prev.dropped || []).filter((id) => id !== idStr)
      };

      if (newCategory && newCategory !== 'none' && next[newCategory]) {
        next[newCategory].push(idStr);
      }
      return next;
    });
  }, []);

  const handleVerifyAgeSubmit = (e) => {
    e.preventDefault();
    const result = verifyAgeFromBirthDate(
      {
        year: Number(dobYear),
        month: Number(dobMonth),
        day: Number(dobDay),
        minAge: Number(regionMinAge)
      },
      new Date()
    );

    if (!result.validInput) {
      setAgeGateError(result.error);
      return;
    }

    if (!result.eligible) {
      // Minor lock active
      setAgeState({
        verifiedAdult: false,
        isMinorLock: true,
        safeModeEnabled: true,
        verifiedAge: result.age,
        regionMinAge: Number(regionMinAge)
      });
      setPendingMatureSelect(null);
      setAgeGateError(result.error);
      return;
    }

    // Adult verified
    setAgeState({
      verifiedAdult: true,
      isMinorLock: false,
      safeModeEnabled: false,
      verifiedAge: result.age,
      regionMinAge: Number(regionMinAge)
    });
    setAgeGateError('');
    setShowAgeModal(false);

    if (pendingMatureSelect?.detailAnime) {
      setSelectedDetailAnime(pendingMatureSelect.detailAnime);
    } else if (pendingMatureSelect?.anime) {
      handleOpenAnime(
        pendingMatureSelect.anime,
        pendingMatureSelect.seasonNumber,
        pendingMatureSelect.episodeNumber
      );
    }
    setPendingMatureSelect(null);
  };

  const handleImportAniListLists = ({ user, lists }) => {
    setSyncedUser(user);
    setUserLists(lists);
    setShowSyncModal(false);
  };

  const handleDisconnectAniList = () => {
    setSyncedUser(null);
  };

  // Pagination: Load next page of AniList items for the active discovery section
  const handleLoadMoreDiscovery = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);

    const currentPage = discoveryPageBySection[discoverySection] || 1;
    const nextPage = currentPage + 1;
    const { season, year } = getCurrentSeasonAndYear();

    const sortBySection = {
      trending: ['TRENDING_DESC', 'POPULARITY_DESC'],
      popular: ['POPULARITY_DESC'],
      topRated: ['SCORE_DESC'],
      airing: ['POPULARITY_DESC'],
      upcoming: ['POPULARITY_DESC'],
      seasonal: ['POPULARITY_DESC'],
      movies: ['POPULARITY_DESC', 'SCORE_DESC'],
      classic: ['SCORE_DESC'],
      underrated: ['SCORE_DESC']
    };

    try {
      const variables = {
        page: nextPage,
        perPage: 18,
        isAdult: isAdultAllowed,
        sort: sortBySection[discoverySection] || ['TRENDING_DESC']
      };

      if (discoverySection === 'movies') {
        variables.format_in = ['MOVIE'];
      } else if (discoverySection === 'seasonal') {
        variables.season = season;
        variables.seasonYear = year;
      }

      const data = await queryAniList(ANILIST_SEARCH_QUERY, variables, { useCache: false });
      const mediaList = data?.Page?.media || [];
      const mapped = mediaList
        .map((m) => mapAniListMediaToAnime(m, curatedDirectMatches))
        .filter(Boolean);

      if (mapped.length > 0) {
        setDiscoveryData((prev) => ({
          ...prev,
          [discoverySection]: deduplicateCrossApiCatalog([
            ...(prev[discoverySection] || []),
            ...mapped
          ])
        }));
        setDiscoveryPageBySection((prev) => ({
          ...prev,
          [discoverySection]: nextPage
        }));
      }
    } catch (err) {
      console.warn('[Discovery Load More] Pagination failed:', err.message);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Continue Watching list sorted by most recently watched
  const continueWatchingItems = useMemo(() => {
    const raw = Object.values(watchProgress)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map((entry) => {
        const pool = [
          ...CURATED_ANIME,
          ...discoveryData.trending,
          ...discoveryData.popular,
          ...discoveryData.movies,
          ...discoveryData.classic,
          ...discoveryData.underrated,
          ...searchResults
        ];
        const anime = pool.find((item) => String(item.id) === String(entry.animeId));
        if (!anime) return null;
        if (!isAdultAllowed && isMatureAnime(anime)) return null;
        return { anime, progress: entry };
      })
      .filter(Boolean);

    const seen = new Set();
    return raw.filter((item) => {
      const id = String(item.anime.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [watchProgress, discoveryData, searchResults, isAdultAllowed]);

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#0B0A0E] text-[#F8FAFC] flex flex-col selection:bg-[#F43F5E] selection:text-white">
      {/* Top Bar: Brand Left, Primary Navigation Center, Search & Account Actions Right */}
      <header className="sticky top-0 z-30 min-h-16 py-2.5 border-b border-white/10 bg-[#0B0A0E]/90 backdrop-blur-xl px-3 sm:px-8 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        {/* Zone 1: Brand Identity */}
        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveNav('discovery');
              setSearchQuery('');
              setSelectedGenre('All');
              setSelectedFormat('All');
            }}
            className="text-lg sm:text-xl font-extrabold tracking-tight text-white flex items-center gap-0.5"
          >
            <span>Kitsune</span>
            <span className="text-[#F43F5E]">+</span>
          </button>

          {/* Primary Navigation Links */}
          <nav className="flex items-center gap-2.5 sm:gap-5 text-xs sm:text-sm font-medium" aria-label="Primary navigation">
            <button
              type="button"
              onClick={() => {
                setActiveNav('discovery');
                setSearchQuery('');
              }}
              className={`transition py-1 ${
                activeNav === 'discovery'
                  ? 'text-white border-b-2 border-[#F43F5E]'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              AniList Discovery
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveNav('direct-streams');
                setSearchQuery('');
              }}
              className={`transition py-1 flex items-center gap-1.5 ${
                activeNav === 'direct-streams'
                  ? 'text-white border-b-2 border-emerald-400 font-semibold'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              <span>Full Episodes In-App (11)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveNav('simulcast');
                setSearchQuery('');
              }}
              className={`transition py-1 ${
                activeNav === 'simulcast'
                  ? 'text-white border-b-2 border-[#F43F5E]'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              Simulcasts
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveNav('library');
                setSearchQuery('');
              }}
              className={`transition py-1 ${
                activeNav === 'library'
                  ? 'text-white border-b-2 border-[#F43F5E]'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              My Library ({userLists.watching.length + userLists.planToWatch.length + userLists.completed.length})
            </button>
          </nav>
        </div>

        {/* Zone 2: Instant AniList Search & Autocomplete Input */}
        <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 md:max-w-xl mx-auto">
          <AniListSearch
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onSelectAnime={(anime) => handleOpenDetailModal(anime)}
            isAdultAllowed={isAdultAllowed}
            selectedGenre={selectedGenre}
            onSelectGenre={setSelectedGenre}
            selectedFormat={selectedFormat}
            onSelectFormat={setSelectedFormat}
            selectedSeason={selectedSeason}
            onSelectSeason={setSelectedSeason}
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
            selectedSort={selectedSort}
            onSelectSort={setSelectedSort}
            showFilters={showAdvancedFilters}
            onToggleFilters={() => setShowAdvancedFilters(!showAdvancedFilters)}
          />
        </div>

        {/* Zone 3: AniList Sync, 18+ Age Safety, and Account CTA */}
        <div className="order-2 md:order-3 flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* AniList Profile Sync Button */}
          <button
            type="button"
            onClick={() => setShowSyncModal(true)}
            className="rounded-lg border border-[#02A9FF]/40 bg-[#02A9FF]/10 hover:bg-[#02A9FF]/20 px-2 sm:px-2.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-mono font-semibold text-[#02A9FF] transition flex items-center gap-1.5"
          >
            <span>{syncedUser ? syncedUser.name : 'Sync AniList'}</span>
          </button>

          {/* 18+ Age & Parental Safety Badge */}
          <button
            type="button"
            onClick={() => {
              setAgeGateError('');
              setShowAgeModal(true);
            }}
            title="Configure 18+ Age Verification & Safe Mode"
            className={`rounded-lg border px-2 sm:px-2.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-mono font-semibold transition ${
              ageState.isMinorLock
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : ageState.verifiedAdult && !ageState.safeModeEnabled
                ? 'border-rose-500/50 bg-rose-500/15 text-rose-300'
                : 'border-white/15 bg-white/5 text-[#94A3B8] hover:text-white'
            }`}
          >
            {ageState.isMinorLock
              ? 'Safe Mode (<18)'
              : ageState.verifiedAdult && !ageState.safeModeEnabled
              ? '18+ Verified'
              : '18+ Safe Mode'}
          </button>

          {!isPremium ? (
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="hidden lg:inline-flex rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 transition"
            >
              ✦ Simulcast Pass
            </button>
          ) : (
            <span className="hidden lg:inline-block text-xs font-mono text-amber-400">
              ✦ PASS
            </span>
          )}

          {userSession ? (
            <button
              type="button"
              onClick={() => setUserSession(null)}
              className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/10 transition"
            >
              Sign out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="rounded-lg bg-[#F43F5E] hover:bg-[#e11d48] px-3 py-1 text-xs font-semibold text-white transition"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* Spotlight Featured Hero (Featured Title with Direct HD Stream or Trailer) */}
        {activeNav === 'discovery' && searchQuery.trim().length === 0 && (
          <section className="relative overflow-hidden border-b border-white/10 bg-[#110F18]">
            <div
              className="pointer-events-none absolute inset-0 opacity-35"
              style={{
                background:
                  'radial-gradient(circle at 78% 25%, rgba(244, 63, 94, 0.38), transparent 50%), radial-gradient(circle at 20% 80%, rgba(129, 140, 248, 0.25), transparent 55%)'
              }}
            />

            <div className="relative mx-auto max-w-[1440px] px-4 sm:px-8 py-8 sm:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#94A3B8]">
                  <span className="text-[#F43F5E] font-semibold uppercase tracking-wider">
                    AniList Trending Spotlight
                  </span>
                  <span>·</span>
                  <span>{heroAnime.studio}</span>
                  <span>·</span>
                  <span>{heroAnime.format}</span>
                  <span>·</span>
                  <span className="text-emerald-400 font-semibold">
                    {heroAnime.availability_type === 'direct-hd'
                      ? 'Full-Length Episodes · In-App Stream'
                      : 'Licensed Partner Network'}
                  </span>
                  <span>·</span>
                  <span className="text-amber-400">★ {heroAnime.score}</span>
                </div>

                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.08]">
                  {heroAnime.title}
                </h1>

                <p className="text-sm sm:text-base text-[#94A3B8] max-w-[62ch] leading-relaxed line-clamp-3">
                  {heroAnime.synopsis}
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleOpenAnime(heroAnime, 1, 1)}
                    className="rounded-lg bg-[#F43F5E] hover:bg-[#e11d48] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#F43F5E]/25 transition flex items-center gap-2"
                  >
                    <span>▶ Watch Now / Screening Room</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenDetailModal(heroAnime)}
                    className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition"
                  >
                    Details & Cast Information
                  </button>
                </div>
              </div>

              {/* Right Key Visual Poster Card */}
              <div className="lg:col-span-5 flex justify-center lg:justify-end">
                <div
                  onClick={() => handleOpenDetailModal(heroAnime)}
                  className="group cursor-pointer relative w-full max-w-md rounded-xl border border-white/15 bg-[#13121A] overflow-hidden shadow-2xl flex items-stretch h-56 sm:h-64"
                >
                  <div className="w-40 sm:w-44 shrink-0 h-full overflow-hidden relative bg-[#1A1823]">
                    <AnimeArtwork
                      src={heroAnime.poster_url}
                      title={heroAnime.title}
                      japaneseTitle={heroAnime.japanese_title}
                      studio={heroAnime.studio}
                      accentColor={heroAnime.banner_color}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                    />
                  </div>
                  <div className="p-4 sm:p-5 flex flex-col justify-between flex-1 min-w-0">
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-wider text-[#38BDF8]">
                        AniList Verified Entry #{heroAnime.anilist_id || heroAnime.id}
                      </div>
                      <h2 className="text-base sm:text-lg font-bold text-white mt-1 line-clamp-2">
                        {heroAnime.title}
                      </h2>
                      <p className="text-xs text-[#94A3B8] mt-1 font-mono truncate">
                        {heroAnime.japanese_title || heroAnime.romaji_title}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs text-[#94A3B8] font-mono">
                        {heroAnime.genres?.slice(0, 3).join(' · ')}
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F43F5E] group-hover:translate-x-1 transition">
                        View Complete Details →
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Continue Watching Rail (Second-Accurate Persistent Resume) */}
        {continueWatchingItems.length > 0 && (
          <section className="mx-auto max-w-[1440px] px-4 sm:px-8 pt-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
                  Continue Watching
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Pick up at the exact second where you left off
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWatchProgress({});
                  localStorage.removeItem(STORAGE_KEYS.WATCH_PROGRESS);
                }}
                className="text-xs text-[#94A3B8] hover:text-white transition"
              >
                Clear history
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {continueWatchingItems.slice(0, 4).map(({ anime, progress }, idx) => (
                <div
                  key={`continue-${anime.id}-${idx}`}
                  onClick={() =>
                    handleOpenAnime(
                      anime,
                      progress.seasonNumber || 1,
                      progress.episodeNumber || 1
                    )
                  }
                  className="cursor-pointer group rounded-xl border border-white/10 bg-[#13121A] hover:border-white/25 p-3 flex items-center gap-3.5 transition"
                >
                  <div className="w-14 h-20 rounded-lg overflow-hidden shrink-0 bg-[#1C1A26]">
                    <AnimeArtwork
                      src={anime.poster_url}
                      title={anime.title}
                      japaneseTitle={anime.japanese_title}
                      studio={anime.studio}
                      accentColor={anime.banner_color}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-mono text-[#F43F5E]">
                      Resume S{progress.seasonNumber || 1}:E{progress.episodeNumber} ·{' '}
                      {formatTimestamp(progress.resumeSeconds || 0)}
                    </div>
                    <h3 className="text-sm font-bold text-white truncate mt-0.5">
                      {anime.title}
                    </h3>
                    <p className="text-xs text-[#94A3B8] truncate">
                      {progress.episodeTitle}
                    </p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-[#F43F5E] transition-all"
                        style={{ width: `${progress.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Discovery Sections Tabs & Section Header */}
        <section className="mx-auto max-w-[1440px] px-4 sm:px-8 pt-8 pb-3 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            {/* Discovery Section Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto" role="tablist" aria-label="AniList discovery section">
              {[
                { id: 'trending', label: '🔥 Trending Now' },
                { id: 'popular', label: '🌟 All-Time Popular' },
                { id: 'topRated', label: '🏆 Top Rated' },
                { id: 'airing', label: '📺 Currently Airing' },
                { id: 'upcoming', label: '⏳ Most Anticipated' },
                { id: 'seasonal', label: '🌸 Seasonal Anime' },
                { id: 'movies', label: '🎬 Anime Movies' },
                { id: 'classic', label: '🏛️ Classic Anime' },
                { id: 'underrated', label: '💎 Hidden Gems' }
              ].map((sec) => {
                const active = discoverySection === sec.id && !searchQuery.trim() && activeNav === 'discovery';
                return (
                  <button
                    key={sec.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setDiscoverySection(sec.id);
                      setSearchQuery('');
                      setActiveNav('discovery');
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                      active
                        ? 'bg-white text-[#0B0A0E]'
                        : 'text-[#94A3B8] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {sec.label}
                  </button>
                );
              })}
            </div>

            <div className="text-xs font-mono text-[#94A3B8]">
              {isDiscoveryLoading || isSearching ? (
                <span className="text-[#38BDF8]">Querying AniList GraphQL...</span>
              ) : (
                <span>Showing {displayedItems.length} titles</span>
              )}
            </div>
          </div>
        </section>

        {/* Dynamic Anime Grid / Poster Wall */}
        <section className="mx-auto max-w-[1440px] px-4 sm:px-8 pb-16">
          {displayedItems.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#13121A] p-12 text-center space-y-3">
              <p className="text-base font-semibold text-white">
                {isSearching ? 'Searching AniList database...' : 'No titles found matching your criteria.'}
              </p>
              <p className="text-xs text-[#94A3B8]">
                Try adjusting your search keywords, clearing genre filters, or checking your adult content settings.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedGenre('All');
                  setSelectedFormat('All');
                  setSelectedSeason('All');
                  setSelectedYear('All');
                  setActiveNav('discovery');
                }}
                className="rounded-lg bg-[#F43F5E] px-4 py-2 text-xs font-semibold text-white"
              >
                Reset Search & Discovery
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-5">
                {displayedItems.map((anime, idx) => {
                  const progress = watchProgress[String(anime.id)];
                  const availability = getAvailabilityStatus(anime);

                  return (
                    <article
                      key={`anime-card-${anime.id}-${idx}`}
                      onClick={() => handleOpenDetailModal(anime)}
                      className="group cursor-pointer flex flex-col"
                    >
                      {/* 3:4 Vertical Poster Container */}
                      <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-[#13121A] border border-white/10 group-hover:border-white/30 transition shadow-lg">
                        <AnimeArtwork
                          src={anime.poster_url}
                          title={anime.title}
                          japaneseTitle={anime.japanese_title}
                          studio={anime.studio}
                          accentColor={anime.banner_color}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />

                        {/* Subtle Bottom Gradient Scrim */}
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

                        {/* Top Badges */}
                        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between text-[10px] font-mono">
                          <span
                            className={`px-1.5 py-0.5 rounded font-semibold backdrop-blur-md ${
                              availability.watchableInApp
                                ? 'bg-emerald-950/90 border border-emerald-400/40 text-emerald-300'
                                : isMatureAnime(anime)
                                ? 'bg-rose-950/90 border border-rose-500/40 text-rose-300'
                                : 'bg-black/80 border border-white/15 text-[#94A3B8]'
                            }`}
                          >
                            {availability.watchableInApp
                              ? (isMatureAnime(anime) ? '18+ FULL EPISODES' : 'FULL EPISODES')
                              : (isMatureAnime(anime) ? '18+ PARTNER' : 'PARTNER LICENSE')}
                          </span>
                          <span className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded text-amber-400 font-semibold border border-white/10">
                            ★ {anime.score}
                          </span>
                        </div>

                        {/* Bottom Resume Progress Bar if watched */}
                        {progress && (
                          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                            <div
                              className="h-full bg-[#F43F5E]"
                              style={{ width: `${progress.progressPercent}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Data Points below poster */}
                      <h3 className="mt-2 text-xs sm:text-sm font-bold text-white group-hover:text-[#F43F5E] transition line-clamp-1">
                        {anime.title}
                      </h3>
                      <div className="mt-0.5 text-[11px] text-[#94A3B8] font-mono truncate">
                        {anime.format || 'TV'} · {anime.genres?.slice(0, 2).join(' / ') || 'Anime'} ·{' '}
                        {anime.year}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Load More Pagination Control for Discovery Sections */}
              {activeNav === 'discovery' && searchQuery.trim().length === 0 && (
                <div className="mt-10 flex justify-center">
                  <button
                    type="button"
                    disabled={isLoadingMore}
                    onClick={handleLoadMoreDiscovery}
                    className="rounded-xl border border-white/15 bg-[#13121A] hover:bg-white/10 disabled:opacity-50 px-6 py-2.5 text-xs font-semibold text-white transition"
                  >
                    {isLoadingMore ? 'Loading More Titles from AniList...' : 'Load More Anime Titles ↓'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#0B0A0E] py-8 px-4 sm:px-8 text-xs text-[#94A3B8]">
        <div className="mx-auto max-w-[1440px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>Kitsune</span>
              <span className="text-[#F43F5E]">+</span>
              <span>Anime Discovery & Streaming Engine</span>
            </div>
            <p>
              Metadata and catalog discovery dynamically powered by the official AniList GraphQL API (<a href="https://graphql.anilist.co" target="_blank" rel="noopener noreferrer" className="text-[#38BDF8] hover:underline">graphql.anilist.co</a>) & Jikan v4 REST API. Verified video streams and legal distributor links.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setShowAdminModal(true)}
              className="text-emerald-400 hover:underline font-mono"
            >
              Admin & Source Registry
            </button>
            <button
              type="button"
              onClick={() => setShowSyncModal(true)}
              className="text-[#02A9FF] hover:underline font-mono"
            >
              AniList Library Sync
            </button>
            <button
              type="button"
              onClick={() => setShowAgeModal(true)}
              className="hover:text-white transition"
            >
              18+ Age & Safety Settings
            </button>
            <a href="/privacy.html" className="hover:text-white transition">
              Privacy Policy
            </a>
          </div>
        </div>
      </footer>

      {/* Role-Based Admin & Media Source Verification Console */}
      {showAdminModal && (
        <AdminCatalogModal
          onClose={() => setShowAdminModal(false)}
          userSession={userSession}
          ageState={ageState}
          discoveryStats={{
            totalCached: Object.values(discoveryData).reduce((acc, arr) => acc + (arr?.length || 0), 0)
          }}
        />
      )}

      {/* Dedicated Anime Detail Modal */}
      {selectedDetailAnime && (
        <AnimeDetailModal
          anime={selectedDetailAnime}
          curatedDirectMatches={curatedDirectMatches}
          userLists={userLists}
          onUpdateUserListStatus={handleUpdateUserListStatus}
          onOpenScreeningRoom={(anime, season, ep) => handleOpenAnime(anime, season, ep)}
          onSelectRelatedAnime={async (relatedId) => {
            try {
              const res = await queryAniList(ANILIST_MEDIA_DETAIL_QUERY, { id: relatedId });
              if (res?.Media) {
                const mapped = mapAniListMediaToAnime(res.Media, curatedDirectMatches);
                setSelectedDetailAnime(mapped);
              }
            } catch {
              // ignore
            }
          }}
          onClose={() => setSelectedDetailAnime(null)}
          isAdultAllowed={isAdultAllowed}
        />
      )}

      {/* Active Screening Room Video Player Modal */}
      {activeScreening && (
        <ScreeningModal
          anime={activeScreening.anime}
          initialSeasonNumber={activeScreening.seasonNumber}
          initialEpisodeNumber={activeScreening.episodeNumber}
          savedProgress={watchProgress[String(activeScreening.anime.id)]}
          onClose={() => setActiveScreening(null)}
          onSelectEpisode={({
            seasonNumber,
            episodeNumber,
            episodeTitle,
            resumeSeconds,
            durationSeconds
          }) => {
            const seasons = getAnimeSeasons(activeScreening.anime);
            const sObj =
              seasons.find((s) => s.season_number === Number(seasonNumber)) ||
              seasons[0];
            setWatchProgress((prev) =>
              updateWatchProgress(prev, {
                animeId: activeScreening.anime.id,
                seasonNumber,
                episodeNumber,
                totalEpisodes:
                  sObj?.episodes?.length || activeScreening.anime.episodes || 12,
                episodeTitle,
                resumeSeconds,
                durationSeconds
              })
            );
          }}
          isInWatchlist={userLists.watching?.includes(String(activeScreening.anime.id))}
          onToggleWatchlist={(animeId) => {
            handleUpdateUserListStatus(
              animeId,
              userLists.watching?.includes(String(animeId)) ? 'none' : 'watching'
            );
          }}
        />
      )}

      {/* AniList Profile Sync Modal */}
      {showSyncModal && (
        <AniListSyncModal
          onClose={() => setShowSyncModal(false)}
          onImportUserLists={handleImportAniListLists}
          currentSyncedUser={syncedUser}
          onDisconnect={handleDisconnectAniList}
        />
      )}

      {/* Strict 18+ Date-of-Birth Age Verification & Parental Safe Mode Modal */}
      {showAgeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="age-gate-title"
        >
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#13121A] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-[#F43F5E]">
                AniList 18+ Age & Compliance Gate
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowAgeModal(false);
                  setPendingMatureSelect(null);
                }}
                className="text-xs text-[#94A3B8] hover:text-white"
              >
                Close ✕
              </button>
            </div>

            <h2 id="age-gate-title" className="text-xl font-bold text-white">
              {ageState.isMinorLock
                ? 'Minor Protection Active (<18 Locked)'
                : 'Verify Your Date of Birth (18+)'}
            </h2>

            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
              AniList classifies certain seinen and mature titles under `isAdult: true`. In accordance with regional broadcasting regulations, enter your birth date to verify age eligibility.
            </p>

            {ageGateError && (
              <div
                data-testid="age-gate-error"
                className="rounded-lg border border-rose-500/40 bg-rose-500/15 p-3 text-xs text-rose-200 font-medium"
              >
                {ageGateError}
              </div>
            )}

            {ageState.isMinorLock ? (
              <div className="space-y-3 pt-2">
                <p className="text-xs text-emerald-300 font-mono">
                  Safe Mode is locked on for this session to protect minors from adult categories.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowAgeModal(false);
                    setPendingMatureSelect(null);
                  }}
                  className="w-full rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2.5 text-xs font-semibold text-white"
                >
                  Return to All-Ages Catalog
                </button>
              </div>
            ) : (
              <form onSubmit={handleVerifyAgeSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-mono text-[#94A3B8] mb-1">
                    Regional Legal Threshold
                  </label>
                  <select
                    aria-label="Regional age threshold"
                    value={regionMinAge}
                    onChange={(e) => setRegionMinAge(Number(e.target.value))}
                    className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-3 py-2 text-xs text-white"
                  >
                    <option value={18}>Standard International (18+ Years Required)</option>
                    <option value={20}>Strict Regional Standard (20+ Years Required)</option>
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-mono text-[#94A3B8] mb-1">
                      Birth Year
                    </label>
                    <input
                      type="number"
                      aria-label="Birth Year"
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                      min="1920"
                      max="2026"
                      required
                      className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-3 py-2 text-sm text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-[#94A3B8] mb-1">
                      Month (1-12)
                    </label>
                    <input
                      type="number"
                      aria-label="Birth Month"
                      value={dobMonth}
                      onChange={(e) => setDobMonth(e.target.value)}
                      min="1"
                      max="12"
                      required
                      className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-3 py-2 text-sm text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-[#94A3B8] mb-1">
                      Day (1-31)
                    </label>
                    <input
                      type="number"
                      aria-label="Birth Day"
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                      min="1"
                      max="31"
                      required
                      className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-3 py-2 text-sm text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-[#F43F5E] hover:bg-[#e11d48] px-4 py-2.5 text-xs font-bold text-white transition"
                  >
                    Verify Age & Unlock 18+
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAgeState((prev) => ({ ...prev, safeModeEnabled: true }));
                      setPendingMatureSelect(null);
                      setShowAgeModal(false);
                    }}
                    className="flex-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition"
                  >
                    Keep Safe Mode On
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#13121A] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 id="auth-modal-title" className="text-lg font-bold text-white">
                Sign In to Kitsune+
              </h2>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className="text-[#94A3B8] hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#94A3B8]">
              Connect your account to save Watchlists and progress across devices.
            </p>
            <div className="space-y-3">
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email address"
                className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-3.5 py-2 text-sm text-white focus:border-[#F43F5E] focus:outline-none"
              />
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-3.5 py-2 text-sm text-white focus:border-[#F43F5E] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (authEmail) {
                  setUserSession({ email: authEmail });
                  setShowAuthModal(false);
                }
              }}
              className="w-full rounded-lg bg-[#F43F5E] hover:bg-[#e11d48] py-2.5 text-sm font-bold text-white transition"
            >
              Sign In to Account
            </button>
          </div>
        </div>
      )}

      {/* Upgrade Pass Modal */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-amber-400/30 bg-[#13121A] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-400">
                ✦ Kitsune+ Simulcast Pass
              </span>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="text-[#94A3B8] hover:text-white text-sm"
              >
                ✕
              </button>
            </div>
            <h2 id="upgrade-modal-title" className="text-xl font-bold text-white">
              Uninterrupted 1080p Simulcasts
            </h2>
            <ul className="space-y-2 text-sm text-[#CBD5E1]">
              <li>• Zero banner ads across all screening rooms</li>
              <li>• Instant 1-hour post-Japan simulcast access</li>
              <li>• Dual-audio Japanese 2.0 PCM & English 5.1 Dub streams</li>
            </ul>
            <div className="pt-2 flex items-center justify-between border-t border-white/10">
              <div>
                <div className="text-2xl font-extrabold text-white">$7.99</div>
                <div className="text-xs text-[#94A3B8]">per month · cancel anytime</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPremium(true);
                  setShowUpgradeModal(false);
                }}
                className="rounded-lg bg-amber-400 hover:bg-amber-300 px-5 py-2.5 text-sm font-bold text-black transition"
              >
                Activate Pass
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
