type Listener<T> = (value: T) => void;

export class TypedEmitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(name: K, listener: Listener<Events[K]>): () => void {
    const current = this.listeners.get(name) ?? new Set<Listener<never>>();
    current.add(listener as Listener<never>);
    this.listeners.set(name, current);
    return () => this.off(name, listener);
  }

  off<K extends keyof Events>(name: K, listener: Listener<Events[K]>): void {
    const current = this.listeners.get(name);
    current?.delete(listener as Listener<never>);
    if (current?.size === 0) this.listeners.delete(name);
  }

  emit<K extends keyof Events>(name: K, value: Events[K]): void {
    for (const listener of this.listeners.get(name) ?? []) {
      (listener as Listener<Events[K]>)(value);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
