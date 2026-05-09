import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCaretDown, faCaretUp } from '@fortawesome/free-solid-svg-icons'

interface CustomScrollbarProps {
  targetRef: RefObject<HTMLElement>
  className?: string
}

interface ScrollbarMetrics {
  isScrollable: boolean
  thumbHeight: number
  thumbTop: number
}

const MIN_THUMB_HEIGHT = 28

export function CustomScrollbar({ targetRef, className = '' }: CustomScrollbarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = useState<ScrollbarMetrics>({
    isScrollable: false,
    thumbHeight: MIN_THUMB_HEIGHT,
    thumbTop: 0,
  })

  const updateMetrics = useCallback(() => {
    const target = targetRef.current
    const track = trackRef.current
    if (!target || !track) return

    const scrollRange = target.scrollHeight - target.clientHeight
    const trackHeight = track.clientHeight
    if (scrollRange <= 1 || trackHeight <= 0) {
      setMetrics((current) => current.isScrollable ? { ...current, isScrollable: false, thumbTop: 0 } : current)
      return
    }

    const thumbHeight = Math.max(MIN_THUMB_HEIGHT, (target.clientHeight / target.scrollHeight) * trackHeight)
    const thumbTravel = Math.max(0, trackHeight - thumbHeight)
    const thumbTop = (target.scrollTop / scrollRange) * thumbTravel

    setMetrics({
      isScrollable: true,
      thumbHeight,
      thumbTop,
    })
  }, [targetRef])

  useEffect(() => {
    const target = targetRef.current
    if (!target) return undefined

    let animationFrame: number | null = null
    const scheduleUpdate = () => {
      if (animationFrame !== null) return
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null
        updateMetrics()
      })
    }

    const resizeObserver = new ResizeObserver(scheduleUpdate)
    const mutationObserver = new MutationObserver(scheduleUpdate)
    resizeObserver.observe(target)
    if (target.firstElementChild) resizeObserver.observe(target.firstElementChild)
    mutationObserver.observe(target, { childList: true, subtree: true, characterData: true })

    target.addEventListener('scroll', scheduleUpdate, { passive: true })
    scheduleUpdate()

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      target.removeEventListener('scroll', scheduleUpdate)
    }
  }, [targetRef, updateMetrics])

  const scrollBy = (direction: -1 | 1) => {
    const target = targetRef.current
    if (!target) return
    target.scrollBy({ top: direction * Math.max(48, target.clientHeight * 0.35), behavior: 'smooth' })
  }

  const startThumbDrag = (pointerY: number) => {
    const target = targetRef.current
    const track = trackRef.current
    if (!target || !track) return

    const startScrollTop = target.scrollTop
    const scrollRange = target.scrollHeight - target.clientHeight
    const thumbTravel = Math.max(1, track.clientHeight - metrics.thumbHeight)

    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientY - pointerY
      target.scrollTop = startScrollTop + (delta / thumbTravel) * scrollRange
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div className={`custom-scrollbar${metrics.isScrollable ? ' custom-scrollbar-visible' : ''} ${className}`} aria-hidden="true">
      <button
        type="button"
        className="custom-scrollbar-button"
        tabIndex={-1}
        disabled={!metrics.isScrollable}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => scrollBy(-1)}
      >
        <FontAwesomeIcon icon={faCaretUp} />
      </button>
      <div ref={trackRef} className="custom-scrollbar-track">
        <button
          type="button"
          className="custom-scrollbar-thumb"
          tabIndex={-1}
          disabled={!metrics.isScrollable}
          style={{ height: metrics.thumbHeight, transform: `translateY(${metrics.thumbTop}px)` }}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            startThumbDrag(event.clientY)
          }}
        />
      </div>
      <button
        type="button"
        className="custom-scrollbar-button"
        tabIndex={-1}
        disabled={!metrics.isScrollable}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => scrollBy(1)}
      >
        <FontAwesomeIcon icon={faCaretDown} />
      </button>
    </div>
  )
}
