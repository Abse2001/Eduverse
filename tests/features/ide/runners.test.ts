import { describe, expect, test } from "bun:test"
import { runCodeFile } from "@/features/ide/runners"
import type { Workspace } from "@/features/ide/types"

describe("IDE language runners", () => {
  test("runs classroom Python snippets", () => {
    const workspace: Workspace = {
      "/": { kind: "directory" },
      "/main.py": {
        kind: "file",
        content: `def greet(name):
    return f"Hello, {name}!"


if __name__ == "__main__":
    print(greet("Eduverse"))
    squares = [number * number for number in range(1, 6)]
    print("Squares:", squares)
`,
      },
    }

    expect(
      runCodeFile(workspace, "/main.py")[0].text.includes(
        "Squares: [1, 4, 9, 16, 25]",
      ),
    ).toEqual(true)
  })

  test("runs C printf output", () => {
    const workspace: Workspace = {
      "/": { kind: "directory" },
      "/main.c": {
        kind: "file",
        content: `#include <stdio.h>

int main(void) {
  printf("Hello, Eduverse!\\n");
  return 0;
}
`,
      },
    }

    expect(
      runCodeFile(workspace, "/main.c")[0].text.includes("Hello, Eduverse!"),
    ).toEqual(true)
  })

  test("runs C++ cout output", () => {
    const workspace: Workspace = {
      "/": { kind: "directory" },
      "/main.cpp": {
        kind: "file",
        content: `#include <iostream>
using namespace std;

int main() {
  cout << "Hello, Eduverse!" << endl;
  return 0;
}
`,
      },
    }

    expect(
      runCodeFile(workspace, "/main.cpp")[0].text.includes("Hello, Eduverse!"),
    ).toEqual(true)
  })

  test("runs SQL create insert select snippets", () => {
    const workspace: Workspace = {
      "/": { kind: "directory" },
      "/query.sql": {
        kind: "file",
        content: `CREATE TABLE students (
  id INTEGER,
  name TEXT,
  grade INTEGER
);

INSERT INTO students VALUES (1, 'Anas', 95);
SELECT id, name, grade FROM students;
`,
      },
    }

    expect(
      runCodeFile(workspace, "/query.sql")[0].text.includes("1 | Anas | 95"),
    ).toEqual(true)
  })
})
