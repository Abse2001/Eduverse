"use client"

import { useEffect, useRef } from "react"
import { Track } from "livekit-client"
import type { TrackPublication } from "livekit-client"
import { cn } from "@/lib/utils"

export function VideoTrackView({
  publication,
  className,
  muted = false,
  onDimensionsChange,
}: {
  publication?: TrackPublication
  className?: string
  muted?: boolean
  onDimensionsChange?: (dimensions: { width: number; height: number }) => void
}) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const element = ref.current
    const track = publication?.track

    if (!element || !track || track.kind !== Track.Kind.Video) {
      return
    }

    track.attach(element)

    const reportDimensions = () => {
      if (element.videoWidth > 0 && element.videoHeight > 0) {
        onDimensionsChange?.({
          width: element.videoWidth,
          height: element.videoHeight,
        })
      }
    }

    element.addEventListener("loadedmetadata", reportDimensions)
    element.addEventListener("resize", reportDimensions)
    reportDimensions()

    return () => {
      element.removeEventListener("loadedmetadata", reportDimensions)
      element.removeEventListener("resize", reportDimensions)
      track.detach(element)
    }
  }, [
    onDimensionsChange,
    publication,
    publication?.track,
    publication?.trackSid,
  ])

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn("h-full w-full bg-black object-cover", className)}
    />
  )
}

export function AudioTrackPlayer({
  publication,
}: {
  publication: TrackPublication
}) {
  const ref = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const element = ref.current
    const track = publication.track

    if (!element || !track || track.kind !== Track.Kind.Audio) {
      return
    }

    track.attach(element)

    return () => {
      track.detach(element)
    }
  }, [publication, publication.track, publication.trackSid])

  return <audio ref={ref} autoPlay playsInline hidden />
}
