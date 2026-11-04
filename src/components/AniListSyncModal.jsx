import React, { useState } from 'react';
import { queryAniList, ANILIST_USER_LIST_QUERY } from '../lib/anilistClient.js';

/**
 * AniListSyncModal
 * Allows syncing user lists and favorites with AniList:
 * 1. Username-based public sync (fetches complete MediaListCollection)
 * 2. AniList OAuth / Access Token connection
 */
export function AniListSyncModal({
  onClose,
  onImportUserLists,
  currentSyncedUser = null,
  onDisconnect
}) {
  const [userName, setUserName] = useState(currentSyncedUser?.name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [syncSuccess, setSyncSuccess] = useState('');

  const handleSyncSubmit = async (e) => {
    e.preventDefault();
    const cleanUser = userName.trim();
    if (!cleanUser) {
      setError('Please enter a valid AniList username.');
      return;
    }

    setLoading(true);
    setError('');
    setSyncSuccess('');

    try {
      const data = await queryAniList(
        ANILIST_USER_LIST_QUERY,
        { userName: cleanUser },
        { useCache: false }
      );

      const collection = data?.MediaListCollection;
      if (!collection?.user) {
        throw new Error(`AniList profile "${cleanUser}" was not found or has private anime lists.`);
      }

      // Categorize entries
      const categorized = {
        watching: [],
        planToWatch: [],
        completed: [],
        favorites: [],
        dropped: [],
        onHold: []
      };

      const lists = collection.lists || [];
      for (const list of lists) {
        const status = list.status;
        for (const entry of list.entries || []) {
          const idStr = String(entry.media.id);
          if (status === 'CURRENT' && !categorized.watching.includes(idStr)) {
            categorized.watching.push(idStr);
          } else if (status === 'PLANNING' && !categorized.planToWatch.includes(idStr)) {
            categorized.planToWatch.push(idStr);
          } else if (status === 'COMPLETED' && !categorized.completed.includes(idStr)) {
            categorized.completed.push(idStr);
          } else if (status === 'DROPPED' && !categorized.dropped.includes(idStr)) {
            categorized.dropped.push(idStr);
          } else if (status === 'PAUSED' && !categorized.onHold.includes(idStr)) {
            categorized.onHold.push(idStr);
          }
        }
      }

      onImportUserLists({
        user: {
          id: collection.user.id,
          name: collection.user.name,
          avatar: collection.user.avatar?.medium || collection.user.avatar?.large,
          stats: collection.user.statistics?.anime
        },
        lists: categorized
      });

      const totalEntries =
        categorized.watching.length +
        categorized.planToWatch.length +
        categorized.completed.length +
        categorized.dropped.length +
        categorized.onHold.length;

      setSyncSuccess(
        `Successfully synced ${totalEntries} anime from AniList account "${collection.user.name}"!`
      );
    } catch (err) {
      setError(err.message || 'Failed to sync with AniList. Check the username and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="anilist-sync-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#13121A] p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#02A9FF]" />
            <span className="text-xs font-mono uppercase tracking-wider text-[#02A9FF]">
              AniList Account Sync
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[#94A3B8] hover:text-white"
          >
            Close ✕
          </button>
        </div>

        <h2 id="anilist-sync-title" className="text-xl font-bold text-white">
          Synchronize Your Anime Library
        </h2>

        <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
          Import your public AniList watchlists (Watching, Plan to Watch, Completed, On Hold, Dropped) directly into Kitsune+.
        </p>

        {currentSyncedUser && (
          <div className="rounded-xl border border-white/10 bg-[#1A1823] p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentSyncedUser.avatar && (
                <img
                  src={currentSyncedUser.avatar}
                  alt={currentSyncedUser.name}
                  className="w-10 h-10 rounded-full object-cover border border-white/20"
                />
              )}
              <div>
                <div className="text-xs font-bold text-white">{currentSyncedUser.name}</div>
                <div className="text-[11px] font-mono text-[#02A9FF]">
                  {currentSyncedUser.stats?.count || 0} Anime in library
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onDisconnect}
              className="text-xs text-rose-400 hover:underline font-mono"
            >
              Disconnect
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/15 p-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        {syncSuccess && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 p-3 text-xs text-emerald-300">
            {syncSuccess}
          </div>
        )}

        <form onSubmit={handleSyncSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-mono text-[#94A3B8] mb-1">
              AniList Username
            </label>
            <input
              type="text"
              required
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="e.g. Josh, Rei, AnimeLover"
              className="w-full rounded-lg border border-white/15 bg-[#0B0A0E] px-3.5 py-2 text-sm text-white focus:border-[#02A9FF] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-[#02A9FF] hover:bg-[#0091dc] disabled:opacity-50 py-2.5 text-xs font-bold text-white transition"
            >
              {loading ? 'Syncing Library...' : 'Sync AniList Watchlist'}
            </button>
          </div>
        </form>

        <div className="pt-2 border-t border-white/10 text-[11px] text-[#64748B] text-center">
          Kitsune+ connects directly to the official AniList GraphQL endpoint (<a href="https://graphql.anilist.co" target="_blank" rel="noopener noreferrer" className="text-[#38BDF8] hover:underline">graphql.anilist.co</a>).
        </div>
      </div>
    </div>
  );
}
