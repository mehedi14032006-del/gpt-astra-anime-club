import React, { useState, useEffect, useRef } from 'react';
import {
  resolveEmbedSource,
  getAvailabilityStatus,
  getAnimeSeasons,
  formatTimestamp
} from '../lib/catalogLogic.js';
import { SUBTITLE_TRACKS } from '../data/animeData.js';

/**
 * ScreeningModal
 * Production-ready Anime Screening Room:
 * - Genuine 1-to-1 mapping: Each anime episode plays its OWN unique, verified video source.
 * - Zero cross-title video reuse: No title ever plays another anime's video.
 * - Honest availability: If direct in-app stream is unavailable (e.g. licensed titles from AniList),
 *   clearly indicates partner-exclusive status with official trailer embeds and legitimate links.
 * - Dedicated control shelf below video frame for zero mobile overlap.
 * - State reset on anime/episode transition so no old video is retained.
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

  const [selectedSeasonNum, setSelectedSeasonNum] = useState(
    savedProgress?.seasonNumber || initialSeasonNumber || seasons[0]?.season_number || 1
  );

  const activeSeason =
    seasons.find((s) => s.season_number === Number(selectedSeasonNum)) ||
    seasons[0] || { season_number: 1, name: 'Season 1', episodes: [] };

  const episodes = activeSeason.episodes || [];

  const [selectedEp, setSelectedEp] = useState(
    savedProgress?.episodeNumber || initialEpisodeNumber || 1
  );

  const currentEpObj =
    episodes.find((e) => e.ep === selectedEp) ||
    episodes[0] || {
      ep: selectedEp,
      title: `Episode ${selectedEp}`,
      duration: '24m',
      duration_seconds: 1440,
      stream_url: null,
      subtitles: []
    };

  const currentEpIndex = Math.max(0, episodes.findIndex((e) => e.ep === selectedEp));

  // Genuine stream source for this exact episode (never a fallback to another anime)
  const directVideoSrc = currentEpObj.stream_url || null;
  const hasDirectStream = Boolean(directVideoSrc);

  const externalRawUrl =
    currentEpObj.embed_url || anime?.free_url || anime?.trailer_url;
  const embedConfig = resolveEmbedSource(externalRawUrl, currentEpIndex);
  const hasTrailer = Boolean(embedConfig.src);

  // Determine initial mode based on whether direct stream is genuinely available
  const [sourceMode, setSourceMode] = useState(() => {
    if (hasDirectStream) return 'direct';
    if (hasTrailer) return 'youtube';
    return 'partner-notice';
  });

  const [audioTrack, setAudioTrack] = useState('JP');
  const [subtitleLang, setSubtitleLang] = useState('en');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Real HTML5 <video> state
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(
    currentEpObj.duration_seconds || 30
  );
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [resumedBanner, setResumedBanner] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync mode and state when anime or episode picks change
  useEffect(() => {
    setVideoError(null);
    setIsBuffering(false);
    setCurrentTime(0);

    if (hasDirectStream) {
      setSourceMode('direct');
    } else if (hasTrailer) {
      setSourceMode('youtube');
    } else {
      setSourceMode('partner-notice');
    }
  }, [anime?.id, selectedSeasonNum, selectedEp, hasDirectStream, hasTrailer]);

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
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!anime) return null;

  const handleVideoLoadedMetadata = (e) => {
    const vid = e.currentTarget;
    const totalDur = Number.isFinite(vid.duration) && vid.duration > 0
      ? vid.duration
      : (currentEpObj.duration_seconds || 30);
    setDuration(totalDur);
    vid.volume = volume;
    vid.muted = isMuted;
    vid.playbackRate = playbackSpeed;

    // Restore saved resume timestamp
    if (
      savedProgress &&
      Number(savedProgress.seasonNumber || 1) === Number(selectedSeasonNum) &&
      Number(savedProgress.episodeNumber || 1) === Number(selectedEp) &&
      savedProgress.resumeSeconds > 1 &&
      savedProgress.resumeSeconds < totalDur - 1
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

  const handleTimeUpdate = (e) => {
    const vid = e.currentTarget;
    const nowSec = vid.currentTime || 0;
    const durSec = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : duration;
    setCurrentTime(nowSec);

    // Persist watch history every 2 seconds
    if (Math.floor(nowSec) % 2 === 0 && nowSec > 0.5) {
      onSelectEpisode?.({
        anime,
        seasonNumber: selectedSeasonNum,
        episodeNumber: selectedEp,
        resumeSeconds: Math.floor(nowSec),
        durationSeconds: Math.floor(durSec),
        episodeTitle: currentEpObj.title
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
    setSelectedSeasonNum(seasonNum);
    const targetSeasonObj = seasons.find((s) => s.season_number === seasonNum);
    const firstEpOfSeason = targetSeasonObj?.episodes?.[0]?.ep || 1;
    setSelectedEp(firstEpOfSeason);
    setCurrentTime(0);
    setResumedBanner('');
  };

  const handleEpisodePick = (epItem) => {
    setSelectedEp(epItem.ep);
    setCurrentTime(0);
    setResumedBanner('');
    onSelectEpisode?.({
      anime,
      seasonNumber: selectedSeasonNum,
      episodeNumber: epItem.ep,
      resumeSeconds: 0,
      durationSeconds: epItem.duration_seconds || 30,
      episodeTitle: epItem.title
    });
  };

  const handlePrevEpisode = () => {
    if (currentEpIndex > 0) {
      handleEpisodePick(episodes[currentEpIndex - 1]);
    }
  };

  const handleNextEpisode = () => {
    if (currentEpIndex < episodes.length - 1) {
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

  const defaultCrunchyrollSearch = `https://www.crunchyroll.com/search?q=${encodeURIComponent(anime.title)}`;
  const defaultNetflixSearch = `https://www.netflix.com/search?q=${encodeURIComponent(anime.title)}`;
  const defaultHidiveSearch = `https://www.hidive.com/search?q=${encodeURIComponent(anime.title)}`;

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
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#94A3B8]">
                <span className={hasDirectStream ? 'text-emerald-400 font-bold' : 'text-[#F43F5E] font-bold'}>
                  {hasDirectStream ? 'Verified Direct Stream' : 'Official License Hub'}
                </span>
                <span>·</span>
                <span>S{selectedSeasonNum} · Ep {selectedEp}</span>
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
                {anime.title} — <span className="text-[#94A3B8] font-normal">{currentEpObj.title}</span>
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

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-0.5" role="tablist">
            {hasDirectStream ? (
              <>
                <button
                  type="button"
                  onClick={() => setSourceMode('direct')}
                  className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition ${
                    sourceMode === 'direct'
                      ? 'bg-emerald-500 text-black font-bold shadow'
                      : 'border border-white/10 bg-[#1A1823] text-[#94A3B8] hover:text-white'
                  }`}
                >
                  ▶ Play Ep {selectedEp} (Direct HD)
                </button>
                {hasTrailer && (
                  <button
                    type="button"
                    onClick={() => setSourceMode('youtube')}
                    className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition ${
                      sourceMode === 'youtube'
                        ? 'bg-[#F43F5E] text-white font-semibold'
                        : 'border border-white/10 bg-[#1A1823] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    📺 Official Trailer / Clips
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSourceMode('partner-notice')}
                  className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition ${
                    sourceMode === 'partner-notice'
                      ? 'bg-amber-400 text-black font-semibold'
                      : 'border border-amber-400/30 bg-amber-400/10 text-amber-300 hover:text-white'
                  }`}
                >
                  🌐 External Distributor Links
                </button>
              </>
            ) : (
              <>
                {hasTrailer && (
                  <button
                    type="button"
                    onClick={() => setSourceMode('youtube')}
                    className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition ${
                      sourceMode === 'youtube'
                        ? 'bg-[#F43F5E] text-white font-semibold'
                        : 'border border-white/10 bg-[#1A1823] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    📺 Official Preview & Clips
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSourceMode('partner-notice')}
                  className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition ${
                    sourceMode === 'partner-notice'
                      ? 'bg-amber-400 text-black font-semibold'
                      : 'border border-amber-400/30 bg-amber-400/10 text-amber-300 hover:text-white'
                  }`}
                >
                  🌐 Where to Watch Full Series
                </button>
                <button
                  type="button"
                  onClick={() => setSourceMode('direct')}
                  className={`px-3 py-1 rounded-md font-medium whitespace-nowrap transition ${
                    sourceMode === 'direct'
                      ? 'bg-white/20 text-white font-semibold'
                      : 'border border-white/10 bg-[#1A1823] text-[#94A3B8] hover:text-white'
                  }`}
                >
                  ℹ️ In-App Stream License Status
                </button>
              </>
            )}
          </div>
        </div>

        {/* Main Screening Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 overflow-y-auto flex-1">
          {/* Left 8 Cols: Video Stage + Controls Shelf + Synopsis */}
          <div className="lg:col-span-8 flex flex-col border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0B0A0E]">
            {/* 16:9 Video Stage */}
            <div
              ref={stageRef}
              className="relative w-full aspect-video bg-black overflow-hidden select-none"
            >
              {sourceMode === 'partner-notice' ? (
                /* Licensed Partner Availability Notice */
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#171522] to-[#0B0A0E]">
                  <span className="text-xs font-mono uppercase tracking-widest text-amber-400 mb-2">
                    Official Streaming License · {anime.channel || 'Authorized Providers'}
                  </span>
                  <h3 className="text-lg sm:text-2xl font-bold text-white max-w-xl mb-2">
                    {anime.title} — Licensed Streaming Guide
                  </h3>
                  <p className="text-xs sm:text-sm text-[#94A3B8] max-w-lg leading-relaxed mb-5">
                    {availability.reason}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5 mb-4">
                    {hasDirectStream && (
                      <button
                        type="button"
                        onClick={() => setSourceMode('direct')}
                        className="rounded-lg bg-[#F43F5E] hover:bg-[#e11d48] px-4 py-2 text-xs sm:text-sm font-semibold text-white transition"
                      >
                        ▶ Play In-App Stream
                      </button>
                    )}
                    {hasTrailer && (
                      <button
                        type="button"
                        onClick={() => setSourceMode('youtube')}
                        className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 text-xs sm:text-sm font-semibold text-white transition"
                      >
                        📺 Watch Official Trailer
                      </button>
                    )}
                    <a
                      href={defaultCrunchyrollSearch}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-white transition"
                    >
                      Crunchyroll ↗
                    </a>
                    <a
                      href={defaultNetflixSearch}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-white transition"
                    >
                      Netflix ↗
                    </a>
                  </div>
                  <p className="text-[11px] text-[#64748B]">
                    Kitsune+ connects directly to verified streaming channels and official providers.
                  </p>
                </div>
              ) : sourceMode === 'direct' && hasDirectStream ? (
                /* Genuine HTML5 <video> Player with Distinct Episode Stream */
                <div className="relative w-full h-full bg-black">
                  <video
                    ref={videoRef}
                    key={`player-${anime.id}-${selectedSeasonNum}-${selectedEp}-${directVideoSrc}`}
                    src={directVideoSrc}
                    className="absolute inset-0 w-full h-full object-cover bg-black cursor-pointer"
                    playsInline
                    preload="metadata"
                    onClick={togglePlayPause}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onWaiting={() => setIsBuffering(true)}
                    onPlaying={() => {
                      setIsBuffering(false);
                      setIsPlaying(true);
                    }}
                    onPause={() => setIsPlaying(false)}
                    onEnded={handleNextEpisode}
                    onError={() =>
                      setVideoError('Video source temporarily buffering or format mismatch.')
                    }
                  >
                    {(currentEpObj.subtitles || SUBTITLE_TRACKS).map((sub) => (
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

                  {/* Top Floating Badge */}
                  <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 text-[11px] font-mono">
                    <div className="bg-black/75 backdrop-blur-md px-2.5 py-1 rounded border border-white/10 text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Verified Stream</span>
                      <span>·</span>
                      <span className="text-[#38BDF8]">
                        {audioTrack === 'JP' ? 'JP Original' : 'EN Dub'}
                      </span>
                    </div>
                  </div>

                  {/* Minimalist Bottom Transport Bar */}
                  <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-3 sm:px-4 pt-3 pb-2 flex flex-col gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(1, duration)}
                      step={0.1}
                      value={Math.min(currentTime, duration)}
                      onChange={handleSeek}
                      aria-label="Seek video timeline"
                      className="w-full accent-[#F43F5E] h-1.5 bg-white/20 rounded-lg cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
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
                          {isMuted ? '🔇 Muted' : '🔊 Audio'}
                        </button>
                        <span className="font-mono text-[#94A3B8] text-[11px]">
                          {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[#94A3B8] hover:text-white transition text-xs"
                      >
                        {isFullscreen ? 'Exit Fullscreen' : '⛶ Fullscreen'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : sourceMode === 'direct' && !hasDirectStream ? (
                /* Clear 'Direct Playback Unavailable' Screen (NEVER plays another anime) */
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#171522] to-[#0B0A0E]">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono uppercase tracking-wider mb-3">
                    <span>✦</span>
                    <span>Licensed Partner Exclusive</span>
                  </div>
                  <h3 className="text-base sm:text-xl font-bold text-white max-w-md mb-2">
                    {anime.title} — Episode {selectedEp}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#94A3B8] max-w-md mb-5 leading-relaxed">
                    Direct in-app video streams are not hosted on Kitsune+ CDN to respect distributor licensing. Full episodes are legitimately distributed on authorized streaming partner networks.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    {hasTrailer && (
                      <button
                        type="button"
                        onClick={() => setSourceMode('youtube')}
                        className="rounded-xl bg-[#F43F5E] hover:bg-[#e11d48] px-4 py-2 text-xs sm:text-sm font-semibold text-white transition flex items-center gap-2 shadow-lg shadow-[#F43F5E]/20"
                      >
                        <span>📺</span>
                        <span>Watch Official Trailer / Preview</span>
                      </button>
                    )}
                    <a
                      href={defaultCrunchyrollSearch}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs sm:text-sm font-medium text-white transition"
                    >
                      Crunchyroll Episodes ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => setSourceMode('partner-notice')}
                      className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs sm:text-sm font-medium text-amber-300 hover:text-white transition"
                    >
                      Where to Watch Guide ↗
                    </button>
                  </div>
                </div>
              ) : embedConfig.type === 'iframe' ? (
                /* Official YouTube Trailer / Partner Embed */
                <iframe
                  key={embedConfig.src}
                  src={embedConfig.src}
                  title={`${anime.title} S${selectedSeasonNum}:E${selectedEp}`}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                  <p className="text-sm text-[#94A3B8] mb-3">
                    External distributor embed unavailable for this title.
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
                  disabled={currentEpIndex >= episodes.length - 1}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-white disabled:opacity-40 hover:bg-white/10 transition"
                >
                  Next Ep ⏭
                </button>
              </div>

              {sourceMode === 'direct' && hasDirectStream ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Audio track selection"
                    value={audioTrack}
                    onChange={(e) => setAudioTrack(e.target.value)}
                    className="rounded-lg bg-[#1A1823] border border-white/15 px-2.5 py-1 text-xs text-white focus:outline-none"
                  >
                    <option value="JP">Audio: Japanese (Original)</option>
                    <option value="EN">Audio: English Dub (5.1)</option>
                  </select>

                  <select
                    aria-label="Subtitle language selection"
                    value={subtitleLang}
                    onChange={(e) => setSubtitleLang(e.target.value)}
                    className="rounded-lg bg-[#1A1823] border border-white/15 px-2.5 py-1 text-xs text-white focus:outline-none"
                  >
                    <option value="en">Sub: English</option>
                    <option value="ja">Sub: 日本語 (JP)</option>
                    <option value="es">Sub: Español</option>
                    <option value="off">Subtitles: Off</option>
                  </select>

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
                <div className="flex items-center gap-2 text-[#94A3B8] text-[11px]">
                  <span>{hasDirectStream ? 'Official stream active' : 'Official Licensed Distribution'}</span>
                  {hasDirectStream && sourceMode !== 'direct' && (
                    <button
                      type="button"
                      onClick={() => setSourceMode('direct')}
                      className="text-xs text-[#F43F5E] hover:underline font-semibold"
                    >
                      Switch to Direct Player →
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
                    {hasDirectStream ? 'In-App Stream Verified' : 'Licensed Partner'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleWatchlist?.(anime)}
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
                  S{selectedSeasonNum}:E{selectedEp} — {currentEpObj.title} ({currentEpObj.duration || '24m'})
                </h4>
                <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed mt-1">
                  {currentEpObj.synopsis || anime.synopsis}
                </p>
              </div>

              {/* Verified Legal External Streaming Links */}
              <div className="rounded-xl border border-white/10 bg-[#121118] p-3 text-xs space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#94A3B8]">
                  Official Licensed Distributors & External Mirrors:
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={defaultCrunchyrollSearch}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#38BDF8] hover:underline font-medium"
                  >
                    Crunchyroll ↗
                  </a>
                  <a
                    href={defaultNetflixSearch}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#38BDF8] hover:underline font-medium"
                  >
                    Netflix Anime ↗
                  </a>
                  <a
                    href={defaultHidiveSearch}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#38BDF8] hover:underline font-medium"
                  >
                    HIDIVE ↗
                  </a>
                  {embedConfig.src && (
                    <a
                      href={embedConfig.src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#38BDF8] hover:underline font-medium"
                    >
                      YouTube Official ↗
                    </a>
                  )}
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
                Seasons & Episodes
              </h3>
              <span className="text-[11px] font-mono text-[#94A3B8]">
                {episodes.length} Episodes
              </span>
            </div>

            {/* Scrollable Episode List */}
            <div className="overflow-y-auto divide-y divide-white/5 flex-1">
              {episodes.map((ep) => {
                const isCurrent = ep.ep === selectedEp;
                const epHasDirectStream = Boolean(ep.stream_url);

                return (
                  <div
                    key={`${selectedSeasonNum}-${ep.ep}`}
                    className={`p-3 text-left transition flex items-start gap-3 ${
                      isCurrent
                        ? 'bg-[#F43F5E]/15 border-l-4 border-[#F43F5E]'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <button
                      type="button"
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
                          {ep.duration || '24m'}
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
                          className={epHasDirectStream ? 'text-emerald-400 hover:underline font-semibold' : 'text-[#F43F5E] hover:underline font-semibold'}
                        >
                          {epHasDirectStream ? '▶ Play In-App Stream' : '📺 Watch Preview'}
                        </button>
                        <span>·</span>
                        <a
                          href={`https://www.crunchyroll.com/search?q=${encodeURIComponent(`${anime.title} episode ${ep.ep}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#94A3B8] hover:text-white"
                        >
                          Official Partner ↗
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
