// main.ts

// Add listener for saving the game state before the page is unloaded (tab closed or navigation).
globalThis.addEventListener("beforeunload", () => {
  saveGame();
});

// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// File to apply flyweight pattern to grid cells
import { Board } from "./board.ts";

// File to apply Momento pattern to caches
import { Cache } from "./cache.ts";

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Implement board
const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Create the map with leaflet
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Set up coins
interface Coin {
  i: number;
  j: number;
  serial: number | null;
  i_current: number;
  j_current: number;
}

let CoinsArray: Coin[] = [];
let PlayerCoins: Coin[] = [];

// Initialize latest coin
let lastCoin: Coin = {
  i: 0,
  j: 0,
  serial: 0,
  i_current: 0,
  j_current: 0,
};

// Set up cache array
let CacheArray: Cache[] = [];

// Hold cache state with momento
let MomentoArray: string[] = [];

// Display coins in status panel
const coinCountDisplay = document.querySelector<HTMLDivElement>(
  "#statusPanel",
)!;
//coinCountDisplay.innerHTML = "Coins: 0";
/*coinCountDisplay.innerHTML =
          `Coins: ${PlayerCoins.length}  |  Recent Coin ID: (${
            (lastCoin.i * TILE_DEGREES).toFixed(4)
          }, ${(lastCoin.j * TILE_DEGREES).toFixed(4)}) #${lastCoin.serial}`;
*/
// Set up initial player marker location
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("You are here!");
playerMarker.addTo(map);

// Set up buttons for player movement
const sensorButton = document.querySelector<HTMLButtonElement>("#sensor");
const resetButton = document.querySelector<HTMLButtonElement>("#reset");

const directionButtons = {
  north: document.querySelector<HTMLButtonElement>("#north"),
  south: document.querySelector<HTMLButtonElement>("#south"),
  west: document.querySelector<HTMLButtonElement>("#west"),
  east: document.querySelector<HTMLButtonElement>("#east"),
};

// Sensor Button (Ask user for current location)
sensorButton?.addEventListener("click", () => {
  map.stopLocate();
  map.locate({ watch: true, setView: true });
});

// Reset Button
resetButton?.addEventListener("click", () => {
  resetGame();
});

// Directional Buttons (Move Player)
Object.keys(directionButtons).forEach((direction) => {
  const button = directionButtons[direction as keyof typeof directionButtons];
  button?.addEventListener("click", () => {
    playerMove(direction);
  });
});

// Initialize the path array to hold line segments
let pathSegments: leaflet.LatLng[] = [];

// Function to move player
function playerMove(direction: string) {
  const tempPosition = playerMarker.getLatLng();
  const previousPosition = leaflet.latLng(tempPosition.lat, tempPosition.lng); // Store the previous position

  switch (direction) {
    case "north":
      tempPosition.lat += TILE_DEGREES;
      break;
    case "south":
      tempPosition.lat -= TILE_DEGREES;
      break;
    case "west":
      tempPosition.lng -= TILE_DEGREES;
      break;
    case "east":
      tempPosition.lng += TILE_DEGREES;
      break;
  }

  clearCaches();
  playerMarker.setLatLng(tempPosition);
  generateCaches();
  renderPath(previousPosition, tempPosition); // Pass previous and current positions
  map.panTo(playerMarker.getLatLng());
  saveGame();
}

// Function stores player's location and draws a polyline representing the player's path
function renderPath(
  previousPosition: leaflet.LatLng,
  currentPosition: leaflet.LatLng,
) {
  // Create a new line segment from the previous position to the current position
  pathSegments.push(currentPosition); // Add current position to path segments

  // Draw a polyline if the player has moved more than one step
  if (pathSegments.length >= 1) {
    const line = leaflet.polyline([previousPosition, currentPosition], {
      color: "green",
    });
    line.addTo(map);
  }
}

// Function is triggered when the player's current location is found
function getCurrentLocation(e: { latlng: leaflet.LatLngExpression }) {
  playerMarker.setLatLng(e.latlng);
  playerMarker.addTo(map).bindPopup("Current Location Found!").openPopup();

  clearCaches();
  generateCaches();
  saveGame();
}

