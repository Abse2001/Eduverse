"use client"

import { useEffect, useState } from "react"
import type { Exam } from "@/lib/mock-data"

export function useExamSession(exam: Exam | undefined) {
  const [started, setStarted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | number>>({})
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    if (!exam) return
    setTimeLeft(exam.durationMinutes * 60)
  }, [exam])

  useEffect(() => {
    if (!started || submitted || timeLeft <= 0) return

    const timer = setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          clearInterval(timer)
          setSubmitted(true)
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [started, submitted, timeLeft])

  return {
    started,
    submitted,
    currentQuestionIndex,
    answers,
    timeLeft,
    startExam: () => setStarted(true),
    submitExam: () => setSubmitted(true),
    setCurrentQuestionIndex,
    setAnswer: (questionId: string, value: string | number) =>
      setAnswers((prev) => ({ ...prev, [questionId]: value })),
  }
}
