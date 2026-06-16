# Phase 6 Progress

Source of truth for the Ralph loop. Each iteration: do the FIRST unchecked task,
verify (`tsc` + `build`), commit, tick it. When all are checked, prepend a line
`PHASE6 COMPLETE` to this file and commit.

## Foundation
- [x] 1. Add `follows`, `likes`, `comments` tables (+ indexes) to the SCHEMA string in `src/app/api/migrate/route.ts` (idempotent `IF NOT EXISTS`).
- [x] 2. Add types to `src/lib/types.ts`: `Follow`, `Like`, `Comment`; extend `PostWithAuthor` with `like_count: number`, `liked_by_me: boolean`, `comment_count: number`.

## 6a — Follows
- [x] 3. `toggleFollow(targetUserId)` server action (insert/delete, ignore self-follow, revalidate) in `src/app/(main)/profile/actions.ts` (or a new follows actions file).
- [x] 4. `FollowButton` client component (optimistic), rendered on other users' profiles only.
- [x] 5. Profile page: show follower + following counts, and the `FollowButton`.
- [x] 6. Feed query: posts from followed users + self, newest first; fall back to ALL posts if following nobody.

## 6b — Likes
- [x] 7. `toggleLike(postId)` server action (insert/delete, revalidate).
- [x] 8. Extend feed AND profile post queries with `like_count` + `liked_by_me` for the current user.
- [x] 9. `LikeButton` client component (heart + count, optimistic), integrated into `PostCard`.

## 6c — Comments
- [x] 10. `addComment(postId, content)` + `getComments(postId)` server actions (getComments joins author username, oldest first).
- [ ] 11. Extend feed AND profile post queries with `comment_count`.
- [ ] 12. `CommentSection` client component integrated into `PostCard`: count toggles an inline thread, lazily loads comments on first expand, with a ≤280-char composer.

## Wrap-up
- [ ] 13. Final pass: `npx tsc --noEmit` + `npm run build` clean; quick self-review of all Phase 6 code for convention adherence; then mark complete.
