export function invariant(message: string): never {
    throw new Error(message)
}
