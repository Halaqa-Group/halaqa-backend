/**
 * Marker class detected by ResponseInterceptor to hoist warnings to the top-level
 * envelope alongside data. Backward-compatible: only endpoints that explicitly
 * return this class produce a warnings array.
 */
export class DataWithWarnings<T> {
  constructor(
    readonly data: T,
    readonly warnings: string[],
  ) {}
}
