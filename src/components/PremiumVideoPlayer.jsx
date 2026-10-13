import { useEffect, useState } from 'react'
import { sanitizeSupabaseErrorText, supabase } from '../lib/supabase.js'
import './PremiumVideoPlayer.css'

function getErrorMessage(error) {
  return sanitizeSupabaseErrorText(
    error instanceof Error ? error.message : error?.message || 'An unexpected error occurred.',
  )
}

function LoadingState() {
  return (
    <div
      aria-label="Loading video"
      className="flex min-h-72 items-center justify-center rounded-2xl border border-white/10 bg-[#100d19] text-violet-200"
      role="status"
    >
      <span className="mr-3 size-5 animate-spin rounded-full border-2 border-violet-200/30 border-t-violet-200" />
      <span className="text-sm text-violet-100/75">Preparing your screening room…</span>
    </div>
  )
}

function UpgradeOverlay({ title, thumbnailUrl, onUpgrade }) {
  return (
    <section
      aria-labelledby="premium-upgrade-title"
      className="relative flex min-h-[24rem] items-center justify-center overflow-hidden rounded-2xl border border-violet-200/15 bg-[#100d19] px-6 py-12 text-center text-violet-50 shadow-2xl shadow-violet-950/30 sm:min-h-[32rem]"
    >
      {thumbnailUrl && (
        <img
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover opacity-30"
          src={thumbnailUrl}
        />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-[#100d19]/90 via-[#100d19]/80 to-violet-950/80" />
      <div className="relative z-10 max-w-xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-violet-200/20 bg-violet-200/10 px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-violet-200">
          <span aria-hidden="true">✦</span>
          Astra Premium
        </span>
        <h2 className="mt-6 font-serif text-4xl leading-tight text-white sm:text-5xl" id="premium-upgrade-title">
          Premium Upgrade Required
        </h2>
        <p className="mt-4 text-base leading-7 text-violet-100/70">
          {title
            ? `Unlock ${title} and explore the full Astra collection with a Premium membership.`
            : 'Unlock this story and explore the full Astra collection with a Premium membership.'}
        </p>
        <button
          className="mt-8 rounded-full bg-gradient-to-r from-violet-300 to-fuchsia-300 px-7 py-3 text-sm font-semibold text-[#21152f] shadow-lg shadow-violet-950/30 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-100"
          onClick={onUpgrade}
          type="button"
        >
          Upgrade Now
        </button>
      </div>
    </section>
  )
}

export default function PremiumVideoPlayer({ videoId, title, onUpgrade }) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ status: 'loading' })

  useEffect(() => {
    let active = true

    async function loadVideo() {
      setResult({ status: 'loading' })

      if (!videoId) {
        setResult({ status: 'error', message: 'A video ID is required.' })
        return
      }

      if (!supabase) {
        setResult({
          status: 'error',
          message: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then restart or redeploy the app.',
        })
        return
      }

      try {
        const [screeningResponse, authResponse] = await Promise.all([
          supabase.rpc('get_video_screening_meta', { p_video_id: videoId }),
          supabase.auth.getUser(),
        ])

        if (screeningResponse.error) throw screeningResponse.error
        if (authResponse.error) throw authResponse.error

        let subscriptionTier = 'free'
        const user = authResponse.data.user

        if (user) {
          const profileResponse = await supabase
            .from('profiles')
            .select('subscription_tier')
            .eq('id', user.id)
            .maybeSingle()

          if (profileResponse.error) throw profileResponse.error
          subscriptionTier = profileResponse.data?.subscription_tier ?? 'free'
        }

        const screeningMeta = Array.isArray(screeningResponse.data)
          ? screeningResponse.data[0]
          : screeningResponse.data

        if (!screeningMeta || typeof screeningMeta.is_accessible !== 'boolean') {
          throw new Error('The screening access check returned an invalid response.')
        }

        if (!screeningMeta.is_accessible) {
          if (active) {
            setResult(
              subscriptionTier === 'premium'
                ? {
                    status: 'not-found',
                    message: 'This video is unavailable or your account does not have access.',
                  }
                : { status: 'upgrade', title },
            )
          }
          return
        }

        const videoResponse = await supabase
          .from('videos')
          .select('id, title, description, thumbnail_url, video_url, is_premium')
          .eq('id', videoId)
          .maybeSingle()

        if (videoResponse.error) throw videoResponse.error

        const video = videoResponse.data
        if (!video) {
          if (active) {
            setResult({
              status: 'not-found',
              message: 'This video is unavailable or you do not have permission to view it.',
            })
          }
          return
        }

        if (active) {
          setResult({ status: 'ready', video, subscriptionTier })
        }
      } catch (error) {
        if (active) {
          setResult({ status: 'error', message: getErrorMessage(error) })
        }
      }
    }

    loadVideo()

    return () => {
      active = false
    }
  }, [attempt, title, videoId])

  if (result.status === 'loading') return <LoadingState />

  if (result.status === 'upgrade') {
    return <UpgradeOverlay onUpgrade={onUpgrade} title={result.title} />
  }

  if (result.status === 'error' || result.status === 'not-found') {
    return (
      <section
        aria-live="polite"
        className="rounded-2xl border border-white/10 bg-[#100d19] px-6 py-12 text-center text-violet-50"
        role={result.status === 'error' ? 'alert' : 'status'}
      >
        <p className="font-serif text-2xl">
          {result.status === 'error' ? 'We couldn’t load this video' : 'Screening unavailable'}
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-violet-100/65">{result.message}</p>
        {result.status === 'error' && (
          <button
            className="mt-6 rounded-full border border-violet-200/40 px-5 py-2 text-sm font-medium text-violet-100 transition hover:border-violet-100 hover:bg-violet-100/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-200"
            onClick={() => setAttempt((currentAttempt) => currentAttempt + 1)}
            type="button"
          >
            Try again
          </button>
        )}
      </section>
    )
  }

  const { video, subscriptionTier } = result
  const requiresUpgrade = video.is_premium && subscriptionTier !== 'premium'

  if (requiresUpgrade) {
    return <UpgradeOverlay onUpgrade={onUpgrade} thumbnailUrl={video.thumbnail_url} title={video.title} />
  }

  return (
    <section aria-label={video.title} className="overflow-hidden rounded-2xl border border-white/10 bg-[#100d19] shadow-2xl shadow-violet-950/20">
      <video
        className="aspect-video w-full bg-black object-contain"
        controls
        playsInline
        poster={video.thumbnail_url || undefined}
        src={video.video_url}
      >
        Your browser does not support HTML5 video.
      </video>
      <div className="px-5 py-4 sm:px-7">
        <h2 className="font-serif text-xl text-violet-50">{video.title}</h2>
        {video.description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-violet-100/65">{video.description}</p>
        )}
      </div>
    </section>
  )
}
