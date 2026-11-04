import React, { useState, useEffect, useRef } from 'react';
import {
  resolveEmbedSource,
  getAvailabilityStatus,
  getAnimeSeasons,
  formatTimestamp
} from '../lib/catalogLogic.js';
import {
  formatDurationSeconds,
  resolveEpisodeVideoSync,
  resolveEpisodeVideo
} from '../lib/videoRegistry.js';

/**
 * ScreeningModal
 * Production-ready Full-Episode Anime Screening Room:
 * - Centralized Playback Resolution: Every selection resolves strictly through
 *   `resolveEpisodeVideoSync` / `resolveEpisodeVideo`:
 *   `Anime ID -> Season ID -> Episode ID -> Authorized Provider -> Verified Media Source`.
 * - Zero Fallback-to-Episode-1: Requesting a missing season or episode NEVER falls back to
 *   Season 1 or Episode 1; it displays an honest Episode Unavailable notice for that exact selection.
 * - Strict Content-Type Separation: Full-length episodes (`content_type: 'full_episode'`) are strictly
 *   separated from promotional trailers (`content_type: 'trailer'`).
 * - Authentic Audio & Subtitles: Never attaches universal fictional VTT files across titles.
 * - Real Media Duration: Reads actual duration (`vid.duration`) directly from the verified HTML5
 *   video stream on `loadedmetadata` / `durationchange`.
 */
