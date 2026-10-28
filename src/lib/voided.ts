/**
 * Wraps an async event handler so it can be passed where React expects a function returning nothing
 * (`onClick`, `onSubmit`, ...). The promise is deliberately not awaited: the handler is responsible
 * for catching its own errors.
 */
export function voided<Args extends unknown[]>(handler: (...args: Args) => unknown): (...args: Args) => void {
  return (...args) => {
    void handler(...args);
  };
}
