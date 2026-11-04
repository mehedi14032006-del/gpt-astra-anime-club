import React, { useState, useEffect, useMemo } from 'react';
import { queryAniList, ANILIST_MEDIA_DETAIL_QUERY, mapAniListMediaToAnime, sanitizeAniListDescription } from '../lib/anilistClient.js';
import { AnimeArtwork } from './AnimeArtwork.jsx';
import { formatTimestamp } from '../lib/catalogLogic.js';

/**
 * AnimeDetailModal
 * Dedicated rich detail view for any anime:
 * - Panoramic banner & high-res poster
 * - Title set: English, Romaji, and Native Japanese
 * - Complete metadata: studio, format, season/year, episodes, runtime, score, rank
 * - Airing information & Next Episode countdown
 * - Synopsis with spoiler reveal toggle
 * - Characters & Japanese Voice Cast (Seiyuu)
 * - Production Staff & Animation Studios
 * - Franchise Relations (Prequels, Sequels, Spin-offs, Side stories) with clickable navigation
 * - Community Recommendations
 * - Complete episode guide with duration & legal provider mirrors
 * - Personalization: Change status (Watching, Plan to Watch, Completed, Favorites, Dropped, On Hold)
 * - Direct "Watch in Screening Room" or "Watch Official Trailer" action
 */
