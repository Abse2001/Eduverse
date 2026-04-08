import type { Exam } from "./types"

export const EXAMS: Exam[] = [
  {
    id: "ex1",
    classId: "c1",
    title: "Midterm — Data Structures",
    durationMinutes: 60,
    totalPoints: 100,
    status: "upcoming",
    startTime: "2026-04-10T10:00:00Z",
    questions: [
      {
        id: "q1",
        type: "mcq",
        question: "What is the time complexity of searching in a balanced BST?",
        options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
        correctIndex: 1,
        points: 10,
      },
      {
        id: "q2",
        type: "mcq",
        question: "Which data structure uses LIFO ordering?",
        options: ["Queue", "Heap", "Stack", "Deque"],
        correctIndex: 2,
        points: 10,
      },
      {
        id: "q3",
        type: "short",
        question: "Explain the difference between BFS and DFS graph traversal.",
        points: 20,
      },
      {
        id: "q4",
        type: "code",
        question:
          "Write a function that reverses a singly linked list in O(n) time and O(1) space.",
        points: 30,
        language: "python",
        starterCode:
          "class Node:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\n\ndef reverse_list(head: Node) -> Node:\n    # Your solution here\n    pass\n",
      },
      {
        id: "q5",
        type: "mcq",
        question: "What is the worst-case space complexity of merge sort?",
        options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
        correctIndex: 2,
        points: 10,
      },
      {
        id: "q6",
        type: "short",
        question: "What is amortized analysis and when is it useful?",
        points: 20,
      },
    ],
  },
  {
    id: "ex2",
    classId: "c3",
    title: "ML Quiz — Regression & Classification",
    durationMinutes: 45,
    totalPoints: 80,
    status: "live",
    startTime: "2026-03-30T09:00:00Z",
    questions: [
      {
        id: "q7",
        type: "mcq",
        question:
          "Which loss function is typically used for linear regression?",
        options: [
          "Cross-entropy",
          "Mean Squared Error",
          "Hinge loss",
          "KL-divergence",
        ],
        correctIndex: 1,
        points: 10,
      },
      {
        id: "q8",
        type: "mcq",
        question: "What does the learning rate control in gradient descent?",
        options: [
          "Number of iterations",
          "Step size per update",
          "Model depth",
          "Regularization strength",
        ],
        correctIndex: 1,
        points: 10,
      },
      {
        id: "q9",
        type: "code",
        question: "Implement gradient descent for linear regression.",
        points: 30,
        language: "python",
        starterCode:
          "import numpy as np\n\ndef gradient_descent(X, y, lr=0.01, epochs=1000):\n    # Initialize weights\n    w = np.zeros(X.shape[1])\n    b = 0\n    # Your solution here\n    return w, b\n",
      },
      {
        id: "q10",
        type: "short",
        question: "Explain overfitting and describe two ways to prevent it.",
        points: 30,
      },
    ],
  },
]