// Attach the location found event to the map to trigger getCurrentLocation
map.on("locationfound", getCurrentLocation);

// Function adds caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  // Convert cell numbers into lat/lng bounds
  const i_coordinate = i * TILE_DEGREES;
  const j_coordinate = j * TILE_DEGREES;

  const point = leaflet.latLng(i_coordinate, j_coordinate);
  const pointCell = board.getCellForPoint(point);
  const bounds = board.getCellBounds(pointCell);

  const newCache = new Cache(i, j, 0);

  // Each cache has a random point value, mutable by the player
  const coinValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);

  newCache.numCoins = coinValue;
  CacheArray.push(newCache);

  // Attempt to find an existing "momento" in the MomentoArray that matches the current indices (i, j)
  const momentoFound = MomentoArray.find((momento) => {
    const tempCache = new Cache(0, 0, 0);
    tempCache.fromMomento(momento);
    return tempCache.i == i && tempCache.j == j;
  });

  // If a matching momento is found, update the newCache with data from the found momento
  if (momentoFound) {
    newCache.fromMomento(momentoFound);
  } else {
    // If no matching momento is found, proceed to add new coins
    for (let x = 0; x < newCache.numCoins; x++) {
      const newCoin: Coin = {
        i: i,
        j: j,
        serial: x,
        i_current: i,
        j_current: j,
      };

      // Check if the new coin already exists in the CoinsArray
      const coinExists = CoinsArray.some((coin) => {
        return coin == newCoin;
      });

      // If the coin doesn't exist in the array, add it to the CoinsArray
      if (!coinExists) {
        CoinsArray.push(newCoin);
      }
    }
  }

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // Set up pop-ups for cache rectangles to handle interactions with the cache
  rect.bindPopup(() => {
    // The popup offers a description and buttons
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>
        Cache Location: "${i_coordinate.toFixed(4)}, ${
      j_coordinate.toFixed(4)
    }" Available coins: <span id="value">${newCache.numCoins}</span>
      </div>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>
    `;

    // Clicking the button decrements the cache's value and increments the player's coins
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        // Check if cache has any coins left
        if (newCache.numCoins <= 0) {
          alert("No more coins to collect from this cache!");
          return; // Prevent collection if cache has no coins
        }

        // Find the coin in the CoinsArray
        const coinIndex = CoinsArray.findIndex((coin) =>
          coin.i_current === i && coin.j_current === j
        );

        if (coinIndex !== -1) {
          // Set lastCoin if the coin is found
          lastCoin = CoinsArray[coinIndex];

          // Update cache and player coin collection
          newCache.numCoins--;
          PlayerCoins.push(lastCoin);

          // Remove the coin from the array
          CoinsArray.splice(coinIndex, 1);

          // Create the updated cache after collecting a coin
          const updatedCache = new Cache(
            newCache.i,
            newCache.j,
            newCache.numCoins,
          );

          // Update the cache state using the 'toMomento' and 'fromMomento' methods
          updatedCache.fromMomento(newCache.toMomento()); // This ensures the cache is updated based on its current state

          // Find if a cache exists in MomentoArray and replace it, or add it if not found
          const cacheIndex = MomentoArray.findIndex(
            (momento) =>
              newCache.i === JSON.parse(momento).i &&
              newCache.j === JSON.parse(momento).j,
          );

          if (cacheIndex !== -1) {
            // Update the existing cache in MomentoArray
            MomentoArray[cacheIndex] = updatedCache.toMomento();
          } else {
            // Add the new cache if not already in MomentoArray
            MomentoArray.push(updatedCache.toMomento());
          }
        }

        // Update coin display
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = newCache
          .numCoins.toString();
        coinCountDisplay.innerHTML =
          `Coins: ${PlayerCoins.length}  |  Recent Coin ID: (${
            (lastCoin.i * TILE_DEGREES).toFixed(4)
          }, ${(lastCoin.j * TILE_DEGREES).toFixed(4)}) #${lastCoin.serial}`;
      });

    // Clicking the button increments the cache's value and decrements the player's coins
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        // Check if player has any coins left
        if (PlayerCoins.length <= 0) {
          alert("No more coins to deposit!");
          return; // Prevent deposit if player has no coins
        }
        if (PlayerCoins.length > 0) {
          newCache.numCoins++;

          let hasDeposited = false;

          for (let x = 0; x < PlayerCoins.length; x++) {
            if (!hasDeposited) {
              lastCoin = PlayerCoins[x];
              CoinsArray.push(PlayerCoins[x]);
              PlayerCoins.splice(x, 1);
              hasDeposited = true;
              lastCoin.i_current = i;
              lastCoin.j_current = j;
            }
          }

          // Create the updated cache after depositing a coin
          const updatedCache = new Cache(
            newCache.i,
            newCache.j,
            newCache.numCoins,
          );

          // Update the cache state using the 'toMomento' and 'fromMomento' methods
          updatedCache.fromMomento(newCache.toMomento()); // Ensure the cache reflects the new state

          // Find if a cache exists in MomentoArray and replace it, or add it if not found
          const cacheIndex = MomentoArray.findIndex(
            (momento) =>
              newCache.i === JSON.parse(momento).i &&
              newCache.j === JSON.parse(momento).j,
          );

          if (cacheIndex !== -1) {
            // Update the existing cache in MomentoArray
            MomentoArray[cacheIndex] = updatedCache.toMomento();
          } else {
            // Add the new cache if not already in MomentoArray
            MomentoArray.push(updatedCache.toMomento());
          }
        }

        // Update coin display
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = newCache
          .numCoins
          .toString();
        coinCountDisplay.innerHTML =
          `Coins: ${PlayerCoins.length}  |  Recent Coin ID: (${
            (lastCoin.i * TILE_DEGREES).toFixed(4)
          }, ${(lastCoin.j * TILE_DEGREES).toFixed(4)}) #${lastCoin.serial}`;
      });

    return popupDiv;
  });
}