export function AnimeDetailModal({
  anime: initialAnime,
  curatedDirectMatches = {},
  userLists = {},
  onUpdateUserListStatus,
  onOpenScreeningRoom,
  onSelectRelatedAnime,
  onClose,
  isAdultAllowed = false
}) {
  const [detailData, setDetailData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSpoilers, setShowSpoilers] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'episodes' | 'characters' | 'relations' | 'recommendations'

  const animeId = initialAnime?.anilist_id || initialAnime?.id;

  // Load detailed metadata from AniList GraphQL API
  useEffect(() => {
    let cancelled = false;

    async function fetchDetails() {
      if (!animeId || initialAnime?.availability_type === 'direct-hd') {
        setDetailData(initialAnime);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const numericId = parseInt(animeId, 10);
        if (Number.isNaN(numericId)) {
          // Curated title without anilist numeric ID
          setDetailData(initialAnime);
          setLoading(false);
          return;
        }

        const res = await queryAniList(ANILIST_MEDIA_DETAIL_QUERY, { id: numericId });
        if (cancelled) return;

        if (res?.Media) {
          const mapped = mapAniListMediaToAnime(res.Media, curatedDirectMatches);
          setDetailData({
            ...mapped,
            rawMedia: res.Media
          });
        } else {
          setDetailData(initialAnime);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('[AniList Detail] Failed to fetch full details:', err.message);
        // Graceful fallback to initialAnime
        setDetailData(initialAnime);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDetails();
    return () => {
      cancelled = true;
    };
  }, [animeId, initialAnime, curatedDirectMatches]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const activeAnime = detailData || initialAnime;
  if (!activeAnime) return null;

  const displayTitle =
    typeof activeAnime.title === 'string'
      ? activeAnime.title
      : activeAnime.title?.userPreferred || activeAnime.title?.english || activeAnime.title?.romaji || 'Untitled Anime';

  const currentStatus =
    userLists.watching?.includes(String(activeAnime.id))
      ? 'watching'
      : userLists.planToWatch?.includes(String(activeAnime.id))
      ? 'planToWatch'
      : userLists.completed?.includes(String(activeAnime.id))
      ? 'completed'
      : userLists.favorites?.includes(String(activeAnime.id))
      ? 'favorites'
      : userLists.dropped?.includes(String(activeAnime.id))
      ? 'dropped'
      : userLists.onHold?.includes(String(activeAnime.id))
      ? 'onHold'
      : 'none';

  // Format countdown string
  const getNextAiringText = () => {
    const next = activeAnime.next_airing_episode || activeAnime.rawMedia?.nextAiringEpisode;
    if (!next) return null;
    const sec = next.timeUntilAiring;
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    return `Episode ${next.episode} airs in ${days > 0 ? `${days}d ` : ''}${hours}h`;
  };

  const rawDesc = activeAnime.rawMedia?.description || activeAnime.synopsis || '';
  const cleanDescription = sanitizeAniListDescription(rawDesc, { hideSpoilers: !showSpoilers });

  const characters = useMemo(() => {
    const raw = activeAnime.characters || activeAnime.rawMedia?.characters?.edges || [];
    const seen = new Set();
    return raw.filter((item) => {
      const id = item?.node?.id;
      if (!id || seen.has(String(id))) return false;
      seen.add(String(id));
      return true;
    });
  }, [activeAnime.characters, activeAnime.rawMedia]);

  const staff = activeAnime.staff || activeAnime.rawMedia?.staff?.edges || [];

  const relations = useMemo(() => {
    const raw = activeAnime.relations || activeAnime.rawMedia?.relations?.edges || [];
    const seen = new Set();
    return raw.filter((rel) => {
      const id = rel?.node?.id;
      if (!id || seen.has(String(id))) return false;
      seen.add(String(id));
      return true;
    });
  }, [activeAnime.relations, activeAnime.rawMedia]);

  const recommendations = useMemo(() => {
    const rawRecs = activeAnime.recommendations || [];
    const rawNodes = activeAnime.rawMedia?.recommendations?.nodes || [];
    const combined = [...rawRecs, ...rawNodes.map((n) => n.mediaRecommendation).filter(Boolean)];
    const seen = new Set();
    const result = [];
    for (const item of combined) {
      const rec = item?.mediaRecommendation || item;
      const id = rec?.id;
      if (id && !seen.has(String(id))) {
        seen.add(String(id));
        result.push(rec);
      }
    }
    return result;
  }, [activeAnime.recommendations, activeAnime.rawMedia]);

  const externalLinks = activeAnime.external_links || activeAnime.rawMedia?.externalLinks || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anime-detail-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative w-full max-w-5xl rounded-2xl border border-white/15 bg-[#121118] text-[#F8FAFC] shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Panoramic Banner with Gradient Scrim */}
        <div className="relative h-44 sm:h-64 w-full bg-[#1A1823] overflow-hidden shrink-0">
          {activeAnime.banner_url ? (
            <img
              src={activeAnime.banner_url}
              alt={`${activeAnime.title} banner`}
              className="w-full h-full object-cover opacity-60"
            />
          ) : (
            <div
              className="w-full h-full opacity-40"
              style={{
                background: `radial-gradient(circle at 70% 30%, ${activeAnime.banner_color || '#F43F5E'}, transparent 60%), linear-gradient(120deg, #1A1823, #0B0A0E)`
              }}
            />
          )}

          {/* Gradient Scrims */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#121118] via-[#121118]/60 to-black/30" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail modal"
            className="absolute top-4 right-4 z-20 rounded-full border border-white/20 bg-black/60 backdrop-blur-md p-2 text-white hover:bg-black/90 transition"
          >
            ✕
          </button>

          {/* Next Airing Readout on Banner */}
          {getNextAiringText() && (
            <div className="absolute top-4 left-4 z-20 rounded-lg border border-emerald-500/40 bg-emerald-950/85 backdrop-blur-md px-3 py-1 text-xs font-mono text-emerald-300">
              <span>{getNextAiringText()}</span>
            </div>
          )}
        </div>

        {/* Header Hero Row (Poster + Title + Action Bar) */}
        <div className="px-5 sm:px-8 -mt-20 sm:-mt-24 relative z-10 flex flex-col sm:flex-row gap-5 items-start">
          {/* 3:4 Poster */}
          <div className="w-28 sm:w-44 aspect-[3/4] rounded-xl overflow-hidden border-2 border-white/20 bg-[#1A1823] shadow-2xl shrink-0">
            <AnimeArtwork
              src={activeAnime.poster_url || activeAnime.coverImage?.large}
              title={displayTitle}
              japaneseTitle={activeAnime.japanese_title}
              studio={activeAnime.studio}
              accentColor={activeAnime.banner_color}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Title & Metadata */}
          <div className="flex-1 min-w-0 pt-2 sm:pt-6 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#94A3B8]">
              <span className="text-[#F43F5E] font-semibold">{activeAnime.studio}</span>
              <span>·</span>
              <span>{activeAnime.format}</span>
              <span>·</span>
              <span>{activeAnime.year || activeAnime.seasonYear}</span>
              <span>·</span>
              <span className="text-amber-400 font-bold">★ {activeAnime.score}</span>
              <span>·</span>
              <span className={activeAnime.availability_type === 'direct-hd' ? 'text-emerald-400 font-semibold' : 'text-amber-300 font-semibold'}>
                {activeAnime.availability_type === 'direct-hd' ? 'Direct HD Stream' : 'Official Licensed Preview'}
              </span>
            </div>

            <h1 id="anime-detail-modal-title" className="text-xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
              {displayTitle}
            </h1>

            {(activeAnime.romaji_title !== activeAnime.title || activeAnime.japanese_title) && (
              <p className="text-xs sm:text-sm text-[#94A3B8] font-mono truncate">
                {activeAnime.romaji_title} {activeAnime.japanese_title ? `· ${activeAnime.japanese_title}` : ''}
              </p>
            )}

            {/* Quick Genres */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {activeAnime.genres?.map((g, idx) => (
                <span key={`detail-genre-${g}-${idx}`} className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-[#CBD5E1]">
                  {g}
                </span>
              ))}
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => {
                  onOpenScreeningRoom?.(activeAnime, 1, 1);
                  onClose?.();
                }}
                className="rounded-lg bg-[#F43F5E] hover:bg-[#e11d48] px-4 py-2 text-xs sm:text-sm font-bold text-white shadow-lg shadow-[#F43F5E]/20 transition flex items-center gap-1.5"
              >
                <span>▶ Watch Now / Screening Room</span>
              </button>

              {activeAnime.trailer_url && (
                <a
                  href={activeAnime.trailer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white transition flex items-center gap-1.5"
                >
                  <span>📺 Watch Official Trailer</span>
                </a>
              )}

              {/* Status Selector */}
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Add to category or watchlist"
                  value={currentStatus}
                  onChange={(e) => onUpdateUserListStatus?.(activeAnime.id, e.target.value)}
                  className="rounded-lg border border-white/15 bg-[#1A1823] px-3 py-2 text-xs font-semibold text-white focus:border-[#F43F5E] focus:outline-none"
                >
                  <option value="none">+ Add to List</option>
                  <option value="watching">▶ Watching</option>
                  <option value="planToWatch">📌 Plan to Watch</option>
                  <option value="completed">✓ Completed</option>
                  <option value="favorites">★ Favorites</option>
                  <option value="onHold">⏸ On Hold</option>
                  <option value="dropped">✕ Dropped</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 sm:px-8 pt-6 border-b border-white/10 flex items-center gap-3 overflow-x-auto" role="tablist">
          {[
            { id: 'overview', label: 'Overview & Story' },
            { id: 'episodes', label: `Episodes (${activeAnime.episodes || 12})` },
            { id: 'characters', label: `Characters & Cast (${characters.length})` },
            { id: 'relations', label: `Franchise & Relations (${relations.length})` },
            { id: 'recommendations', label: `Recommendations (${recommendations.length})` }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-xs sm:text-sm font-semibold whitespace-nowrap transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-[#F43F5E] text-white'
                  : 'border-transparent text-[#94A3B8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Body */}
        <div className="p-5 sm:p-8 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Synopsis & Legal Streaming Disclaimers */}
              <div className="md:col-span-8 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#94A3B8]">
                      Synopsis
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowSpoilers(!showSpoilers)}
                      className="text-xs font-mono text-[#38BDF8] hover:underline"
                    >
                      {showSpoilers ? 'Hide Spoilers' : 'Reveal Spoilers'}
                    </button>
                  </div>
                  <p className="text-sm text-[#CBD5E1] leading-relaxed whitespace-pre-line">
                    {cleanDescription || 'No description provided by official sources.'}
                  </p>
                </div>

                {/* Transparency Notice: Legitimate Streaming Providers */}
                <div className="rounded-xl border border-white/10 bg-[#161420] p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                      Official Streaming License & Authorized Providers
                    </h4>
                    <span className="text-[11px] font-mono text-[#94A3B8]">AniList Catalog Verification</span>
                  </div>
                  <p className="text-xs text-[#94A3B8] leading-relaxed">
                    AniList provides verified anime metadata, airing schedules, and official licensing information. Full episodes are streamed via legitimate distributors and authenticated providers.
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {externalLinks.length > 0 ? (
                      externalLinks.map((link, idx) => (
                        <a
                          key={`detail-link-${link.id || link.site || idx}-${idx}`}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-[#38BDF8] transition"
                        >
                          {link.site} ↗
                        </a>
                      ))
                    ) : (
                      <>
                        <a
                          href={`https://www.crunchyroll.com/search?q=${encodeURIComponent(activeAnime.title)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-[#38BDF8] transition"
                        >
                          Crunchyroll ↗
                        </a>
                        <a
                          href={`https://www.netflix.com/search?q=${encodeURIComponent(activeAnime.title)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-medium text-[#38BDF8] transition"
                        >
                          Netflix ↗
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Sidebar Key Details */}
              <div className="md:col-span-4 rounded-xl border border-white/10 bg-[#161420] p-4 space-y-3 text-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#94A3B8] border-b border-white/10 pb-2">
                  Anime Information
                </h3>
                <div className="space-y-2 font-mono">
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Format:</span>
                    <span className="text-white font-medium">{activeAnime.format}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Episodes:</span>
                    <span className="text-white font-medium">{activeAnime.episodes || 'TBA'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Status:</span>
                    <span className="text-white font-medium">{activeAnime.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Season:</span>
                    <span className="text-white font-medium">{activeAnime.rawMedia?.season || 'N/A'} {activeAnime.year}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Mean Score:</span>
                    <span className="text-amber-400 font-bold">{activeAnime.score ? `${activeAnime.score} / 10` : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Studio:</span>
                    <span className="text-white font-medium">{activeAnime.studio}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#94A3B8]">Rating:</span>
                    <span className="text-rose-400 font-medium">{activeAnime.rating}</span>
                  </div>
                </div>

                {/* Studios & Staff */}
                {staff.length > 0 && (
                  <div className="pt-2 border-t border-white/10 space-y-1.5">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Key Staff</h4>
                    {staff.slice(0, 4).map((s, idx) => (
                      <div key={`detail-staff-${s.node?.id || s.role || idx}-${idx}`} className="flex justify-between text-[11px]">
                        <span className="text-[#94A3B8] truncate">{s.role}:</span>
                        <span className="text-white font-medium truncate ml-2">{s.node.name.full}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'episodes' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#94A3B8]">
                  {activeAnime.availability_type === 'direct-hd'
                    ? 'Verified full-length episode streams available directly in-app. Promotional trailers are strictly separated.'
                    : 'Official episode directory. Full-length episodes are hosted on authorized streaming partner platforms.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onOpenScreeningRoom?.(activeAnime, 1, 1);
                    onClose?.();
                  }}
                  className="rounded-lg bg-[#F43F5E] px-3.5 py-1.5 text-xs font-semibold text-white"
                >
                  {activeAnime.availability_type === 'direct-hd'
                    ? '▶ Watch Full Episode 1'
                    : '🌐 Open Episode Guide'}
                </button>
              </div>

              {(activeAnime.seasons?.[0]?.episodes?.length || 0) === 0 ? (
                <div className="rounded-xl border border-white/10 bg-[#161420] p-6 text-xs text-[#94A3B8] space-y-2">
                  <div className="font-bold text-white text-sm">
                    Catalog Episode Count: {activeAnime.episodes || 'TBA'} ({activeAnime.format || 'TV'})
                  </div>
                  <p className="leading-relaxed">
                    AniList public metadata confirms this production has {activeAnime.episodes || 'multiple'} episodes, but individual episode-by-episode streaming records were not returned by the API. Kitsune+ never fabricates placeholder episode titles or fake synopses. Use the official distributor links or open the Screening Room for partner access.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-[#161420] overflow-hidden">
                  {activeAnime.seasons?.[0]?.episodes?.map((ep, idx) => {
                    const hasFullEpisodeStream = Boolean(ep.stream_url && ep.content_type !== 'trailer');
                    return (
                      <div
                        key={`detail-ep-${ep.season || 1}-${ep.ep}-${idx}`}
                        className="p-3 sm:p-4 flex items-center justify-between gap-4 hover:bg-white/5 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center font-mono text-xs font-bold text-[#F43F5E] shrink-0">
                            {ep.ep}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-semibold text-white truncate">
                              {ep.title}
                            </div>
                            <p className="text-xs text-[#94A3B8] line-clamp-1 mt-0.5">
                              {ep.synopsis}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-mono text-[#94A3B8]">{ep.duration}</span>
                          <button
                            type="button"
                            onClick={() => {
                              onOpenScreeningRoom?.(activeAnime, ep.season || 1, ep.ep);
                              onClose?.();
                            }}
                            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                              hasFullEpisodeStream
                                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                                : 'border-white/15 bg-white/5 text-white hover:bg-white/10'
                            }`}
                          >
                            {hasFullEpisodeStream ? '▶ Play Full Episode' : '🌐 Partner Access'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'characters' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {characters.map((item, idx) => {
                const char = item.node;
                const va = item.voiceActors?.[0];
                return (
                  <div
                    key={`detail-char-${char?.id || idx}-${idx}`}
                    className="rounded-xl border border-white/10 bg-[#161420] p-3 flex items-center gap-3"
                  >
                    <div className="w-12 h-16 rounded-lg overflow-hidden bg-black/40 shrink-0">
                      {char?.image?.medium && (
                        <img
                          src={char.image.medium}
                          alt={char.name?.full}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">
                        {char?.name?.full}
                      </div>
                      <div className="text-[11px] font-mono text-[#F43F5E] capitalize">
                        {item.role?.toLowerCase() || 'Character'}
                      </div>
                      {va && (
                        <div className="text-[10px] text-[#94A3B8] truncate mt-1">
                          CV: {va.name?.full}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'relations' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {relations.map((rel, idx) => {
                const media = rel.node;
                return (
                  <div
                    key={`detail-rel-${media?.id || idx}-${idx}`}
                    onClick={() => onSelectRelatedAnime?.(media.id)}
                    className="cursor-pointer group rounded-xl border border-white/10 bg-[#161420] hover:border-white/25 p-3 flex items-center gap-3 transition"
                  >
                    <div className="w-12 h-16 rounded-lg overflow-hidden bg-black/40 shrink-0">
                      {media?.coverImage?.medium && (
                        <img
                          src={media.coverImage.medium}
                          alt={media.title?.userPreferred}
                          className="w-full h-full object-cover group-hover:scale-105 transition"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-mono uppercase text-[#38BDF8]">
                        {rel.relationType?.replace(/_/g, ' ')}
                      </div>
                      <div className="text-xs font-bold text-white truncate mt-0.5 group-hover:text-[#F43F5E] transition">
                        {media?.title?.userPreferred || media?.title?.english}
                      </div>
                      <div className="text-[11px] text-[#94A3B8] font-mono mt-0.5">
                        {media?.format} · {media?.status}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'recommendations' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {recommendations.map((rec, idx) => (
                <div
                  key={`detail-rec-${rec?.id || idx}-${idx}`}
                  onClick={() => onSelectRelatedAnime?.(rec.id)}
                  className="cursor-pointer group flex flex-col"
                >
                  <div className="aspect-[3/4] w-full rounded-xl overflow-hidden border border-white/10 bg-[#161420] group-hover:border-white/30 transition">
                    {rec?.coverImage?.large && (
                      <img
                        src={rec.coverImage.large}
                        alt={rec.title?.userPreferred}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    )}
                  </div>
                  <div className="mt-1.5 text-xs font-semibold text-white truncate group-hover:text-[#F43F5E] transition">
                    {rec?.title?.userPreferred || rec?.title?.english}
                  </div>
                  <div className="text-[10px] font-mono text-[#94A3B8]">
                    {rec?.format} · ★ {rec?.averageScore ? (rec.averageScore / 10).toFixed(1) : '8.0'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
