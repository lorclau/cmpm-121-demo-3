// main.ts

// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// Create spawn points, using classroom location
const spawnLocations = {
  OAKES_CLASSROOM: leaflet.latLng(36.98949379578401, -122.06277128548504),
};

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map with leaflet
const map = leaflet.map(document.getElementById("map")!, {
  center: spawnLocations.OAKES_CLASSROOM,
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

// Set up player
const player = {
  coins: 0,
  marker: leaflet.marker(spawnLocations.OAKES_CLASSROOM),
};

// Track spawn caches
const caches = new Map<string, number>();
const coinCountDisplay = document.querySelector<HTMLDivElement>("#coins")!;
coinCountDisplay.innerHTML = "0";

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  // Convert cell numbers into lat/lng bounds
  const origin = spawnLocations.OAKES_CLASSROOM;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // Each cache has a random point value, mutable by the player
  const pointValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);

  // Store cache info
  caches.set(i.toString() + j.toString(), pointValue);

  // Handle interactions with the cache
  rect.bindPopup(() => {
    // The popup offers a description and buttons
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
    <div>Cache Location: "${i},${j}" Available Coins: <span id="value">${
      (caches.get(i.toString() + j.toString())!).toString()
    }</span></div><button id="deposit">Deposit coins</button> <button id="withdrawal">Collect coins</button>`;

    const updateUserCoinView = () => {
      popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
        (caches.get(i.toString() + j.toString())!).toString();
      coinCountDisplay.innerHTML = `${player.coins}`;
    };

    // Define button behavior
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        // Check if player has any coins left
        if (player.coins <= 0) {
          alert("No more coins to deposit!");
          return; // Prevent deposit if player has no coins
        }
        caches.set(
          i.toString() + j.toString(),
          caches.get(i.toString() + j.toString())! + 1,
        );
        player.coins--;
        updateUserCoinView();
      });
    popupDiv
      .querySelector<HTMLButtonElement>("#withdrawal")!
      .addEventListener("click", () => {
        // Check if cache has any coins left
        const cacheCoins = caches.get(i.toString() + j.toString())!;
        if (cacheCoins <= 0) {
          alert("No more coins to collect from this cache!");
          return; // Prevent withdrawal if cache has no coins
        }
        caches.set(
          i.toString() + j.toString(),
          caches.get(i.toString() + j.toString())! - 1,
        );
        player.coins++;
        updateUserCoinView();
      });

    return popupDiv;
  });
}

function main() {
  // here is where we would load stuff from local storage

  //  then we can set player and go!
  player.marker.bindTooltip("You are here!");
  player.marker.addTo(map);

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
