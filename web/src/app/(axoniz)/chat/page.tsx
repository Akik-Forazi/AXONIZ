/**
 * Chat route — alias of the Chat Workspace.
 *
 * The Chat Workspace component lives at (axoniz)/page.tsx ("the / route"),
 * but the app shell, seed redirect (src/app/page.tsx) and device-auth flow
 * navigate to /chat. This re-export makes /chat render the same workspace
 * instead of 404ing.
 */
export { default } from "../page";
