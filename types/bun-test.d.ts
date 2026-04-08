declare module "bun:test" {
  export function describe(name: string, fn: () => void): void
  export function test(name: string, fn: () => void | Promise<void>): void
  export function expect<T>(actual: T): {
    toEqual(expected: unknown): void
  }
}
