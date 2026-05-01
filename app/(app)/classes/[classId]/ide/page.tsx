"use client"

import { use, useState, useRef } from "react"
import {
  ClassFeatureDisabledFallback,
  ClassRouteFallback,
  useClassFeatureRoute,
} from "@/features/classes/use-class-route"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Play,
  Trash2,
  Copy,
  Download,
  RotateCcw,
  Settings2,
  ChevronDown,
  ChevronUp,
  Terminal,
  Code2,
  BookOpen,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

interface Language {
  id: string
  label: string
  monacoId: string
  defaultCode: string
}

const LANGUAGES: Language[] = [
  {
    id: "python",
    label: "Python 3",
    monacoId: "python",
    defaultCode: `# Python 3 - EduFlow IDE
def greet(name: str) -> str:
    return f"Hello, {name}!"

# Entry point
if __name__ == "__main__":
    message = greet("World")
    print(message)
    
    # Example: List comprehension
    squares = [x ** 2 for x in range(1, 11)]
    print("Squares:", squares)
`,
  },
  {
    id: "javascript",
    label: "JavaScript",
    monacoId: "javascript",
    defaultCode: `// JavaScript - EduFlow IDE

function greet(name) {
  return \`Hello, \${name}!\`;
}

// Entry point
const message = greet("World");
console.log(message);

// Example: Array methods
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
console.log("Doubled:", doubled);
`,
  },
  {
    id: "typescript",
    label: "TypeScript",
    monacoId: "typescript",
    defaultCode: `// TypeScript - EduFlow IDE

interface Greeting {
  message: string;
  timestamp: Date;
}

function greet(name: string): Greeting {
  return {
    message: \`Hello, \${name}!\`,
    timestamp: new Date(),
  };
}

const result = greet("World");
console.log(result.message);
console.log("Time:", result.timestamp.toISOString());
`,
  },
  {
    id: "java",
    label: "Java",
    monacoId: "java",
    defaultCode: `// Java - EduFlow IDE
public class Main {
    public static String greet(String name) {
        return "Hello, " + name + "!";
    }

    public static void main(String[] args) {
        String message = greet("World");
        System.out.println(message);
        
        // Example: Array
        int[] squares = new int[10];
        for (int i = 0; i < 10; i++) {
            squares[i] = (i + 1) * (i + 1);
        }
        System.out.print("Squares: ");
        for (int s : squares) System.out.print(s + " ");
    }
}
`,
  },
  {
    id: "cpp",
    label: "C++",
    monacoId: "cpp",
    defaultCode: `// C++ - EduFlow IDE
#include <iostream>
#include <vector>
#include <string>

std::string greet(const std::string& name) {
    return "Hello, " + name + "!";
}

int main() {
    std::string message = greet("World");
    std::cout << message << std::endl;
    
    // Example: Vector
    std::vector<int> squares;
    for (int i = 1; i <= 10; i++) {
        squares.push_back(i * i);
    }
    std::cout << "Squares: ";
    for (int s : squares) std::cout << s << " ";
    std::cout << std::endl;
    return 0;
}
`,
  },
]

// Simulated execution outputs
const MOCK_OUTPUT: Record<string, (code: string) => string> = {
  python: () =>
    `Hello, World!\nSquares: [1, 4, 9, 16, 25, 36, 49, 64, 81, 100]\n\nProcess finished with exit code 0`,
  javascript: () =>
    `Hello, World!\nDoubled: [\n  2, 4, 6, 8, 10\n]\n\nProcess exited with code 0`,
  typescript: () =>
    `Hello, World!\nTime: ${new Date().toISOString()}\n\nProcess exited with code 0`,
  java: () =>
    `Hello, World!\nSquares: 1 4 9 16 25 36 49 64 81 100 \n\nProcess exited with exit code 0`,
  cpp: () =>
    `Hello, World!\nSquares: 1 4 9 16 25 36 49 64 81 100 \n\nProcess exited with exit code 0`,
}

