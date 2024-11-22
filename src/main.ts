// main.ts

// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// Flyweight factory file
import { Board } from "./board.ts";

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Implement board
const board = new Board(TILE_DEGREES, 8);

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

// Set up coins and player marker
interface Coin {
  i: number;
  j: number;
  serial: number;
}

const CoinsArray: Coin[] = [];
const PlayerCoins: Coin[] = [];
let lastCoin: Coin;

const playerMarker = leaflet.marker(OAKES_CLASSROOM);

// Display coins
const coinCountDisplay = document.querySelector<HTMLDivElement>("#coins")!;
coinCountDisplay.innerHTML = "0";

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  // Convert cell numbers into lat/lng bounds
  const origin = OAKES_CLASSROOM;
  i = (origin.lat + (i * TILE_DEGREES)) / TILE_DEGREES;
  j = (origin.lng + (j * TILE_DEGREES)) / TILE_DEGREES;

  const point = leaflet.latLng(i, j);
  const pointCell = board.getCellForPoint(point);
  const bounds = board.getCellBounds(pointCell);

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // Set up temp point value for cache
  let tempValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);

  // Handle interactions with the cache
  rect.bindPopup(() => {
    // Each cache has a random point value, mutable by the player
    let coinValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);

    if (tempValue != coinValue) {
      coinValue = tempValue;
    }

    for (let x = 0; x < coinValue; x++) {
      const newCoin: Coin = {
        i: i,
        j: j,
        serial: x,
      };
      CoinsArray.push(newCoin);
    }

    // The popup offers a description and buttons
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>
        Cache Location: "${(i * TILE_DEGREES).toFixed(4)}, ${
      (j * TILE_DEGREES).toFixed(4)
    }" Available coins: <span id="value">${coinValue}</span>
      </div>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>
    `;

    // Clicking the buttons decrements/inc the cache's value and increments/dec the player's coins
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        // Check if cache has any coins left
        if (coinValue <= 0) {
          alert("No more coins to collect from this cache!");
          return; // Prevent collection if cache has no coins
        }
        if (coinValue > 0) {
          coinValue--;

          let isFound = false;

          for (let x = 0; x < CoinsArray.length; x++) {
            if (CoinsArray[x].i == i && CoinsArray[x].j == j && !isFound) {
              console.log(CoinsArray[x]);
              lastCoin = CoinsArray[x];
              PlayerCoins.push(CoinsArray[x]);
              CoinsArray.splice(x, 1);
              isFound = true;
            }
          }
        }

        // Update coin display
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = coinValue
          .toString();
        coinCountDisplay.innerHTML =
          `${PlayerCoins.length}  |  Recent Coin ID: (${
            (lastCoin.i * TILE_DEGREES).toFixed(4)
          }, ${(lastCoin.j * TILE_DEGREES).toFixed(4)}) #${lastCoin.serial}`;
        tempValue = coinValue;
      });

    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        // Check if player has any coins left
        if (PlayerCoins.length <= 0) {
          alert("No more coins to deposit!");
          return; // Prevent deposit if player has no coins
        }
        if (PlayerCoins.length > 0) {
          coinValue++;

          let hasdepositd = false;

          for (let x = 0; x < PlayerCoins.length; x++) {
            if (!hasdepositd) {
              lastCoin = PlayerCoins[x];
              CoinsArray.push(PlayerCoins[x]);
              PlayerCoins.splice(x, 1);
              hasdepositd = true;
            }
          }
        }

        // Update coin display
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = coinValue
          .toString();
        coinCountDisplay.innerHTML =
          `${PlayerCoins.length}  |  Recent Coin ID: (${
            (lastCoin.i * TILE_DEGREES).toFixed(4)
          }, ${(lastCoin.j * TILE_DEGREES).toFixed(4)}) #${lastCoin.serial}`;
        tempValue = coinValue;
      });

    return popupDiv;
  });
}

function main() {
  // set player and go!
  playerMarker.bindTooltip("You are here!");
  playerMarker.addTo(map);

  // Look around the player's neighborhood for caches to spawn
  for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
    for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
      // If location i,j is lucky enough, spawn a cache!
      if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(i, j);
      }
    }
  }
}

main();
