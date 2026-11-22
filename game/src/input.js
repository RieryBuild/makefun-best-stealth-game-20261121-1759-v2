// input.js — keyboard and mouse state for Harbour Lights.
//
// Keys: WASD or arrows to move, Shift to sneak, Space to sprint,
// E to hide in cover (near a bush or deep shadow), Q or left-click to
// throw a coin at the cursor, Enter to start / continue,
// Esc or P to pause. Mouse position is kept in canvas coordinates so a
// click can aim the coin throw.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.clicked = false; // set on click, cleared by the game loop each frame
    this.pressedKeys = new Set(); // edge-triggered keys, cleared each frame
    this.onKeyDown = null; // optional hook: (code) => void

    window.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
      if (!e.repeat) {
        this.pressedKeys.add(e.code);
        if (this.onKeyDown) this.onKeyDown(e.code);
      }
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
    });
    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
      this.clicked = true;
    });
    // Losing focus must not leave a key stuck down.
    window.addEventListener("blur", () => this.keys.clear());
  }

  get up() {
    return this.keys.has("KeyW") || this.keys.has("ArrowUp");
  }
  get down() {
    return this.keys.has("KeyS") || this.keys.has("ArrowDown");
  }
  get left() {
    return this.keys.has("KeyA") || this.keys.has("ArrowLeft");
  }
  get right() {
    return this.keys.has("KeyD") || this.keys.has("ArrowRight");
  }
  get sneak() {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
  }
  get sprint() {
    return this.keys.has("Space");
  }
  get coinKey() {
    return this.pressedKeys.has("KeyQ");
  }
  get hideKey() {
    return this.pressedKeys.has("KeyE");
  }
  get confirm() {
    return this.pressedKeys.has("Enter") || this.pressedKeys.has("NumpadEnter");
  }
  get pause() {
    return this.pressedKeys.has("Escape") || this.pressedKeys.has("KeyP");
  }
  get restart() {
    return this.pressedKeys.has("KeyR");
  }

  // Call at the end of every frame: edge-triggered state lives one frame.
  endFrame() {
    this.pressedKeys.clear();
    this.clicked = false;
  }
}
