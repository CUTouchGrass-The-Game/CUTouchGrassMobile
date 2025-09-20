/**
 * Generates a unique ID for games
 * @param length - Length of the ID (default: 6)
 * @returns A random alphanumeric string
 */
export function generateId(length: number = 6): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
}
