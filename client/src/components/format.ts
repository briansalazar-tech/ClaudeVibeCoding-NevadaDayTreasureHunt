const SQ_METERS_PER_SQ_MILE = 2_589_988.11;

export function squareMiles(squareMeters: number): string {
  const miles = squareMeters / SQ_METERS_PER_SQ_MILE;
  return `${miles.toLocaleString('en-US', { maximumFractionDigits: miles < 10 ? 1 : 0 })} sq mi`;
}
