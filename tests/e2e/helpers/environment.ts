export function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Required integration test input ${name} is unavailable.`);
  }
  return value;
}
