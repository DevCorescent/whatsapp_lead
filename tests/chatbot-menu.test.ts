import test from "node:test";
import assert from "node:assert/strict";
import {
  matchMenuReply,
  menuOptions,
  menuRenderMode,
  renderMenu,
  readMenuStack,
  NAV_BACK,
  NAV_HOME,
  WA_BUTTONS_MAX,
} from "../lib/chatbot/menu";
import type { MenuNodeData, MenuOption } from "../lib/chatbot/types";

const OPTIONS: MenuOption[] = [
  { id: "o1", label: "Check my order", keywords: ["order", "track"] },
  { id: "o2", label: "Pricing", keywords: ["price", "cost"] },
  { id: "o3", label: "Something else" },
];

// ─── Rendering ────────────────────────────────────────────────────────────────

test("three options or fewer go as buttons, more as a list", () => {
  // Exactly where WhatsApp's own limit falls, so auto never produces a payload
  // Meta will reject.
  assert.equal(menuRenderMode({}, 3), "buttons");
  assert.equal(menuRenderMode({}, 4), "list");
  assert.equal(WA_BUTTONS_MAX, 3);
});

test("a forced buttons layout that no longer fits becomes a list", () => {
  // The author picked buttons when there were three options and has since added
  // a fourth. A working list beats a 400 from Meta.
  assert.equal(menuRenderMode({ render: "buttons" }, 5), "list");
});

test("row ids carry the menu node, not just the option", () => {
  // So a stale tap on last week's menu cannot select an identically-named option
  // on this one.
  const rendered = renderMenu({ nodeId: "n1", data: {}, options: OPTIONS, prompt: "Pick one" });
  const buttons = (rendered.interactive.action as { buttons: { reply: { id: string } }[] }).buttons;

  assert.equal(buttons[0].reply.id, "menu:n1:o1");
});

test("the plain-text fallback numbers the options", () => {
  // The fallback exists for people who type, and "reply 2" is only useful advice
  // if the options are numbered where they can see them.
  const rendered = renderMenu({ nodeId: "n1", data: {}, options: OPTIONS, prompt: "Pick one" });

  assert.match(rendered.text, /1\. Check my order/);
  assert.match(rendered.text, /2\. Pricing/);
});

test("a list over ten rows is cut and the loss is reported", () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ id: `o${i}`, label: `Option ${i}` }));
  const rendered = renderMenu({ nodeId: "n1", data: { render: "list" }, options: many, prompt: "Pick" });

  assert.equal(rendered.shown.length, 10);
  assert.equal(rendered.dropped, 4);
});

// ─── Ways out ─────────────────────────────────────────────────────────────────

test("Back is hidden when there is nowhere to go back to", () => {
  // Showing it on the first menu promises something the flow cannot deliver.
  const data: MenuNodeData = { options: OPTIONS, showBack: true };

  assert.equal(menuOptions(data, { hasHistory: false }).length, 3);
  assert.equal(menuOptions(data, { hasHistory: true }).length, 4);
});

test("Main menu is hidden on the first menu too", () => {
  // It would return the customer to the screen they are already looking at,
  // which reads as the bot ignoring them.
  const data: MenuNodeData = { options: OPTIONS, showHome: true };

  assert.equal(menuOptions(data, { hasHistory: false }).length, 3);
  assert.equal(menuOptions(data, { hasHistory: true }).length, 4);
});

test("Talk to a person is offered everywhere, including the first menu", () => {
  // Unlike Back and Main menu, it does not depend on where you are — you can
  // always want a human.
  const data: MenuNodeData = { options: OPTIONS, showAgent: true };

  assert.equal(menuOptions(data, { hasHistory: false }).length, 4);
});

test("navigation rows come after the real options", () => {
  const data: MenuNodeData = { options: OPTIONS, showHome: true, showAgent: true };
  const shown = menuOptions(data, { hasHistory: true });

  assert.equal(shown[0].id, "o1");
  assert.equal(shown[3].id, NAV_HOME);
});

// ─── Matching ─────────────────────────────────────────────────────────────────

const match = (over: { replyId?: string; text?: string }) =>
  matchMenuReply({ nodeId: "n1", options: OPTIONS, ...over });

test("a tap selects exactly what was tapped", () => {
  assert.deepEqual(match({ replyId: "menu:n1:o2" }).option?.id, "o2");
});

test("a tap from a different menu is ignored", () => {
  assert.equal(match({ replyId: "menu:OTHER:o2" }).kind, "none");
});

test("typing the position works, as a digit or a word", () => {
  assert.equal(match({ text: "2" }).option?.id, "o2");
  assert.equal(match({ text: "two" }).option?.id, "o2");
});

test("a position outside the menu is not a match", () => {
  assert.equal(match({ text: "9" }).kind, "none");
});

test("typing the label works regardless of case and punctuation", () => {
  assert.equal(match({ text: "  PRICING! " }).option?.id, "o2");
});

test("an author keyword matches on whole words", () => {
  assert.equal(match({ text: "what is the cost" }).option?.id, "o2");
  // "order" must not fire on "reorder" — a substring match would route the
  // customer somewhere they did not choose.
  assert.equal(match({ text: "reordering" }).kind, "none");
});

test("partial label text is refused rather than guessed", () => {
  // "Something" appears in one label only, but half-matching is how an IVR sends
  // people to the wrong branch silently.
  assert.equal(match({ text: "some" }).kind, "none");
});

test("typed navigation words are understood", () => {
  assert.equal(match({ text: "back" }).kind, "back");
  assert.equal(match({ text: "main menu" }).kind, "home");
  assert.equal(match({ text: "agent" }).kind, "agent");
});

test("an option named after a navigation word still wins", () => {
  // Checked before the navigation words for exactly this reason.
  const options = [{ id: "o1", label: "Back to school offers" }];
  const result = matchMenuReply({ nodeId: "n1", options, text: "back to school offers" });

  assert.equal(result.kind, "option");
});

test("tapping a Back row is navigation, not a branch", () => {
  const options = [...OPTIONS, { id: NAV_BACK, label: "◀ Back" }];
  const result = matchMenuReply({ nodeId: "n1", options, replyId: `menu:n1:${NAV_BACK}` });

  assert.equal(result.kind, "back");
});

// ─── Stored state ─────────────────────────────────────────────────────────────

test("a corrupt navigation stack degrades to no history", () => {
  // This value survives in the database between turns, so it must never throw
  // mid-conversation.
  assert.deepEqual(readMenuStack({ __menuStack: "not json" }), []);
  assert.deepEqual(readMenuStack({}), []);
  assert.deepEqual(readMenuStack({ __menuStack: '["a","b"]' }), ["a", "b"]);
});
