/**
 * Agent session deep link — /agent/s/<id>.
 *
 * The sidebar "Recent" list links agent chats here; this re-export makes
 * the URL resolve to the Agent page instead of 404ing. The <id> param is
 * intentionally unused for now.
 */
export { default } from "../../../agent/page";
