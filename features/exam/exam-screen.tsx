"use client"

import { AlertCircle, ChevronLeft, ChevronRight, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Class, Exam } from "@/lib/mock-data"
import { ExamHeader } from "./exam-header"
import { ExamLobby } from "./exam-lobby"
import { ExamResults } from "./exam-results"
import { QuestionNavigator } from "./question-navigator"
import { QuestionView } from "./question-view"
import { useExamSession } from "./use-exam-session"

export function ExamScreen({ cls, exam }: { cls: Class; exam: Exam }) {
  const {
    started,
    submitted,
    currentQuestionIndex,
    answers,
    timeLeft,
    startExam,
    submitExam,
    setCurrentQuestionIndex,
    setAnswer,
  } = useExamSession(exam)

  if (submitted) {
    return <ExamResults exam={exam} answers={answers} />
  }

  if (!started) {
    return <ExamLobby exam={exam} cls={cls} onStart={startExam} />
  }

  const question = exam.questions[currentQuestionIndex]
  const answeredCount = Object.keys(answers).length
  const progress = Math.round((answeredCount / exam.questions.length) * 100)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <ExamHeader
        exam={exam}
        cls={cls}
        answeredCount={answeredCount}
        progress={progress}
        timeLeft={timeLeft}
        onSubmit={submitExam}
      />

      <div className="flex flex-1 overflow-hidden">
        <QuestionNavigator
          exam={exam}
          currentQuestionIndex={currentQuestionIndex}
          answers={answers}
          onSelectQuestion={setCurrentQuestionIndex}
        />

        <div className="flex-1 overflow-y-auto p-6">
          <QuestionView
            question={question}
            index={currentQuestionIndex}
            totalQuestions={exam.questions.length}
            answer={answers[question.id]}
            onAnswer={(value) => setAnswer(question.id, value)}
          />
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={currentQuestionIndex === 0}
              onClick={() =>
                setCurrentQuestionIndex((currentQuestionIndex ?? 0) - 1)
              }
              className="gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            {currentQuestionIndex < exam.questions.length - 1 ? (
              <Button
                size="sm"
                onClick={() =>
                  setCurrentQuestionIndex(currentQuestionIndex + 1)
                }
                className="gap-1.5"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="sm" className="gap-1.5" onClick={submitExam}>
                <Send className="w-3.5 h-3.5" />
                Submit
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function NoExamState() {
  return (
    <div className="p-6 flex flex-col items-center justify-center gap-3 text-center">
      <AlertCircle className="w-10 h-10 text-muted-foreground" />
      <p className="text-lg font-semibold text-foreground">No exam available</p>
      <p className="text-sm text-muted-foreground">
        There is no active exam for this class.
      </p>
    </div>
  )
}
