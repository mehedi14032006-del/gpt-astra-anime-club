import { useEffect, useRef, useState } from 'react'

const starCount = 80

export default function CosmicIntro({ onComplete }) {
  const canvasRef = useRef(null)
  const skipButtonRef = useRef(null)
  const completedRef = useRef(false)
  const animationFrameRef = useRef(null)
  const finishIntroRef = useRef(null)
  const timersRef = useRef([])
  const [phase, setPhase] = useState('entering')

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')

    if (!canvas || !context) {
      throw new Error('Cosmic intro could not initialize its canvas.')
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) {
      onComplete?.()
      return undefined
    }

    const previouslyFocused = document.activeElement
    skipButtonRef.current?.focus()
    let width = window.innerWidth
    let height = window.innerHeight
    let pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.2 + 0.8,
      speedX: (Math.random() - 0.5) * 0.4,
      speedY: (Math.random() - 0.5) * 0.4,
      opacity: Math.random() * 0.8 + 0.2,
    }))

    const resizeCanvas = () => {
      width = window.innerWidth
      height = window.innerHeight
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * pixelRatio
      canvas.height = height * pixelRatio
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }

    const render = () => {
      context.clearRect(0, 0, width, height)
      stars.forEach((star) => {
        star.x += star.speedX
        star.y += star.speedY

        if (star.x < 0) star.x = width
        if (star.x > width) star.x = 0
        if (star.y < 0) star.y = height
        if (star.y > height) star.y = 0

        context.beginPath()
        context.arc(star.x, star.y, star.size, 0, Math.PI * 2)
        context.fillStyle = `rgba(192, 132, 252, ${star.opacity})`
        context.shadowBlur = 8
        context.shadowColor = '#a855f7'
        context.fill()
      })

      animationFrameRef.current = window.requestAnimationFrame(render)
    }

    const finishIntro = () => {
      if (completedRef.current) return
      completedRef.current = true
      timersRef.current.forEach(window.clearTimeout)
      timersRef.current = []
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      setPhase('done')
      onComplete?.()
    }
    finishIntroRef.current = finishIntro

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    render()

    timersRef.current = [
      window.setTimeout(() => setPhase('illuminating'), 800),
      window.setTimeout(() => setPhase('exiting'), 2400),
      window.setTimeout(finishIntro, 3100),
    ]

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      timersRef.current.forEach(window.clearTimeout)
      finishIntroRef.current = null
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus()
      }
    }
  }, [onComplete])

  if (phase === 'done') return null

  const illuminated = phase === 'illuminating' || phase === 'exiting'

  return (
    <div
      aria-label="Astra Anime Club introduction"
      className={`cosmic-intro${phase === 'exiting' ? ' cosmic-intro--exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          finishIntroRef.current?.()
        } else if (event.key === 'Tab') {
          event.preventDefault()
          skipButtonRef.current?.focus()
        }
      }}
    >
      <canvas aria-hidden="true" className="cosmic-intro__canvas" ref={canvasRef} />
      <div aria-hidden="true" className="cosmic-intro__glow" />
      <div className="cosmic-intro__content">
        <div className={`cosmic-intro__emblem${illuminated ? ' is-visible' : ''}`}>
          <div className="cosmic-intro__emblem-inner">
            <span>✦</span>
          </div>
        </div>
        <h1 className={`cosmic-intro__title${illuminated ? ' is-visible' : ''}`}>
          Astra <span>Anime</span>
        </h1>
        <p className={`cosmic-intro__subtitle${illuminated ? ' is-visible' : ''}`}>
          Entering The Cosmos
        </p>
        <button className="cosmic-intro__skip" onClick={() => finishIntroRef.current?.()} ref={skipButtonRef} type="button">
          Skip Intro
        </button>
      </div>
    </div>
  )
}
