# How to Delete the Recorder Chat Fallback

Added temporarily (2026-04-05) so trades can be typed when voice isn't available.
**Two things to remove, both in one file. Nothing else touches this.**

---

## File: `web/components/buddy/BuddyChat.tsx`

### 1. Remove the state variable (~line 115)

Find and delete this line:
```ts
const [recorderChatInput, setRecorderChatInput] = useState('')
```
The comment above it (`// CHAT-FALLBACK: text input for when...`) can go too.

---

### 2. Remove the JSX block inside the Recorder tab

Find the block between these two comments and delete everything including the comments:
```
{/* CHAT-FALLBACK: delete this block to remove text input — no other code depends on it */}
...
{/* END CHAT-FALLBACK */}
```

That's a `<div>` containing an `<input>` and a `<button>`.

---

## Verify nothing broke

```bash
npx tsc --noEmit
```

Zero errors expected. The `recorderChatInput` state var is only used inside the deleted JSX block, so removing both together leaves no dangling references.
