// Entry module compiled to the deployed WebAssembly artifact. Deliberately
// trivial: it exists to prove the artifact pipeline (compile, deploy, fetch,
// instantiate) end to end while carrying no market-simulation logic.
export function add(a: i32, b: i32): i32 {
  return a + b;
}
