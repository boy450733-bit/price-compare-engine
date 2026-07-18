// Fallback used when a store has no dedicated adapter yet.
// Returns nothing rather than guessing at HTML structure blindly.
export async function genericAdapter(query) {
  console.warn(`No adapter implemented for this store. Query was: "${query}"`);
  return [];
}
