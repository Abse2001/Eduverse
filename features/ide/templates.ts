import type { ProjectTemplate, TerminalLine } from "@/features/ide/types"

export const SUPPORTED_LANGUAGES = [
  "HTML",
  "CSS",
  "JavaScript",
  "TypeScript",
  "Markdown",
  "JSON",
  "Python",
  "SQL",
  "C",
]

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "web",
    label: "Web Starter",
    description: "HTML, CSS, and JavaScript with live preview.",
    entryFile: "/index.html",
    files: {
      "/": { kind: "directory" },
      "/index.html": {
        kind: "file",
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Eduverse Project</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="shell">
      <p class="eyebrow">Eduverse IDE</p>
      <h1>Hello from the browser</h1>
      <p>Use the file tree, edit code, then run or preview your work.</p>
      <button id="action">Click me</button>
    </main>
    <script src="./script.js"></script>
  </body>
</html>
`,
      },
      "/styles.css": {
        kind: "file",
        content: `body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f6f8fb;
  color: #162033;
  font-family: Inter, system-ui, sans-serif;
}

.shell {
  width: min(560px, calc(100vw - 32px));
  padding: 32px;
  border: 1px solid #d9e0ec;
  border-radius: 8px;
  background: white;
  box-shadow: 0 18px 45px rgba(22, 32, 51, 0.08);
}

.eyebrow {
  margin: 0 0 8px;
  color: #4f46e5;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

h1 {
  margin: 0 0 12px;
  font-size: 34px;
  line-height: 1.1;
}

button {
  margin-top: 18px;
  border: 0;
  border-radius: 6px;
  background: #4f46e5;
  color: white;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}
`,
      },
      "/script.js": {
        kind: "file",
        content: `const action = document.querySelector("#action");

action?.addEventListener("click", () => {
  action.textContent = "Nice work!";
  console.log("The page is interactive.");
});
`,
      },
      "/README.md": {
        kind: "file",
        content:
          "# Web Starter\n\nEdit `index.html`, `styles.css`, and `script.js`, then use `preview` or the Preview panel.\n",
      },
    },
  },
  {
    id: "python",
    label: "Python Practice",
    description: "Python syntax with browser-safe terminal guidance.",
    entryFile: "/main.py",
    files: {
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
      "/README.md": {
        kind: "file",
        content:
          "# Python Practice\n\nPython editing is ready. Real execution needs Pyodide or a backend sandbox.\n",
      },
    },
  },
  {
    id: "c",
    label: "C Starter",
    description: "C syntax and project structure for future sandbox runs.",
    entryFile: "/main.c",
    files: {
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
      "/README.md": {
        kind: "file",
        content:
          "# C Starter\n\nC can be edited here. Compiling with `gcc main.c -o main` needs a secure backend sandbox.\n",
      },
    },
  },
]

export const INITIAL_TERMINAL: TerminalLine[] = [
  {
    id: 1,
    kind: "success",
    text: "Eduverse virtual terminal ready. Type `help` to see commands.",
  },
]
