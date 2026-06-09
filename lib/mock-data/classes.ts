import type { Class } from "./types"

export const CLASSES: Class[] = [
  {
    id: "c1",
    name: "Data Structures & Algorithms",
    code: "CS301",
    teacherId: "t1",
    color: "indigo",
    description:
      "An in-depth study of data structures, algorithmic design, and complexity analysis.",
    studentIds: ["u1", "u2", "u3", "u5"],
    room: "Lab 4B",
    semester: "Spring 2026",
  },
  {
    id: "c2",
    name: "Web Development Bootcamp",
    code: "WD101",
    teacherId: "t2",
    color: "emerald",
    description:
      "Full-stack web development from HTML/CSS to React and Node.js.",
    studentIds: ["u1", "u2", "u4", "u5"],
    room: "Room 201",
    semester: "Spring 2026",
  },
  {
    id: "c3",
    name: "Machine Learning Fundamentals",
    code: "ML201",
    teacherId: "t1",
    color: "violet",
    description:
      "Core concepts of machine learning: regression, classification, neural networks.",
    studentIds: ["u1", "u3", "u4", "u5"],
    room: "Lecture Hall A",
    semester: "Spring 2026",
  },
]
