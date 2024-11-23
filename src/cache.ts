/*  Implements momento pattern to save the state of caches, preserving their contents
    even when the player moves out of view and back
*/

interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}
export class Cache implements Momento<string> {
  i: number;
  j: number;
  numCoins: number;
  constructor(i: number, j: number, numCoins: number) {
    this.i = i;
    this.j = j;
    this.numCoins = numCoins;
  }
  toMomento(): string {
    return JSON.stringify({ i: this.i, j: this.j, numCoins: this.numCoins });
  }
  fromMomento(momento: string): void {
    const cache = JSON.parse(momento);
    this.i = parseInt(cache.i);
    this.j = parseInt(cache.j);
    this.numCoins = parseInt(cache.numCoins);
  }
}
