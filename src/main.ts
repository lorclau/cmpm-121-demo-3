// main.ts

// Create a button element
const button = document.createElement("button");
button.textContent = "Click me!";

// Add an event listener
button.addEventListener("click", () => {
  alert("You clicked the button!");
});
document.body.appendChild(button);
