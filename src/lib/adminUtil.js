// src/lib/adminUtil.js
// -----------------------------------------------------------
// Admin utility – single source of truth for UI gating
// -----------------------------------------------------------
import { engine } from "./gsEngine.js";

/**
 * Returns true if the admin session is active.
 * This runs **in the browser** (client‑side) only.
 */
export const isAdmin = () => {
  return typeof window !== "undefined" && engine.isAdminSession();
};

/**
 * Add or remove the `.d-none` class on an element.
 * Use when you need to hide something that was already rendered.
 */
export const toggleAdminVisibility = (el) => {
  if (!el) return;
  if (isAdmin()) {
    el.classList.remove("d-none");
  } else {
    el.classList.add("d-none");
  }
};

/**
 * Guard wrapper for any admin‑only callback.
 * Use inside `onclick`, `onsubmit`, etc.
 */
export const withAdminGuard = (fn) => (...args) => {
  if (!isAdmin()) {
    console.warn("Acción de administración bloqueada – sesión no activa.");
    return;
  }
  return fn(...args);
};
