import React, { useState, useRef } from 'react';
import { SUBTITLE_TRACKS } from '../data/animeData.js';
import { formatTimestamp } from '../lib/catalogLogic.js';
import './PremiumVideoPlayer.css';

/**
 * Repaired PremiumVideoPlayer component:
 * - Works out-of-the-box with local H.264/AAC MP4 streams (/streams/*.mp4) and WebVTT subtitles
 * - Does not crash when Supabase RPC is offline or unconfigured
 */
export default function PremiumVideoPlayer({
  videoId = 'sintel-dragon-chronicles',
  streamUrl = '/streams/sintel-ep1.mp4',
  title = "Sintel (The Dragon Warrior)",
  isUserPremium = false,
  onUpgradeClick
}) {
  const videoRef = useRef(null);
  const [selectedLang, setSelectedLang] = useState('en');
  const [audioDub, setAudioDub] = useState('JP');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);

  if (!streamUrl) {
    return (
      <div className="screening-room-container p-6 text-center bg-[#0e0d17] rounded-xl border border-white/10 text-white">
        <h3 className="text-lg font-bold mb-2">{title}</h3>
        <p className="text-xs text-zinc-400 mb-4">Direct in-app video source is not hosted for this title.</p>
        <a
          href={`https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-lg bg-[#F43F5E] px-4 py-2 text-xs font-semibold text-white"
        >
          Search Authorized Streams on Crunchyroll ↗
        </a>
      </div>
    );
  }

  return (
    <div className="screening-room-container" data-video-id={videoId}>
      <div className="video-viewport">
        <video
          ref={videoRef}
          className="video-element"
          controls
          playsInline
          preload="metadata"
          src={streamUrl}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 30)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
        >
          {SUBTITLE_TRACKS.map((track) => (
            <track
              key={track.srcLang}
              kind="subtitles"
              src={track.src}
              srcLang={track.srcLang}
              label={track.label}
              default={track.srcLang === selectedLang}
            />
          ))}
        </video>

        <div className="glass-control-bar">
          <div className="track-selector">
            <span className="control-label">
              {title} · {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
            </span>
            <div className="pill-group">
              <button
                type="button"
                className={`pill ${audioDub === 'JP' ? 'active' : ''}`}
                onClick={() => setAudioDub('JP')}
              >
                JP Original
              </button>
              <button
                type="button"
                className={`pill ${audioDub === 'EN' ? 'active' : ''}`}
                onClick={() => setAudioDub('EN')}
              >
                EN Dub
              </button>
              {SUBTITLE_TRACKS.map((sub) => (
                <button
                  key={sub.srcLang}
                  type="button"
                  className={`pill ${selectedLang === sub.srcLang ? 'active' : ''}`}
                  onClick={() => setSelectedLang(sub.srcLang)}
                >
                  {sub.srcLang.toUpperCase()} Sub
                </button>
              ))}
            </div>
          </div>

          {!isUserPremium && onUpgradeClick && (
            <button type="button" className="btn-upgrade-Trigger" onClick={onUpgradeClick}>
              <span>✦ Early Simulcast Pass</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
