// Шина событий. Игровой движок публикует kill / hit / miss / level / gameover и т.д.;
// эффекты, HUD и (в будущем) звук подписываются независимо друг от друга.
export class EventBus {
  #handlers = new Map();

  on(type, fn) {
    let set = this.#handlers.get(type);
    if (!set) this.#handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.#handlers.get(type)?.delete(fn);
  }

  emit(type, payload) {
    this.#handlers.get(type)?.forEach((fn) => fn(payload));
  }
}

export const bus = new EventBus();
