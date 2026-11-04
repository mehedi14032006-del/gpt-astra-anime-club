-- =============================================================================
-- GPT ASTRA ANIME CLUB / KITSUNE+ — PRODUCTION SUPABASE DATABASE SCHEMA
-- Reversible & Idempotent SQL Migration with Strict Row Level Security (RLS),
-- Anti-Privilege-Escalation Triggers, Adult Content Protection, and Audit Logs
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
  verified_age INTEGER CHECK (verified_age IS NULL OR (verified_age >= 13 AND verified_age <= 120)),
  region_code TEXT DEFAULT 'GLOBAL',
  preferred_audio_lang TEXT DEFAULT 'JP',
  preferred_subtitle_lang TEXT DEFAULT 'en',
  autoplay_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security Helper: Server-Verified Admin Role Check
CREATE OR REPLACE FUNCTION public.is_verified_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Security Helper: Server-Verified Adult Eligibility Check
CREATE OR REPLACE FUNCTION public.is_verified_adult()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND verified_adult = TRUE
  );
$$;

-- Security Trigger: Prevent Authenticated Users from Escalating Privileged Profile Columns
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF jwt_role <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Security Violation: Modifying profile role requires server-side service_role authorization.';
    END IF;
    IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
      RAISE EXCEPTION 'Security Violation: Modifying subscription_tier requires verified Stripe webhook service_role authorization.';
    END IF;
    IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
      RAISE EXCEPTION 'Security Violation: Modifying stripe_customer_id requires server-side service_role authorization.';
    END IF;
    IF NEW.verified_adult IS DISTINCT FROM OLD.verified_adult THEN
      RAISE EXCEPTION 'Security Violation: Modifying verified_adult requires server-side age verification authorization.';
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2. ANIME MASTER CATALOG (Unknown durations stored as NULL, never fabricated)
CREATE TABLE IF NOT EXISTS public.anime (
  id TEXT PRIMARY KEY,
  anilist_id INTEGER UNIQUE,
  mal_id INTEGER UNIQUE,
  title_english TEXT NOT NULL,
  title_romaji TEXT,
  title_native TEXT,
  synopsis TEXT,
  format TEXT DEFAULT 'TV',
  content_classification TEXT NOT NULL DEFAULT 'japanese_anime' CHECK (
    content_classification IN ('japanese_anime', 'asian_animation_heritage', 'open_source_animated_film', 'classic_theatrical_animation')
  ),
  release_status TEXT DEFAULT 'Completed',
  season TEXT,
  release_year INTEGER,
  episodes_count INTEGER CHECK (episodes_count IS NULL OR episodes_count > 0),
  duration_minutes INTEGER DEFAULT NULL CHECK (duration_minutes IS NULL OR duration_minutes > 0),
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
  availability_type TEXT NOT NULL DEFAULT 'licensed-partner' CHECK (
    availability_type IN ('direct-hd', 'official-youtube', 'licensed-partner', 'unavailable')
  ),
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
  season_number INTEGER NOT NULL CHECK (season_number >= 1),
  name TEXT NOT NULL,
  release_year INTEGER,
  UNIQUE(anime_id, season_number)
);

-- 4. EPISODES & AUTHORIZED MEDIA SOURCES (Strict 1-to-1 Identity & NULL Default Duration)
CREATE TABLE IF NOT EXISTS public.episodes (
  id TEXT PRIMARY KEY, -- Composite canonical key: {anime_id}:s{season_number}:e{episode_number}
  anime_id TEXT NOT NULL REFERENCES public.anime(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL DEFAULT 1 CHECK (season_number >= 1),
  episode_number INTEGER NOT NULL CHECK (episode_number >= 1),
  content_type TEXT NOT NULL DEFAULT 'external_licensed_episode' CHECK (
    content_type IN ('full_episode', 'official_episode_embed', 'external_licensed_episode', 'trailer', 'unavailable')
  ),
  title TEXT NOT NULL,
  synopsis TEXT,
  duration_seconds INTEGER DEFAULT NULL CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  air_date TEXT,
  is_special BOOLEAN NOT NULL DEFAULT FALSE,
  provider_id TEXT NOT NULL DEFAULT 'licensed-partner',
  media_source_id TEXT UNIQUE, -- Prevents two episodes or anime from sharing the same direct video record
  stream_url TEXT,
  embed_url TEXT,
  external_episode_url TEXT,
  source_status TEXT NOT NULL DEFAULT 'external-partner' CHECK (
    source_status IN ('verified-playable', 'licensed-embed', 'external-partner', 'unavailable')
  ),
  verified_at TIMESTAMPTZ,
  http_status INTEGER,
  mime_type TEXT,
  authorization_evidence TEXT,
  permitted_regions TEXT[] DEFAULT '{GLOBAL}',
  audio_tracks JSONB DEFAULT '[]'::jsonb,
  subtitle_status TEXT DEFAULT 'Broadcast Master',
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

-- 6. SECOND-ACCURATE WATCH PROGRESS & HISTORY (Unique per User + Anime + Season + Episode)
CREATE TABLE IF NOT EXISTS public.watch_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anime_id TEXT NOT NULL,
  season_number INTEGER NOT NULL DEFAULT 1 CHECK (season_number >= 1),
  episode_number INTEGER NOT NULL DEFAULT 1 CHECK (episode_number >= 1),
  episode_id TEXT NOT NULL,
  episode_title TEXT,
  resume_seconds INTEGER NOT NULL DEFAULT 0 CHECK (resume_seconds >= 0),
  duration_seconds INTEGER DEFAULT NULL CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, anime_id, season_number, episode_number)
);

