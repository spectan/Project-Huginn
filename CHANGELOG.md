# Changelog

## v1.4.2

**Maintenance**
- Large internal cleanup: about 5,000 fewer lines of code with no feature changes
- Removed unused database indexes (run `npm run db:migrate`)
- Network errors in the account and Discord settings panels now show a friendly message instead of failing silently

## v1.4.1

**Security**
- Login rate limit can no longer be bypassed with many parallel requests
- Attackers can no longer lock out an account (e.g. admin) by spamming bad passwords
- Registration is now rate-limited
- Spoofed forwarding headers are ignored when they don't match the proxy setup

**Fixes**
- Initial admin seed no longer reports success if someone already registered the admin name
- Operators editing a user no longer wipe that user's access to inactive maps
- Two admins editing the same user at once no longer overwrite each other
- Settings over the annotation/category limits are rejected with a clear error instead of being silently trimmed
- Deleted alerts no longer immediately reappear
- Restoring a deed only removes its "Abandoned Deed" note if nobody has repurposed it
- Old disband events are no longer replayed by the sync worker
- Notes whose category was removed can still be edited
- Event list shows a consistent 30 entries
- Map: smoother hover with many markers, reliable settings saving, clearer note category errors, better trackpad zoom, no stale wilderness overlay

**Admin / deploy notes**
- Update steps now also restart the `sync` worker (see README)
- Smaller Docker image (map images no longer bundled twice)

## v1.4.0

**Security**
- Raw map images are no longer publicly downloadable; they're only served watermarked
- Share links stop working once the creator loses access to the map
- Login is rate-limited, and failed logins no longer reveal whether a username exists
- Client IPs can no longer be spoofed via `X-Forwarded-For` (new `TRUSTED_PROXY_HOPS` setting)
- Stricter limits on uploads, share links and saved settings

**Fixes**
- Deleted rifts, camps, mine doors, locate souls and paths are now purged after 72h
- Restoring a disbanded deed also removes its "Abandoned Deed" note
- Admin account list works past 100 users
- Editing a user no longer wipes their access to inactive maps
- Deleting a path with the wrong type (e.g. canal vs bridge) no longer deletes it
- Scroll-zoom no longer jumps after opening a coordinate link
- Clicking a tile no longer zooms the map to it
- Wilderness overlay no longer changes while searching
- Profiles now save your latest settings; changes are kept when switching servers
- Errors when saving markers or categories are now shown instead of failing silently
- Unique-respawn alert refreshes in long-open tabs
- Operators now land on the Accounts page instead of "access denied"
- Discord "Account approvals" notifications work again
- Fewer duplicate alerts and Discord posts; high-severity alerts are no longer hidden behind lower ones
- Event sync no longer overlaps or stalls on a slow server

**Performance**
- Smoother panning and hovering with many markers
- Deed dragging no longer stutters with the wilderness overlay on
- Faster map image loading (watermark cache no longer rehashes every request)

**Admin / deploy notes**
- Map layer images moved to `map-images/maps/`; move any custom layers there before rebuilding
- Admin seeding is now `docker compose run --rm seed`, and it no longer resets an existing admin's password
- `INITIAL_ADMIN_PASSWORD` is no longer passed to the app container
- Run `npm run db:migrate` (4 new migrations)
