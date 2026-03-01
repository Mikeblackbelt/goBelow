//show dialogue("Hello world!") or showDialogue("Hello!", { speed: 40, hold: 3000 })

const DEFAULTS = {
  speed: 50,    // ms per character
  hold: 2000,   // ms to hold after fully typed before fading out
  fadeOut: 400, // ms for fade out transition
};

// Create the dialogue box once and reuse it
const dialogueBox = document.createElement("div");
Object.assign(dialogueBox.style, {
  position: "fixed",
  bottom: "80px",
  left: "50%",
  transform: "translateX(-50%)",
  color: "white",
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: "20px",
  fontWeight: "bold",
  textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 2px black",
  backgroundColor: "rgba(0, 0, 0, 0.6)",
  padding: "12px 24px",
  borderRadius: "8px",
  maxWidth: "600px",
  textAlign: "center",
  pointerEvents: "none",
  opacity: "0",
  transition: `opacity ${DEFAULTS.fadeOut}ms ease`,
  zIndex: "1000",
  whiteSpace: "pre-wrap",
  letterSpacing: "0.03em",
});
document.body.appendChild(dialogueBox);

let currentTimeout = null;
let currentInterval = null;

function clearTimers() {
  if (currentTimeout)  { clearTimeout(currentTimeout);  currentTimeout  = null; }
  if (currentInterval) { clearInterval(currentInterval); currentInterval = null; }
}

export function showDialogue(text, options = {}) {
  const { speed, hold, fadeOut } = { ...DEFAULTS, ...options };

  clearTimers();

  // Reset state
  dialogueBox.style.transition = "none";
  dialogueBox.style.opacity = "1";
  dialogueBox.textContent = "";

  let i = 0;
  currentInterval = setInterval(() => {
    dialogueBox.textContent += text[i];
    i++;
    if (i >= text.length) {
      clearInterval(currentInterval);
      currentInterval = null;

      // Hold, then fade out
      currentTimeout = setTimeout(() => {
        dialogueBox.style.transition = `opacity ${fadeOut}ms ease`;
        dialogueBox.style.opacity = "0";
        currentTimeout = null;
      }, hold);
    }
  }, speed);
}