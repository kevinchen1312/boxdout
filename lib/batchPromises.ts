/**
 * Execute promises in batches to avoid overwhelming the system or hitting rate limits
 * @param items - Array of items to process
 * @param fn - Async function to run on each item
 * @param batchSize - Number of concurrent operations (default: 5)
 * @returns Array of results
 */
export async function batchPromises<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize: number = 5
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Execute promises in batches using Promise.allSettled for error resilience
 * @param items - Array of items to process
 * @param fn - Async function to run on each item
 * @param batchSize - Number of concurrent operations (default: 5)
 * @returns Array of settled results
 */
export async function batchPromisesSettled<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize: number = 5
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}







