export type Listener = () => void;

/**
 * Store observable minimal, compatible `useSyncExternalStore` (React web et React Native)
 * sans dépendre de React : l'instantané ne change de référence que lorsqu'il change de valeur.
 */
export abstract class Observable<S> {
  private readonly listeners = new Set<Listener>();

  protected constructor(private snapshot: S) {}

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): S => this.snapshot;

  protected update(patch: Partial<S>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
}
