import type { Transition } from 'framer-motion'

/* Shared framer-motion spring configs — import from here, never define per-component.
   framer-motion v13 Spring type does not include `type` — use Transition wrapper. */
export const SPRING_GENTLE: Transition = { type: 'spring', stiffness: 280, damping: 28 } as Transition
export const SPRING_BOUNCY: Transition = { type: 'spring', stiffness: 400, damping: 22 } as Transition
export const SPRING_STIFF:  Transition = { type: 'spring', stiffness: 600, damping: 35 } as Transition
export const SPRING_SLOW:   Transition = { type: 'spring', stiffness: 180, damping: 26 } as Transition

/* Stagger children 35ms apart */
export const STAGGER_CONTAINER = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.035 } },
}
export const STAGGER_ITEM = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: SPRING_GENTLE },
}

/* Fade + scale in */
export const FADE_SCALE = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: SPRING_GENTLE },
}

/* Slide from right (detail panels) */
export const SLIDE_RIGHT = {
  hidden:  { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: SPRING_GENTLE },
  exit:    { opacity: 0, x: -12, transition: { duration: 0.15 } },
}

/* Route page transition */
export const PAGE_TRANSITION = {
  initial:   { opacity: 0, y: 10 },
  animate:   { opacity: 1, y: 0 },
  exit:      { opacity: 0, y: -6 },
  transition: SPRING_GENTLE,
}

/* Slide from bottom (bottom sheet / modals) */
export const SLIDE_UP = {
  hidden:  { opacity: 0, y: '100%' },
  visible: { opacity: 1, y: 0, transition: SPRING_GENTLE },
  exit:    { opacity: 0, y: '100%', transition: { duration: 0.2 } },
}

/* Micro-interaction tap effect */
export const PRESS_TAP = {
  scale: 0.97,
  transition: { duration: 0.1 },
}