// Function to generate random caches
function generateCaches() {
  const cells = board.getCellsNearPoint(playerMarker.getLatLng());

  cells.forEach((cell) => {
    const cacheRandom =
      luck([cell.i, cell.j].toString()) < CACHE_SPAWN_PROBABILITY;

    if (cacheRandom) {
      spawnCache(cell.i, cell.j);
    }
  });
}

// Function to clear caches
function clearCaches() {
  map.eachLayer((layer) => {
    if (layer instanceof leaflet.Rectangle) {
      map.removeLayer(layer);
    }
  });

  const cells = board.getCellsNearPoint(playerMarker.getLatLng());

  cells.forEach((cell) => {
    CacheArray.forEach((cache) => {
      if (cell.i == cache.i && cell.j == cache.j) {
        const momentoExists = MomentoArray.some((momento) => {
          const tempCache = new Cache(0, 0, 0);
          tempCache.fromMomento(momento);

          return tempCache.i == cache.i && tempCache.j == cache.j;
        });

        if (momentoExists) {
          const foundIndex = MomentoArray.findIndex((momento) => {
            const tempCache = new Cache(0, 0, 0);
            tempCache.fromMomento(momento);

            return tempCache.i == cache.i && tempCache.j == cache.j;
          });

          MomentoArray[foundIndex] = cache.toMomento();
        } else {
          MomentoArray.push(cache.toMomento());
        }
      }
    });
  });
}

// Function to save game state to local storage
function saveGame() {
  // Store each item to local storage
  localStorage.setItem("player", JSON.stringify(PlayerCoins));
  localStorage.setItem("caches", JSON.stringify(MomentoArray));
  localStorage.setItem("coins", JSON.stringify(CoinsArray));
  localStorage.setItem("playerLoc", JSON.stringify(playerMarker.getLatLng()));
  localStorage.setItem("path", JSON.stringify(pathSegments));
  // Store the last coin collected (if any)
  localStorage.setItem("lastCoin", JSON.stringify(lastCoin));
}