-- 7. SOURCE VERIFICATION RECORDS & ADMINISTRATIVE AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.source_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id TEXT NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  http_status INTEGER NOT NULL,
  mime_type TEXT,
  measured_duration_seconds INTEGER CHECK (measured_duration_seconds IS NULL OR measured_duration_seconds > 0),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('VERIFIED', 'FAILED', 'UNREACHABLE')),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
ALTER TABLE public.source_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can only read and update their own profile (privileged columns locked by trigger + WITH CHECK)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_verified_admin());

DROP POLICY IF EXISTS "Users can update own non-privileged profile fields" ON public.profiles;
CREATE POLICY "Users can update own non-privileged profile fields" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND subscription_tier = (SELECT p.subscription_tier FROM public.profiles p WHERE p.id = auth.uid())
    AND verified_adult = (SELECT p.verified_adult FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Public read access for non-adult anime; adult anime strictly requires verified adult profile
DROP POLICY IF EXISTS "Public can view all-ages anime" ON public.anime;
CREATE POLICY "Public can view all-ages anime" ON public.anime
  FOR SELECT USING (
    is_adult = FALSE OR (
      adult_distribution_approved = TRUE AND public.is_verified_adult()
    )
  );

-- Seasons and Episodes inherit adult-content restrictions from their parent anime (NO unconditional USING (TRUE))
DROP POLICY IF EXISTS "Public can view seasons and episodes" ON public.seasons;
DROP POLICY IF EXISTS "Authorized users can view seasons of permitted anime" ON public.seasons;
CREATE POLICY "Authorized users can view seasons of permitted anime" ON public.seasons
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.anime a
      WHERE a.id = seasons.anime_id
        AND (
          a.is_adult = FALSE
          OR (a.adult_distribution_approved = TRUE AND public.is_verified_adult())
        )
    )
  );

DROP POLICY IF EXISTS "Public can view episodes" ON public.episodes;
DROP POLICY IF EXISTS "Authorized users can view episodes of permitted anime" ON public.episodes;
CREATE POLICY "Authorized users can view episodes of permitted anime" ON public.episodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.anime a
      WHERE a.id = episodes.anime_id
        AND (
          a.is_adult = FALSE
          OR (a.adult_distribution_approved = TRUE AND public.is_verified_adult())
        )
    )
  );

-- Only verified administrators can insert/update catalog, seasons, episodes, or source verifications
DROP POLICY IF EXISTS "Admins manage anime catalog" ON public.anime;
CREATE POLICY "Admins manage anime catalog" ON public.anime
  FOR ALL USING (public.is_verified_admin()) WITH CHECK (public.is_verified_admin());

DROP POLICY IF EXISTS "Admins manage seasons" ON public.seasons;
CREATE POLICY "Admins manage seasons" ON public.seasons
  FOR ALL USING (public.is_verified_admin()) WITH CHECK (public.is_verified_admin());

DROP POLICY IF EXISTS "Admins manage episodes" ON public.episodes;
CREATE POLICY "Admins manage episodes" ON public.episodes
  FOR ALL USING (public.is_verified_admin()) WITH CHECK (public.is_verified_admin());

-- Strict user isolation for watchlists and watch progress
DROP POLICY IF EXISTS "Users manage own watchlist" ON public.user_watchlists;
CREATE POLICY "Users manage own watchlist" ON public.user_watchlists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own watch progress" ON public.watch_progress;
CREATE POLICY "Users manage own watch progress" ON public.watch_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Only administrators can read or write source verifications and audit logs
DROP POLICY IF EXISTS "Admins manage source verifications" ON public.source_verifications;
CREATE POLICY "Admins manage source verifications" ON public.source_verifications
  FOR ALL USING (public.is_verified_admin()) WITH CHECK (public.is_verified_admin());

DROP POLICY IF EXISTS "Admins view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins view audit logs" ON public.admin_audit_logs
  FOR SELECT USING (public.is_verified_admin());

DROP POLICY IF EXISTS "Admins insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins insert audit logs" ON public.admin_audit_logs
  FOR INSERT WITH CHECK (public.is_verified_admin());