export default function IdePage({
  params,
}: {
  params: Promise<{ classId: string }>
}) {
  const { classId } = use(params)
  const { cls, isLoading, errorMessage, isFeatureDisabled } =
    useClassFeatureRoute(classId, "extensions.ide")

  const [lang, setLang] = useState<Language>(LANGUAGES[0])
  const [code, setCode] = useState(LANGUAGES[0].defaultCode)
  const [output, setOutput] = useState("")
  const [running, setRunning] = useState(false)
  const [outputOpen, setOutputOpen] = useState(true)
  const [theme, setTheme] = useState<"vs-dark" | "light">("vs-dark")
  const [fontSize, setFontSize] = useState(14)
  const runCount = useRef(0)

  const handleLangChange = (id: string) => {
    const l = LANGUAGES.find((l) => l.id === id)!
    setLang(l)
    setCode(l.defaultCode)
    setOutput("")
  }

  const handleRun = () => {
    setRunning(true)
    setOutputOpen(true)
    setOutput("")
    runCount.current++
    const count = runCount.current

    // Simulate execution delay
    const lines = (
      MOCK_OUTPUT[lang.id]?.(code) ?? "Process exited with code 0"
    ).split("\n")
    let i = 0
    const interval = setInterval(() => {
      if (count !== runCount.current) {
        clearInterval(interval)
        return
      }
      i++
      setOutput(lines.slice(0, i).join("\n"))
      if (i >= lines.length) {
        clearInterval(interval)
        setRunning(false)
      }
    }, 80)
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
  }

  const handleClear = () => {
    setCode(lang.defaultCode)
    setOutput("")
  }

  if (!cls) {
    return (
      <ClassRouteFallback isLoading={isLoading} errorMessage={errorMessage} />
    )
  }

  if (isFeatureDisabled) {
    return <ClassFeatureDisabledFallback classId={classId} featureLabel="IDE" />
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col h-full overflow-hidden bg-[#1e1e1e]">
        {/* IDE toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#2d2d2d] border-b border-[#3e3e3e] shrink-0">
          {/* Title */}
          <div className="flex items-center gap-2 mr-2">
            <Code2 className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-semibold text-white">
              {cls?.name ?? (isLoading ? "Loading class..." : "IDE")}
            </span>
            {cls && <span className="text-xs text-zinc-400">{cls.code}</span>}
          </div>

          <Separator orientation="vertical" className="h-5 bg-[#3e3e3e]" />

          {/* Language select */}
          <Select value={lang.id} onValueChange={handleLangChange}>
            <SelectTrigger className="h-7 w-36 bg-[#3c3c3c] border-[#555] text-white text-xs focus:ring-indigo-500">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#2d2d2d] border-[#3e3e3e]">
              {LANGUAGES.map((l) => (
                <SelectItem
                  key={l.id}
                  value={l.id}
                  className="text-white text-xs focus:bg-[#3e3e3e] focus:text-white"
                >
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Font size */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setFontSize((f) => Math.max(11, f - 1))}
              className="w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-[#3e3e3e] text-xs font-bold"
            >
              A
            </button>
            <button
              onClick={() => setFontSize((f) => Math.min(22, f + 1))}
              className="w-6 h-6 flex items-center justify-center rounded text-zinc-300 hover:text-white hover:bg-[#3e3e3e] font-bold text-sm"
            >
              A
            </button>
          </div>

          <button
            onClick={() =>
              setTheme((t) => (t === "vs-dark" ? "light" : "vs-dark"))
            }
            className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-[#3e3e3e] transition-colors"
          >
            {theme === "vs-dark" ? "Light" : "Dark"}
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCopy}
                  className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-[#3e3e3e] transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Copy code</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleClear}
                  className="h-7 w-7 flex items-center justify-center rounded text-zinc-400 hover:text-white hover:bg-[#3e3e3e] transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Reset to default</TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              className="h-7 px-3 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
              onClick={handleRun}
              disabled={running}
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {running ? "Running..." : "Run"}
            </Button>
          </div>
        </div>

        {/* Editor + Output */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Monaco Editor */}
          <div
            className={cn(
              "flex-1 overflow-hidden transition-all",
              !outputOpen && "flex-1",
            )}
          >
            <MonacoEditor
              height="100%"
              language={lang.monacoId}
              theme={theme}
              value={code}
              onChange={(val) => setCode(val ?? "")}
              options={{
                fontSize,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                wordWrap: "off",
                padding: { top: 16, bottom: 16 },
                fontFamily:
                  "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                fontLigatures: true,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                bracketPairColorization: { enabled: true },
                renderLineHighlight: "all",
                tabSize: lang.id === "python" ? 4 : 2,
              }}
            />
          </div>

          {/* Output terminal */}
          <div
            className={cn(
              "bg-[#1a1a1a] border-t border-[#3e3e3e] flex flex-col transition-all",
              outputOpen ? "h-52" : "h-9",
            )}
          >
            <button
              onClick={() => setOutputOpen(!outputOpen)}
              className="flex items-center gap-2 px-3 h-9 text-xs text-zinc-400 hover:text-white transition-colors w-full shrink-0 border-b border-[#2a2a2a]"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="font-semibold">Output</span>
              {running && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Running
                </span>
              )}
              <span className="ml-auto">
                {outputOpen ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </span>
            </button>
            {outputOpen && (
              <div className="flex-1 overflow-y-auto p-4">
                {output ? (
                  <pre className="text-xs font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {output}
                  </pre>
                ) : (
                  <p className="text-xs text-zinc-500">
                    {running
                      ? "Executing..."
                      : "Click Run to execute your code."}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