// Function to load and restore game state from local storage when the page is loaded
function loadGame() {
  // Restore the player's coin inventory if it exists in localStorage
  if (localStorage.getItem("player")) {
    PlayerCoins = JSON.parse(localStorage.getItem("player")!);
  }

  // Load and restore the caches
  if (localStorage.getItem("caches")) {
    MomentoArray = JSON.parse(localStorage.getItem("caches")!);

    // Iterate through the stored caches and update them accordingly
    MomentoArray.forEach((momento) => {
      // Create an updatedCache for each stored cache data
      const updatedCache = new Cache(0, 0, 0); // Assuming you create a Cache instance like this
      updatedCache.fromMomento(momento); // Update the Cache with data from the momento

      // Optionally, perform any additional updates you need (like checking if the cache is active)
      // For example, checking if the cache should still have coins or if it has been collected
      // Then, push the updated cache into the CacheArray
      CacheArray.push(updatedCache);
    });
  }

  // Restore the player's last known location if available
  if (localStorage.getItem("playerLoc")) {
    const storedLoc = JSON.parse(localStorage.getItem("playerLoc")!);
    playerMarker.setLatLng(storedLoc);
    playerMarker.addTo(map);
    map.panTo(playerMarker.getLatLng());
  }

  // Restore path segments if available
  if (localStorage.getItem("path")) {
    const storedPath = JSON.parse(localStorage.getItem("path")!);
    pathSegments = storedPath;
    if (pathSegments.length > 0) {
      leaflet.polyline(pathSegments, { color: "green" }).addTo(map);
      const lastPosition = pathSegments[pathSegments.length - 1];
      playerMarker.setLatLng(lastPosition);
      map.panTo(playerMarker.getLatLng());
    }
  }

  // Restore coins if available
  if (localStorage.getItem("coins")) {
    CoinsArray = JSON.parse(localStorage.getItem("coins")!);
  }

  // Load and restore the last coin information (if available)
  if (localStorage.getItem("lastCoin")) {
    const storedLastCoin = localStorage.getItem("lastCoin");
    lastCoin = JSON.parse(storedLastCoin!);
  }

  // Update the coin display after loading the player coins from localStorage
  coinCountDisplay.innerHTML =
    `Coins: ${PlayerCoins.length}  |  Recent Coin ID: (${
      (lastCoin.i * TILE_DEGREES).toFixed(4)
    }, ${(lastCoin.j * TILE_DEGREES).toFixed(4)}) #${lastCoin.serial}`;

  // Generate caches at the start
  generateCaches();
}

// Start the game when the page is loaded
document.addEventListener("DOMContentLoaded", () => {
  loadGame();
});

// Function resets the game by clearing all saved game data from localStorage and reloading the page
// This action is confirmed by the user through a prompt
function resetGame() {
  const reset = prompt(
    "This will erase all your game progress.",
    "Are you sure you want to continue? (yes or no)",
  );

  if (reset?.toLowerCase() === "yes") {
    // Clear all arrays and reset the state
    CoinsArray = []; // Clear the coins array
    PlayerCoins = []; // Clear the player's collected coins
    CacheArray = []; // Clear the cache array
    MomentoArray = []; // Clear the momento cache states

    // Initialize last coin ID
    lastCoin.i = 0;
    lastCoin.j = 0;
    lastCoin.serial = null;

    // Clear path segments and remove all existing polylines from the map
    pathSegments = [];
    map.eachLayer((layer) => {
      if (layer instanceof leaflet.Polyline) {
        map.removeLayer(layer);
      }
    });

    // Clear cache markers (rectangles) from the map
    map.eachLayer((layer) => {
      if (layer instanceof leaflet.Rectangle) {
        map.removeLayer(layer);
      }
    });

    // Reset the player's location to the initial position (or some default start point)
    playerMarker.setLatLng(OAKES_CLASSROOM); // Set back to the original location
    map.panTo(playerMarker.getLatLng());

    // Clear all saved data from localStorage
    localStorage.clear();

    // Reload the page to start fresh
    location.reload();
  }
}