export function ScreeningModal({
  anime,
  initialSeasonNumber = 1,
  initialEpisodeNumber = 1,
  savedProgress = null,
  onClose,
  onSelectEpisode,
  isInWatchlist,
  onToggleWatchlist
}) {
  const availability = getAvailabilityStatus(anime);
  const seasons = getAnimeSeasons(anime);

  // Use exact requested season/episode; only use savedProgress if caller did not explicitly specify a different target
  const [selectedSeasonNum, setSelectedSeasonNum] = useState(() => {
    if (initialSeasonNumber !== undefined && initialSeasonNumber !== null) {
      return Number(initialSeasonNumber);
    }
    return Number(savedProgress?.seasonNumber || seasons[0]?.season_number || 1);
  });

  const [selectedEp, setSelectedEp] = useState(() => {
    if (initialEpisodeNumber !== undefined && initialEpisodeNumber !== null) {
      return Number(initialEpisodeNumber);
    }
    return Number(savedProgress?.episodeNumber || 1);
  });

  // STRICT EXACT LOOKUP: Never fall back to seasons[0] or episodes[0]!
  const activeSeason =
    seasons.find((s) => Number(s.season_number) === Number(selectedSeasonNum)) || null;
  const episodes = activeSeason?.episodes || [];
  const exactEpObj =
    episodes.find((e) => Number(e.ep) === Number(selectedEp)) || null;

  // Centralized playback resolution (synchronous baseline + async Supabase/registry verification with race guard)
  const syncResolution = resolveEpisodeVideoSync({
    anime,
    seasonNumber: selectedSeasonNum,
    episodeNumber: selectedEp
  });

  const [asyncResolution, setAsyncResolution] = useState(null);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    requestVersionRef.current += 1;
    const currentVersion = requestVersionRef.current;
    setAsyncResolution(null);

    resolveEpisodeVideo({
      anime,
      seasonNumber: selectedSeasonNum,
      episodeNumber: selectedEp
    })
      .then((res) => {
        if (requestVersionRef.current === currentVersion) {
          setAsyncResolution(res);
        }
      })
      .catch(() => {
        // Fallback to syncResolution
      });
  }, [anime, selectedSeasonNum, selectedEp]);

  const resolvedPlayback =
    asyncResolution &&
    asyncResolution.episodeId === syncResolution.episodeId
      ? asyncResolution
      : syncResolution;

  const currentEpIndex = episodes.findIndex((e) => Number(e.ep) === Number(selectedEp));

  // Genuine full-episode stream source for this exact episode (never a trailer or Episode 1 fallback)
  const directVideoSrc =
    resolvedPlayback.available &&
    resolvedPlayback.contentType === 'full_episode' &&
    resolvedPlayback.streamUrl
      ? resolvedPlayback.streamUrl
      : null;
  const hasDirectStream = Boolean(directVideoSrc);

  // Promotional trailer is strictly separated at the anime metadata level (`content_type: 'trailer'`)
  const trailerRawUrl = resolvedPlayback.officialTrailer || anime?.trailer_url || null;
  const trailerEmbedConfig = resolveEmbedSource(trailerRawUrl, 0);
  const hasTrailer = Boolean(trailerEmbedConfig.src);

  // CRITICAL: Always default to 'direct' (the selected Episode view) so selecting an episode
  // NEVER auto-plays a promotional trailer pretending to be that episode.
  const [sourceMode, setSourceMode] = useState('direct');

  const verifiedAudioTracks = Array.isArray(resolvedPlayback.audioTracks) && resolvedPlayback.audioTracks.length > 0
    ? resolvedPlayback.audioTracks
    : ['Original Broadcast Audio'];
  const verifiedSubtitles = Array.isArray(resolvedPlayback.subtitles)
    ? resolvedPlayback.subtitles
    : [];

  const [selectedAudioIdx, setSelectedAudioIdx] = useState(0);
  const [subtitleLang, setSubtitleLang] = useState(
    verifiedSubtitles[0]?.srcLang || 'off'
  );
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Real HTML5 <video> state
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(resolvedPlayback.durationSeconds || 0);
  const [verifiedStreamDuration, setVerifiedStreamDuration] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume] = useState(0.85);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [resumedBanner, setResumedBanner] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Canonical unique identifiers for strict 1-to-1 verification
  const canonicalAnimeId = resolvedPlayback.animeId || String(anime?.id || anime?.anilist_id || '');
  const canonicalSeasonId = resolvedPlayback.seasonId || `${canonicalAnimeId}:s${selectedSeasonNum}`;
  const canonicalEpisodeId = resolvedPlayback.episodeId || `${canonicalSeasonId}:e${selectedEp}`;
  const canonicalContentType = resolvedPlayback.contentType || 'unavailable';

  // Reset player state whenever anime, season, or episode changes so no previous stream is retained
  useEffect(() => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // ignore
      }
    }
    setVideoError(null);
    setRetryCount(0);
    setIsBuffering(false);
    setCurrentTime(0);
    setVerifiedStreamDuration(null);
    setDuration(resolvedPlayback.durationSeconds || 0);
    setSelectedAudioIdx(0);
    setSubtitleLang(verifiedSubtitles[0]?.srcLang || 'off');
    setSourceMode('direct');
  }, [anime?.id, selectedSeasonNum, selectedEp, resolvedPlayback.durationSeconds, verifiedSubtitles.length]);

  // Sync playbackRate with <video>
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Sync HTML5 textTracks mode when subtitleLang changes
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !vid.textTracks) return;
    for (let i = 0; i < vid.textTracks.length; i += 1) {
      const track = vid.textTracks[i];
      if (subtitleLang !== 'off' && track.language === subtitleLang) {
        track.mode = 'showing';
      } else {
        track.mode = 'disabled';
      }
    }
  }, [subtitleLang, selectedEp, selectedSeasonNum, sourceMode, directVideoSrc]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      const vid = videoRef.current;
      if (!vid) return;

      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (vid.paused) {
          vid.play().then(() => setIsPlaying(true)).catch(() => {});
        } else {
          vid.pause();
          setIsPlaying(false);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        vid.currentTime = Math.min(duration || 0, (vid.currentTime || 0) + 10);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        vid.currentTime = Math.max(0, (vid.currentTime || 0) - 10);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const nextMute = !vid.muted;
        vid.muted = nextMute;
        setIsMuted(nextMute);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, duration]);

  if (!anime) return null;

  const handleVideoLoadedMetadata = (e) => {
    const vid = e.currentTarget;
    // Read actual media duration directly from the verified video stream
    const actualMediaDuration =
      Number.isFinite(vid.duration) && vid.duration > 0
        ? Math.round(vid.duration)
        : resolvedPlayback.durationSeconds || 0;

    setDuration(actualMediaDuration);
    if (Number.isFinite(vid.duration) && vid.duration > 0) {
      setVerifiedStreamDuration(Math.round(vid.duration));
    }

    vid.volume = volume;
    vid.muted = isMuted;
    vid.playbackRate = playbackSpeed;

    // Restore saved resume timestamp if valid for this exact season & episode
    if (
      savedProgress &&
      Number(savedProgress.seasonNumber || 1) === Number(selectedSeasonNum) &&
      Number(savedProgress.episodeNumber || 1) === Number(selectedEp) &&
      savedProgress.resumeSeconds > 2 &&
      savedProgress.resumeSeconds < actualMediaDuration - 2
    ) {
      vid.currentTime = savedProgress.resumeSeconds;
      setCurrentTime(savedProgress.resumeSeconds);
      setResumedBanner(`Resumed Ep ${selectedEp} at ${formatTimestamp(savedProgress.resumeSeconds)}`);
    } else {
      setResumedBanner('');
    }

    const playPromise = vid.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => {
          vid.muted = true;
          setIsMuted(true);
          vid.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });
    }
  };

  const handleDurationChange = (e) => {
    const vid = e.currentTarget;
    if (Number.isFinite(vid.duration) && vid.duration > 0) {
      const realDur = Math.round(vid.duration);
      setDuration(realDur);
      setVerifiedStreamDuration(realDur);
    }
  };

  const handleTimeUpdate = (e) => {
    const vid = e.currentTarget;
    const nowSec = vid.currentTime || 0;
    const durSec =
      Number.isFinite(vid.duration) && vid.duration > 0
        ? Math.round(vid.duration)
        : duration;
    setCurrentTime(nowSec);

    // Persist watch history every 2 seconds using real media duration
    if (Math.floor(nowSec) % 2 === 0 && nowSec > 0.5 && durSec > 0) {
      onSelectEpisode?.({
        anime,
        seasonNumber: selectedSeasonNum,
        episodeNumber: selectedEp,
        resumeSeconds: Math.floor(nowSec),
        durationSeconds: Math.floor(durSec),
        episodeTitle: resolvedPlayback.episodeTitle
      });
    }
  };

  const togglePlayPause = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e) => {
    const newSec = Number(e.target.value);
    setCurrentTime(newSec);
    if (videoRef.current) {
      videoRef.current.currentTime = newSec;
    }
  };

  const handleSeasonChange = (seasonNum) => {
    const nextSeasonNum = Number(seasonNum);
    setSelectedSeasonNum(nextSeasonNum);
    const targetSeasonObj = seasons.find((s) => Number(s.season_number) === nextSeasonNum);
    const firstEpOfSeason = targetSeasonObj?.episodes?.[0]?.ep || 1;
    setSelectedEp(firstEpOfSeason);
    setCurrentTime(0);
    setResumedBanner('');
    setSourceMode('direct');
  };

  const handleEpisodePick = (epItem) => {
    setSelectedEp(Number(epItem.ep));
    setCurrentTime(0);
    setResumedBanner('');
    setSourceMode('direct');
    if (epItem.stream_url && epItem.duration_seconds) {
      onSelectEpisode?.({
        anime,
        seasonNumber: selectedSeasonNum,
        episodeNumber: epItem.ep,
        resumeSeconds: 0,
        durationSeconds: epItem.duration_seconds,
        episodeTitle: epItem.title
      });
    }
  };

  const handlePrevEpisode = () => {
    if (currentEpIndex > 0) {
      handleEpisodePick(episodes[currentEpIndex - 1]);
    }
  };

  const handleNextEpisode = () => {
    if (currentEpIndex >= 0 && currentEpIndex < episodes.length - 1) {
      handleEpisodePick(episodes[currentEpIndex + 1]);
    }
  };

  const toggleFullscreen = () => {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      stageRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const displayedRuntimeLabel = verifiedStreamDuration
    ? formatDurationSeconds(verifiedStreamDuration)
    : resolvedPlayback.durationSeconds
    ? formatDurationSeconds(resolvedPlayback.durationSeconds)
    : exactEpObj?.duration || 'External Partner';

  const currentEpTitle =
    resolvedPlayback.episodeTitle ||
    exactEpObj?.title ||
    `Episode ${selectedEp}`;

  const defaultCrunchyrollSearch = `https://www.crunchyroll.com/search?q=${encodeURIComponent(`${anime.title} episode ${selectedEp}`)}`;
  const defaultNetflixSearch = `https://www.netflix.com/search?q=${encodeURIComponent(anime.title)}`;
  const defaultHidiveSearch = `https://www.hidive.com/search?q=${encodeURIComponent(anime.title)}`;
  const defaultMuseAsiaSearch = `https://www.youtube.com/@MuseAsia/search?query=${encodeURIComponent(anime.title)}`;
  const defaultAniOneSearch = `https://www.youtube.com/@AniOneAsia/search?query=${encodeURIComponent(anime.title)}`;

  const isMissingExactEpisodeOrSeason =
    resolvedPlayback.sourceStatus === 'season-missing' ||
    resolvedPlayback.sourceStatus === 'episode-missing';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="screening-room-title"
    >
      <div className="relative w-full max-w-6xl rounded-2xl border border-white/10 bg-[#0E0D14] shadow-2xl flex flex-col overflow-hidden max-h-[96vh]">
        {/* Responsive Modal Header */}
        <div className="px-4 py-3 border-b border-white/10 bg-[#121118]/95 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#94A3B8]">
                <span className={hasDirectStream ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {hasDirectStream
                    ? `Full-Length Episode Stream (${displayedRuntimeLabel})`
                    : isMissingExactEpisodeOrSeason
                    ? `Episode Unavailable (${resolvedPlayback.sourceStatus})`
                    : 'External Licensed Episode · No In-App Video File'}
                </span>
                <span>·</span>
                <span>S{selectedSeasonNum} · Ep {selectedEp}</span>
                <span>·</span>
                <span className="text-[#64748B]" data-testid="canonical-episode-id">
                  ID: {canonicalEpisodeId}
                </span>
                {resumedBanner && (
                  <>
                    <span>·</span>
                    <span className="text-[#38BDF8] font-semibold truncate">{resumedBanner}</span>
                  </>
                )}
              </div>
              <h2
                id="screening-room-title"
                className="text-sm sm:text-lg font-bold tracking-tight text-white truncate mt-0.5"
              >
                {anime.title} — <span className="text-[#94A3B8] font-normal">{currentEpTitle}</span>
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close screening room"
              className="shrink-0 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#94A3B8] hover:text-white transition"
            >
              Close ✕
            </button>
          </div>

          {/* Content-Type Separated Switcher Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-0.5" role="tablist">
            <button
              type="button"
              onClick={() => setSourceMode('direct')}
              className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition ${
                sourceMode === 'direct'
                  ? hasDirectStream
                    ? 'bg-emerald-500 text-black font-bold shadow'
                    : 'bg-white text-[#0B0A0E] font-bold shadow'
                  : 'border border-white/10 bg-[#1A1823] text-[#94A3B8] hover:text-white'
              }`}
            >
              {hasDirectStream
                ? `▶ Full Episode ${selectedEp} (${displayedRuntimeLabel})`
                : `📺 Episode ${selectedEp} Availability & Official Partners`}
            </button>

            <button
              type="button"
              onClick={() => setSourceMode('partner-notice')}
              className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition ${
                sourceMode === 'partner-notice'
                  ? 'bg-amber-400 text-black font-semibold'
                  : 'border border-amber-400/30 bg-amber-400/10 text-amber-300 hover:text-white'
              }`}
            >
              🌐 Licensed Streaming Providers
            </button>

            {hasTrailer && (
              <button
                type="button"
                onClick={() => setSourceMode('trailer')}
                className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition ${
                  sourceMode === 'trailer'
                    ? 'bg-[#F43F5E] text-white font-semibold'
                    : 'border border-white/10 bg-[#1A1823] text-[#94A3B8] hover:text-white'
                }`}
              >
                🎬 Promotional Trailer Only (Not Full Episode)
              </button>
            )}
          </div>
        </div>

        {/* Main Screening Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-y-auto flex-1">
          {/* Left 8 Cols: Video Stage + Controls Shelf + Synopsis */}
          <div className="lg:col-span-8 flex flex-col border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0B0A0E]">
            {/* 16:9 Video Stage (expands vertically on mobile when showing text/button notice panels) */}
            <div
              ref={stageRef}
              className={`relative w-full bg-black select-none ${
                (sourceMode === 'direct' && hasDirectStream) ||
                (sourceMode === 'trailer' && trailerEmbedConfig.type === 'iframe')
                  ? 'aspect-video overflow-hidden'
                  : 'min-h-[260px] lg:aspect-video overflow-visible'
              }`}
            >
              {sourceMode === 'partner-notice' ? (
                /* Licensed Partner Availability Notice */
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#171522] to-[#0B0A0E]">
                  <span className="text-xs font-mono uppercase tracking-widest text-amber-400 mb-2">
                    Authorized Distribution · {anime.channel || 'Licensed Providers'}
                  </span>
                  <h3 className="text-lg sm:text-2xl font-bold text-white max-w-xl mb-2">
                    {anime.title} — Official Full-Episode Guide
                  </h3>
                  <p className="text-xs sm:text-sm text-[#94A3B8] max-w-lg leading-relaxed mb-5">
                    {availability.reason}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 mb-4">
                    {hasDirectStream && (
                      <button
                        type="button"
                        onClick={() => setSourceMode('direct')}
                        className="rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-xs sm:text-sm font-bold text-black transition"
                      >
                        ▶ Watch Full Episode {selectedEp} ({displayedRuntimeLabel})
                      </button>
                    )}
                    {resolvedPlayback.externalEpisodeUrl && (
                      <a
                        href={resolvedPlayback.externalEpisodeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-[#F43F5E] hover:bg-[#e11d48] px-4 py-2 text-xs sm:text-sm font-bold text-white transition"
                      >
                        ▶ Open Ep {selectedEp} Page on {resolvedPlayback.providerId || 'Official Partner'} ↗
                      </a>
                    )}
                    <a
                      href={defaultCrunchyrollSearch}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-white transition"
                    >
                      Search on Crunchyroll ↗
                    </a>
                    <a
                      href={defaultNetflixSearch}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-white transition"
                    >
                      Search on Netflix ↗
                    </a>
                    <a
                      href={defaultMuseAsiaSearch}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-white transition"
                    >
                      Search Muse Asia ↗
                    </a>
                  </div>
                </div>
              ) : sourceMode === 'direct' && hasDirectStream ? (
                /* Genuine HTML5 <video> Player with Complete Full-Length Episode Stream */
                <div className="relative w-full h-full bg-black">
                  <video
                    ref={videoRef}
                    key={`player-${canonicalEpisodeId}-${directVideoSrc}-${retryCount}`}
                    src={directVideoSrc}
                    data-testid="full-episode-video"
                    data-content-type="full_episode"
                    data-episode-id={canonicalEpisodeId}
                    className="absolute inset-0 w-full h-full object-contain bg-black cursor-pointer"
                    playsInline
                    preload="metadata"
                    onClick={togglePlayPause}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onDurationChange={handleDurationChange}
                    onTimeUpdate={handleTimeUpdate}
                    onWaiting={() => setIsBuffering(true)}
                    onPlaying={() => {
                      setIsBuffering(false);
                      setVideoError(null);
                      setIsPlaying(true);
                    }}
                    onPause={() => setIsPlaying(false)}
                    onEnded={handleNextEpisode}
                    onError={() =>
                      setVideoError('Full-episode stream interrupted or temporarily unreachable.')
                    }
                  >
                    {verifiedSubtitles.map((sub) => (
                      <track
                        key={sub.srcLang}
                        kind="subtitles"
                        label={sub.label}
                        srcLang={sub.srcLang}
                        src={sub.src}
                        default={sub.srcLang === subtitleLang}
                      />
                    ))}
                  </video>

                  {/* Error & Intelligent Recovery Overlay */}
                  {videoError && (
                    <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
                      <p className="text-xs sm:text-sm font-semibold text-rose-300 mb-3">
                        {videoError}
                      </p>
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setVideoError(null);
                            setRetryCount((c) => c + 1);
                          }}
                          className="rounded-lg bg-[#F43F5E] hover:bg-[#e11d48] px-3.5 py-1.5 text-xs font-semibold text-white transition"
                        >
                          Retry Full Episode Stream
                        </button>
                        <button
                          type="button"
                          onClick={() => setSourceMode('partner-notice')}
                          className="rounded-lg border border-white/20 bg-white/10 hover:bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white transition"
                        >
                          View Mirror Links
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Top Floating Metadata Readout */}
                  <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 text-[11px] font-mono">
                    <div className="bg-black/75 backdrop-blur-md px-2.5 py-1 rounded border border-white/10 text-white flex items-center gap-1.5">
                      <span className="text-emerald-400 font-semibold">Full Episode Stream</span>
                      <span>·</span>
                      <span>{displayedRuntimeLabel}</span>
                      <span>·</span>
                      <span className="text-[#38BDF8]">
                        {verifiedAudioTracks[selectedAudioIdx] || verifiedAudioTracks[0]}
                      </span>
                      {isBuffering && (
                        <>
                          <span>·</span>
                          <span className="text-amber-300">Buffering...</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Minimalist Bottom Transport Bar */}
                  <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-3 sm:px-4 pt-3 pb-2 flex flex-col gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, duration)}
                      step={0.5}
                      value={Math.min(currentTime, Math.max(1, duration))}
                      onChange={handleSeek}
                      aria-label="Seek video timeline"
                      className="w-full accent-[#F43F5E] h-1.5 bg-white/20 rounded-lg cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={togglePlayPause}
                          aria-label={isPlaying ? 'Pause video' : 'Play video'}
                          className="rounded bg-[#F43F5E] hover:bg-[#e11d48] px-3 py-1 font-bold text-white transition text-xs"
                        >
                          {isPlaying ? '❚❚ Pause' : '▶ Play'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const nextMute = !isMuted;
                            setIsMuted(nextMute);
                            if (videoRef.current) videoRef.current.muted = nextMute;
                          }}
                          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[#94A3B8] hover:text-white transition text-xs"
                        >
                          {isMuted ? 'Muted' : 'Audio'}
                        </button>
                        <span
                          data-testid="player-time-readout"
                          className="font-mono tabular-nums text-[#94A3B8] text-[11px]"
                        >
                          {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (videoRef.current?.requestPictureInPicture) {
                              if (document.pictureInPictureElement) {
                                document.exitPictureInPicture().catch(() => {});
                              } else {
                                videoRef.current.requestPictureInPicture().catch(() => {});
                              }
                            }
                          }}
                          className="hidden sm:inline-block rounded border border-white/15 bg-white/5 px-2 py-1 text-[#94A3B8] hover:text-white transition text-xs"
                        >
                          PiP
                        </button>
                        <button
                          type="button"
                          onClick={toggleFullscreen}
                          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[#94A3B8] hover:text-white transition text-xs"
                        >
                          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : sourceMode === 'direct' && !hasDirectStream ? (
                /* Honest Full-Episode Unavailable / External Partner Screen (NEVER plays Episode 1 or a 1-minute trailer) */
                <div
                  data-testid="episode-unavailable-notice"
                  className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#171522] to-[#0B0A0E]"
                >
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono uppercase tracking-wider mb-3">
                    <span>
                      {isMissingExactEpisodeOrSeason
                        ? `Exact Episode Not Found (${resolvedPlayback.sourceStatus}) · Never Falling Back to Episode 1`
                        : 'Full Episode Hosted on Official Partner Network'}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-xl font-bold text-white max-w-lg mb-2">
                    {anime.title} — Season {selectedSeasonNum}, Episode {selectedEp}: {currentEpTitle}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#94A3B8] max-w-lg mb-5 leading-relaxed">
                    {resolvedPlayback.reason}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    {resolvedPlayback.externalEpisodeUrl && (
                      <a
                        href={resolvedPlayback.externalEpisodeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl bg-[#F43F5E] hover:bg-[#e11d48] px-4 py-2 text-xs sm:text-sm font-bold text-white transition shadow-lg shadow-[#F43F5E]/20"
                      >
                        ▶ Open Verified Ep {selectedEp} Link on {resolvedPlayback.providerId || 'Official Partner'} ↗
                      </a>
                    )}
                    <a
                      href={defaultCrunchyrollSearch}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl bg-amber-400 hover:bg-amber-300 px-4 py-2 text-xs sm:text-sm font-bold text-black transition"
                    >
                      Search Ep {selectedEp} on Crunchyroll (Search Query) ↗
                    </a>
                    <a
                      href={defaultMuseAsiaSearch}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-white transition"
                    >
                      Search Muse Asia Channel ↗
                    </a>
                    {hasTrailer && (
                      <button
                        type="button"
                        onClick={() => setSourceMode('trailer')}
                        className="rounded-xl border border-white/15 bg-[#1A1823] hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-[#94A3B8] hover:text-white transition"
                      >
                        🎬 View Promotional Trailer (Separate from Episode)
                      </button>
                    )}
                  </div>
                </div>
              ) : sourceMode === 'trailer' && trailerEmbedConfig.type === 'iframe' ? (
                /* Explicitly Labeled Promotional Trailer View (Strictly Separated from Full Episodes) */
                <div className="relative w-full h-full bg-black flex flex-col">
                  <div className="bg-[#F43F5E] text-white px-3 py-1 text-[11px] font-mono font-bold uppercase tracking-wider flex items-center justify-between">
                    <span>🎬 PROMOTIONAL TRAILER ONLY (CONTENT TYPE: TRAILER — NOT FULL EPISODE {selectedEp})</span>
                    <button
                      type="button"
                      onClick={() => setSourceMode('direct')}
                      className="underline font-semibold text-white hover:text-black"
                    >
                      Return to Episode {selectedEp} →
                    </button>
                  </div>
                  <iframe
                    key={trailerEmbedConfig.src}
                    src={trailerEmbedConfig.src}
                    title={`${anime.title} Official Promotional Trailer`}
                    className="w-full flex-1 border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                  <p className="text-sm text-[#94A3B8] mb-3">
                    No promotional trailer is registered for this title.
                  </p>
                  <a
                    href={defaultCrunchyrollSearch}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-[#F43F5E] px-4 py-2 text-xs font-semibold text-white"
                  >
                    Search on Crunchyroll ↗
                  </a>
                </div>
              )}
            </div>

            {/* Dedicated Control Shelf: OUTSIDE Video Viewport (Zero Overlap on Mobile) */}
            <div className="bg-[#121118] border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevEpisode}
                  disabled={currentEpIndex <= 0}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-white disabled:opacity-40 hover:bg-white/10 transition"
                >
                  ⏮ Prev Ep
                </button>
                <button
                  type="button"
                  onClick={handleNextEpisode}
                  disabled={currentEpIndex < 0 || currentEpIndex >= episodes.length - 1}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-white disabled:opacity-40 hover:bg-white/10 transition"
                >
                  Next Ep ⏭
                </button>
              </div>

              {sourceMode === 'direct' && hasDirectStream ? (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Audio Track Handling: Only show switcher if multiple real tracks exist; otherwise show honest badge */}
                  {verifiedAudioTracks.length > 1 ? (
                    <select
                      aria-label="Audio track selection"
                      value={selectedAudioIdx}
                      onChange={(e) => setSelectedAudioIdx(Number(e.target.value))}
                      className="rounded-lg bg-[#1A1823] border border-white/15 px-2.5 py-1 text-xs text-white focus:outline-none"
                    >
                      {verifiedAudioTracks.map((trackName, idx) => (
                        <option key={idx} value={idx}>
                          Audio: {trackName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      data-testid="authentic-audio-badge"
                      className="rounded-lg bg-[#1A1823] border border-white/15 px-2.5 py-1 text-[11px] font-mono text-[#CBD5E1]"
                    >
                      Audio: {verifiedAudioTracks[0]}
                    </span>
                  )}

                  {/* Subtitle Track Handling: Only show switcher if verified title-specific VTT tracks exist */}
                  {verifiedSubtitles.length > 0 ? (
                    <select
                      aria-label="Subtitle language selection"
                      value={subtitleLang}
                      onChange={(e) => setSubtitleLang(e.target.value)}
                      className="rounded-lg bg-[#1A1823] border border-white/15 px-2.5 py-1 text-xs text-white focus:outline-none"
                    >
                      {verifiedSubtitles.map((sub) => (
                        <option key={sub.srcLang} value={sub.srcLang}>
                          Sub: {sub.label}
                        </option>
                      ))}
                      <option value="off">Subtitles: Off</option>
                    </select>
                  ) : (
                    <span
                      data-testid="authentic-subtitle-badge"
                      className="rounded-lg bg-[#1A1823] border border-white/15 px-2.5 py-1 text-[11px] font-mono text-emerald-300"
                    >
                      Subtitles: {resolvedPlayback.subtitleStatus || 'Broadcast Master (No Separate VTT)'}
                    </span>
                  )}

                  <select
                    aria-label="Playback speed"
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="rounded-lg bg-[#1A1823] border border-white/15 px-2 py-1 text-xs text-white font-mono focus:outline-none"
                  >
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1.0x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2.0x</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[#94A3B8] text-[11px] font-mono">
                  <span>Content Type: {sourceMode === 'trailer' ? 'TRAILER (PROMOTIONAL)' : canonicalContentType.toUpperCase()}</span>
                  {sourceMode !== 'direct' && (
                    <button
                      type="button"
                      onClick={() => setSourceMode('direct')}
                      className="text-xs text-[#F43F5E] hover:underline font-semibold"
                    >
                      Back to Episode {selectedEp} →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Episode Synopsis & Legal Streaming Links */}
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#94A3B8]">
                  <span>{anime.studio || 'Animation Studio'}</span>
                  <span>·</span>
                  <span>{anime.format || 'TV'} ({anime.year || 2024})</span>
                  <span>·</span>
                  <span className="text-amber-400 font-bold">★ {anime.score || '8.0'}</span>
                  <span>·</span>
                  <span className="px-2 py-0.5 rounded bg-white/10 text-white font-semibold">
                    {anime.rating || 'PG-13'}
                  </span>
                  <span>·</span>
                  <span className={hasDirectStream ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                    {hasDirectStream
                      ? `Full Episode Verified (${displayedRuntimeLabel})`
                      : 'External Partner License'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleWatchlist?.(anime.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                    isInWatchlist
                      ? 'border-[#F43F5E] bg-[#F43F5E]/20 text-[#F43F5E]'
                      : 'border-white/20 bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  {isInWatchlist ? '✓ In Watchlist' : '+ Add to Watchlist'}
                </button>
              </div>

              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">
                  S{selectedSeasonNum}:E{selectedEp} — {currentEpTitle} ({displayedRuntimeLabel})
                </h4>
                <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed mt-1">
                  {resolvedPlayback.synopsis || exactEpObj?.synopsis || anime.synopsis}
                </p>
              </div>

              {/* Verified Legal External Streaming Links (Explicitly Classified by Link Type) */}
              <div className="rounded-xl border border-white/10 bg-[#121118] p-3 text-xs space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#94A3B8]">
                  Authorized Distributors & Partner Link Classification:
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {(resolvedPlayback.legalLinks || []).map((link, idx) => {
                    const baseLabel = link.label || link.name || 'Partner Link';
                    const typeTag =
                      link.link_type === 'external_series_page' ? 'Series Page' : 'Search Query';
                    const alreadyTagged =
                      /series page|search/i.test(baseLabel);
                    return (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={
                          link.link_type === 'external_series_page'
                            ? 'text-emerald-400 hover:underline font-semibold'
                            : 'text-[#38BDF8] hover:underline font-medium'
                        }
                      >
                        {alreadyTagged ? `${baseLabel} ↗` : `${baseLabel} (${typeTag}) ↗`}
                      </a>
                    );
                  })}
                  <a
                    href={defaultHidiveSearch}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#38BDF8] hover:underline font-medium"
                  >
                    Search on HIDIVE ↗
                  </a>
                  <a
                    href={defaultAniOneSearch}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#38BDF8] hover:underline font-medium"
                  >
                    Search Ani-One Asia ↗
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Right 4 Cols: Season Switcher & Full Episode List */}
          <div className="lg:col-span-4 flex flex-col bg-[#0E0D14] max-h-[700px] overflow-hidden">
            {/* Season Selector */}
            {seasons.length > 1 && (
              <div className="p-3 border-b border-white/10 bg-[#121118]">
                <label htmlFor="season-dropdown" className="block text-[11px] font-mono text-[#94A3B8] uppercase mb-1">
                  Select Season:
                </label>
                <select
                  id="season-dropdown"
                  value={selectedSeasonNum}
                  onChange={(e) => handleSeasonChange(Number(e.target.value))}
                  className="w-full rounded-lg bg-[#1A1823] border border-white/15 px-3 py-1.5 text-xs text-white focus:outline-none"
                >
                  {seasons.map((s) => (
                    <option key={s.season_number} value={s.season_number}>
                      {s.name} ({s.episodes?.length || 0} Ep)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-white">
                Seasons & Verified Episodes
              </h3>
              <span className="text-[11px] font-mono text-[#94A3B8]">
                {episodes.length > 0
                  ? `${episodes.length} ${episodes.length === 1 ? 'Feature / Episode' : 'Episodes'}`
                  : 'Catalog Count Only'}
              </span>
            </div>

            {/* Scrollable Episode List */}
            <div className="overflow-y-auto divide-y divide-white/5 flex-1">
              {episodes.length === 0 ? (
                <div className="p-5 text-xs text-[#94A3B8] space-y-2">
                  <p className="font-semibold text-white">
                    No Individual Episode Records Returned by Public API
                  </p>
                  <p className="leading-relaxed">
                    Catalog metadata lists {anime.episodes || 'TBA'} total episodes for this title, but episode-by-episode streaming links were not provided. Kitsune+ never fabricates placeholder episodes when episode records are unavailable.
                  </p>
                </div>
              ) : (
                episodes.map((ep) => {
                  const isCurrent = Number(ep.ep) === Number(selectedEp);
                  const epHasDirectStream = Boolean(ep.stream_url && ep.content_type !== 'trailer');
                  const epDurationLabel = ep.duration_seconds
                    ? formatDurationSeconds(ep.duration_seconds)
                    : ep.duration || 'External Partner';

                  return (
                    <div
                      key={`${selectedSeasonNum}-${ep.ep}`}
                      className={`p-3 text-left transition flex items-start gap-3 ${
                        isCurrent
                          ? 'bg-[#F43F5E]/15 ring-1 ring-inset ring-[#F43F5E]/40'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <button
                        type="button"
                        data-testid={`episode-btn-s${selectedSeasonNum}-e${ep.ep}`}
                        onClick={() => handleEpisodePick(ep)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition ${
                          isCurrent
                            ? 'bg-[#F43F5E] text-white'
                            : 'bg-white/10 text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        {ep.ep}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleEpisodePick(ep)}
                            className={`text-xs font-bold text-left truncate transition ${
                              isCurrent ? 'text-white' : 'text-[#94A3B8] hover:text-white'
                            }`}
                          >
                            {ep.title}
                          </button>
                          <span className="text-[10px] font-mono text-[#64748B] shrink-0">
                            {epDurationLabel}
                          </span>
                        </div>

                        {ep.synopsis && (
                          <p className="text-[11px] text-[#64748B] line-clamp-2 mt-0.5 leading-relaxed">
                            {ep.synopsis}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono">
                          <button
                            type="button"
                            onClick={() => handleEpisodePick(ep)}
                            className={
                              epHasDirectStream
                                ? 'text-emerald-400 hover:underline font-semibold'
                                : 'text-amber-400 hover:underline font-semibold'
                            }
                          >
                            {epHasDirectStream
                              ? `▶ Play Full Episode (${epDurationLabel})`
                              : '🌐 View Partner Availability'}
                          </button>
                          <span>·</span>
                          <a
                            href={
                              ep.external_episode_url ||
                              ep.external_series_url ||
                              `https://www.crunchyroll.com/search?q=${encodeURIComponent(`${anime.title} episode ${ep.ep}`)}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#94A3B8] hover:text-white"
                          >
                            {ep.external_episode_url
                              ? 'Verified Ep Link ↗'
                              : ep.external_series_url
                              ? 'Official Series Page ↗'
                              : 'Partner Search ↗'}
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
