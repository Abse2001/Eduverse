import type { Class } from "./types"

export const CLASSES: Class[] = [
  {
    id: "c1",
    name: "Data Structures & Algorithms",
    code: "CS301",
    subject: "Computer Science",
    teacherId: "t1",
    color: "indigo",
    description:
      "An in-depth study of data structures, algorithmic design, and complexity analysis.",
    studentIds: ["u1", "u2", "u3", "u5"],
    schedule: "Mon & Wed, 10:00 – 11:30 AM",
    room: "Lab 4B",
    semester: "Spring 2026",
  },
  {
    id: "c2",
    name: "Web Development Bootcamp",
    code: "WD101",
    subject: "Software Engineering",
    teacherId: "t2",
    color: "emerald",
    description:
      "Full-stack web development from HTML/CSS to React and Node.js.",
    studentIds: ["u1", "u2", "u4", "u5"],
    schedule: "Tue & Thu, 1:00 – 2:30 PM",
    room: "Room 201",
    semester: "Spring 2026",
  },
  {
    id: "c3",
    name: "Machine Learning Fundamentals",
    code: "ML201",
    subject: "Artificial Intelligence",
    teacherId: "t1",
    color: "violet",
    description:
      "Core concepts of machine learning: regression, classification, neural networks.",
    studentIds: ["u1", "u3", "u4", "u5"],
    schedule: "Fri, 9:00 – 12:00 PM",
    room: "Lecture Hall A",
    semester: "Spring 2026",
  },
]
