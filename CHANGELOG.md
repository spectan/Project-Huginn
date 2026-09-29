# Changelog

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
