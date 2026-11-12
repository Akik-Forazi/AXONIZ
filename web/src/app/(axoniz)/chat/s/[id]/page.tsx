/**
 * Chat session deep link — /chat/s/<id>.
 *
 * The sidebar "Recent" list and share URLs navigate here. The current
 * Chat Workspace component is session-less (it keeps its messages in the
 * workspace store), so this renders the same workspace rather than 404ing.
 * The <id> param is intentionally unused for now.
 */
export { default } from "../../../page";
