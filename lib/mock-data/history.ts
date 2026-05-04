import type { AcademicPeriodHistory, ClassHistoryRecord } from "./types"

export const STUDENT_PREVIOUS_ACADEMIC_PERIODS: AcademicPeriodHistory[] = [
  {
    id: "student-fall-2025",
    label: "Fall 2025",
    timeframe: "Previous period",
    classes: 4,
    avgScore: 89,
    gradedAssignments: 18,
    progress: 100,
    gpa: 3.8,
  },
  {
    id: "student-2024-2025",
    label: "2024-2025 Academic Year",
    timeframe: "Completed year",
    classes: 8,
    avgScore: 86,
    gradedAssignments: 42,
    progress: 100,
    gpa: 3.6,
  },
]

export const TEACHER_PREVIOUS_CLASSES: ClassHistoryRecord[] = [
  {
    id: "teacher-hist-cs201",
    name: "Algorithms Foundations",
    code: "CS201",
    subject: "Computer Science",
    teacherName: "Dr. Priya Nair",
    semester: "Fall 2025",
    students: 28,
    avgScore: 87,
    completion: 96,
    gradedAssignments: 64,
  },
  {
    id: "teacher-hist-cs210",
    name: "Systems Programming",
    code: "CS210",
    subject: "Computer Science",
    teacherName: "Dr. Priya Nair",
    semester: "Spring 2025",
    students: 24,
    avgScore: 84,
    completion: 93,
    gradedAssignments: 58,
  },
]

export const ORGANIZATION_CLASS_HISTORY: ClassHistoryRecord[] = [
  ...TEACHER_PREVIOUS_CLASSES,
  {
    id: "org-hist-wd100",
    name: "Frontend Fundamentals",
    code: "WD100",
    subject: "Web Development",
    teacherName: "Prof. Carlos Mendes",
    semester: "Fall 2025",
    students: 31,
    avgScore: 88,
    completion: 94,
    gradedAssignments: 72,
  },
  {
    id: "org-hist-ml110",
    name: "Data Science Studio",
    code: "ML110",
    subject: "Machine Learning",
    teacherName: "Dr. Elena Park",
    semester: "Spring 2025",
    students: 22,
    avgScore: 91,
    completion: 98,
    gradedAssignments: 49,
  },
]
