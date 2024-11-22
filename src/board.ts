import leaflet from "leaflet";

interface Cell {
  readonly i: number;
  readonly j: number;
}

export class Board {
  readonly tileWidth: number;
  readonly tileVisibilityRadius: number;
  private readonly knownCells: Map<string, Cell>;

  constructor(tileWidth: number, tileVisibilityRadius: number) {
    this.tileWidth = tileWidth;
    this.tileVisibilityRadius = tileVisibilityRadius;
    this.knownCells = new Map();
  }

  // Updated to accept coordinates (i, j) directly
  private getCanonicalCell(i: number, j: number): Cell {
    const key = `${i},${j}`; // Create a unique key based on the coordinates
    if (!this.knownCells.has(key)) {
      // Create and store a new Cell only if it doesn't already exist
      const cell = { i, j };
      this.knownCells.set(key, cell);
    }
    return this.knownCells.get(key)!;
  }

  // Updated to pass i and j directly
  getCellForPoint(point: leaflet.LatLng): Cell {
    const i = Math.floor(point.lat);
    const j = Math.floor(point.lng);
    return this.getCanonicalCell(i, j);
  }

  getCellBounds(cell: Cell): leaflet.LatLngBounds {
    const bounds = leaflet.latLngBounds([
      [
        cell.i * this.tileWidth,
        cell.j * this.tileWidth,
      ],
      [
        (cell.i + 1) * this.tileWidth,
        (cell.j + 1) * this.tileWidth,
      ],
    ]);
    return bounds;
  }

  getCellsNearPoint(point: leaflet.LatLng): Cell[] {
    const resultCells: Cell[] = [];
    const originCell = this.getCellForPoint(point);
    for (let i = 0; i < this.knownCells.size; i++) {
      for (let j = 0; j < this.knownCells.size; j++) {
        const tempCell = this.getCanonicalCell(i, j); // Use coordinates directly
        const distance = Math.sqrt(
          Math.pow(tempCell.i - originCell.i, 2) +
            Math.pow(tempCell.j - originCell.j, 2),
        );
        if (distance <= this.tileVisibilityRadius) {
          resultCells.push(tempCell);
        }
      }
    }
    return resultCells;
  }
}
