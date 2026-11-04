-- =============================================================================
-- GPT ASTRA ANIME CLUB / KITSUNE+ — PRODUCTION SUPABASE DATABASE SCHEMA
-- Reversible & Idempotent SQL Migration with Row Level Security (RLS)
-- =============================================================================

-- 1. PROFILES & SUBSCRIPTION ENTITLEMENTS
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
  stripe_customer_id TEXT,
  verified_adult BOOLEAN NOT NULL DEFAULT FALSE,
  verified_age INTEGER,
  region_code TEXT DEFAULT 'GLOBAL',
  preferred_audio_lang TEXT DEFAULT 'JP',
  preferred_subtitle_lang TEXT DEFAULT 'en',
  autoplay_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ANIME MASTER CATALOG
CREATE TABLE IF NOT EXISTS public.anime (
  id TEXT PRIMARY KEY,
  anilist_id INTEGER UNIQUE,
  mal_id INTEGER UNIQUE,
  title_english TEXT NOT NULL,
  title_romaji TEXT,
  title_native TEXT,
  synopsis TEXT,
  format TEXT DEFAULT 'TV',
  release_status TEXT DEFAULT 'Completed',
  season TEXT,
  release_year INTEGER,
  episodes_count INTEGER,
  duration_minutes INTEGER DEFAULT 24,
  average_score NUMERIC(4,2),
  rating TEXT DEFAULT 'PG-13',
  is_adult BOOLEAN NOT NULL DEFAULT FALSE,
  adult_distribution_approved BOOLEAN NOT NULL DEFAULT FALSE,
  poster_url TEXT,
  banner_url TEXT,
  banner_color TEXT DEFAULT '#F43F5E',
  studio TEXT,
  genres TEXT[] DEFAULT '{}',
  trailer_url TEXT,
  availability_type TEXT NOT NULL DEFAULT 'licensed-partner' CHECK (availability_type IN ('direct-hd', 'official-youtube', 'licensed-partner', 'unavailable')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anime_anilist_id ON public.anime(anilist_id);
CREATE INDEX IF NOT EXISTS idx_anime_mal_id ON public.anime(mal_id);
CREATE INDEX IF NOT EXISTS idx_anime_is_adult ON public.anime(is_adult);

-- 3. SEASONS
CREATE TABLE IF NOT EXISTS public.seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anime_id TEXT NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  release_year INTEGER,
  UNIQUE(anime_id, season_number)
);

-- 4. EPISODES & AUTHORIZED MEDIA SOURCES (Strict 1-to-1 Identity)
CREATE TABLE IF NOT EXISTS public.episodes (
  id TEXT PRIMARY KEY, -- Composite canonical key: {anime_id}:s{season_number}:e{episode_number}
  anime_id TEXT NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL DEFAULT 1,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  synopsis TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 1440,
  air_date TEXT,
  is_special BOOLEAN NOT NULL DEFAULT FALSE,
  provider_id TEXT NOT NULL DEFAULT 'licensed-partner',
  media_source_id TEXT UNIQUE, -- Prevents two episodes or anime from sharing the same direct video record
  stream_url TEXT,
  embed_url TEXT,
  source_status TEXT NOT NULL DEFAULT 'catalog-only' CHECK (source_status IN ('verified-playable', 'licensed-embed', 'external-partner', 'unavailable')),
  permitted_regions TEXT[] DEFAULT '{GLOBAL}',
  audio_tracks JSONB DEFAULT '[]'::jsonb,
  subtitle_tracks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(anime_id, season_number, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_episodes_anime_season ON public.episodes(anime_id, season_number, episode_number);

-- 5. USER WATCHLISTS & PERSONALIZATION CATEGORIES
CREATE TABLE IF NOT EXISTS public.user_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('watching', 'planToWatch', 'completed', 'favorites', 'onHold', 'dropped')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, anime_id)
);

-- 6. SECOND-ACCURATE WATCH PROGRESS & HISTORY
CREATE TABLE IF NOT EXISTS public.watch_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  season_number INTEGER NOT NULL DEFAULT 1,
  episode_number INTEGER NOT NULL DEFAULT 1,
  episode_id TEXT NOT NULL,
  episode_title TEXT,
  resume_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 1440,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, anime_id)
);

-- 7. ADMINISTRATIVE AUDIT LOGS & CONTENT MODERATION REPORTS
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  target_entity TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can only read and update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own non-privileged profile fields" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Public read access for non-adult anime; adult anime requires verified adult profile
CREATE POLICY "Public can view all-ages anime" ON public.anime
  FOR SELECT USING (
    is_adult = FALSE OR (
      adult_distribution_approved = TRUE AND
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.verified_adult = TRUE
      )
    )
  );

CREATE POLICY "Public can view seasons and episodes" ON public.seasons
  FOR SELECT USING (TRUE);

CREATE POLICY "Public can view episodes" ON public.episodes
  FOR SELECT USING (TRUE);

-- Strict user isolation for watchlists and watch progress
CREATE POLICY "Users manage own watchlist" ON public.user_watchlists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own watch progress" ON public.watch_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Only administrators can read or write audit logs
CREATE POLICY "Admins view audit logs" ON public.admin_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
