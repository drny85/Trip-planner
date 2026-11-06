# Trip Planner

AI-powered trip planning and itinerary manager. It's a pnpm + Turborepo monorepo with a Next.js web app, an Expo app (iOS, Android and web) and a Convex backend. Claude generates the itineraries.

## Layout

```
trip-planner/
├── apps/
│   ├── web/                      Next.js 16 (App Router, Cache Components) + Tailwind v4
│   │   ├── app/                  /, /trips, /trips/new, /trips/[tripId]
│   │   ├── components/           providers (Convex + Clerk), header, trips list, generate form
│   │   │   └── trip/             trip view: timeline, drag-to-reorder, inline editor
│   │   └── proxy.ts              clerkMiddleware (only when Clerk keys are set)
│   └── mobile/                   Expo SDK 58 + Expo Router + Uniwind
│       ├── metro.config.js       withUniwindConfig (outermost wrapper)
│       ├── global.css            Tailwind v4 + Uniwind entry and light/dark theme tokens
│       └── src/
│           ├── app/              routes: index, generate (modal), trips/[tripId], activity edit (form sheet)
│           ├── screens/          trips-list, trip-details, edit-activity, generate-trip
│           ├── components/       Button, Icon (SF Symbols / Material), Image (expo-image via withUniwind), AuthGate
│           ├── providers/        Convex + Clerk providers
│           └── lib/open.ts       tel:, maps directions, in-app browser for reservations
├── packages/
│   ├── backend/                  Convex
│   │   ├── convex/
│   │   │   ├── schema.ts         users, trips, subTrips, activities
│   │   │   ├── ai.ts             ai.generateTrip: Claude + Zod structured output, then saves the trip
│   │   │   ├── trips.ts          list / get (nested tree) / update / remove / saveGenerated
│   │   │   ├── activities.ts     setCompleted / update / create / move / remove
│   │   │   ├── users.ts          store (sync from Clerk) / me
│   │   │   ├── seed.ts           demoTrip: loads the fake "Tokyo Adventure" trip
│   │   │   ├── auth.config.ts    Clerk issuer (enabled by an env var)
│   │   │   └── lib/              validators, tripSchema (Zod), insertTripTree, fakeData, auth helpers
│   │   └── src/optimistic.ts     optimistic updates shared by web and mobile
│   └── ui/                       shared helpers: cn(), date formatting, tel:/maps links
├── turbo.json
└── pnpm-workspace.yaml
```

## Run it

```bash
pnpm install

# 1. Backend: logs you in to Convex, creates a dev deployment and writes packages/backend/.env.local
pnpm dev:backend
#    If the first push says CLERK_JWT_ISSUER_DOMAIN "is used in auth config file but its value
#    was not set", keep demo mode by setting it empty, then run dev:backend again:
#    cd packages/backend && npx convex env set CLERK_JWT_ISSUER_DOMAIN ""

# 2. Point the apps at it (use the CONVEX_URL from packages/backend/.env.local)
cp apps/web/.env.example apps/web/.env.local          # set NEXT_PUBLIC_CONVEX_URL
cp apps/mobile/.env.example apps/mobile/.env.local    # set EXPO_PUBLIC_CONVEX_URL

# 3. Everything at once (backend + web on :3000 + Expo)
pnpm dev
```

Open the web app or the Expo app and choose **Load demo trip** to explore with fake data. You don't need any other keys for that.

### Turn on AI generation

Pick one. If both are set, the gateway wins.

```bash
cd packages/backend

# Option A (recommended): Vercel AI Gateway — any provider's models, usage and spend in Vercel
npx convex env set AI_GATEWAY_API_KEY <your AI Gateway key>

# Option B: Claude API directly
npx convex env set ANTHROPIC_API_KEY sk-ant-...
```

Create the gateway key in the Vercel dashboard under **AI Gateway → API Keys**.

**Model routing.** Each request is sorted into a tier by `convex/lib/modelRouter.ts`, with no extra model call: it reads the trip length and how many places the request spans. Cheap models handle short simple trips; frontier models only plan long multi-city ones.

| Tier | When | Gateway models (first = primary, rest = fallbacks) | Direct Claude API |
| --- | --- | --- | --- |
| simple | ≤ 3 days, one place, short request | `google/gemini-3.5-flash`, `anthropic/claude-haiku-5.5` | `claude-haiku-5-5` |
| standard | everything else | `anthropic/claude-sonnet-5.5`, `openai/gpt-5.5` | `claude-sonnet-5-5` |
| complex | 8+ days, several cities, road trips, long detailed requests | `anthropic/claude-opus-5.5`, `openai/gpt-5.5` | `claude-opus-5-5` |

Through the gateway the call uses the Vercel AI SDK (`generateText` with `Output.object` and the same Zod schema), and the gateway falls back through the tier's list if the primary model is down. If an answer is cut off or doesn't match the schema, the action retries once per tier upward. The model that actually produced each trip is saved on it as `aiModel`.

Change the models without touching code (comma-separated, primary first):

```bash
npx convex env set AI_MODEL_SIMPLE "google/gemini-3.5-flash,openai/gpt-5.5"
npx convex env set AI_MODEL_STANDARD "openai/gpt-5.5"
npx convex env set AI_MODEL_COMPLEX "anthropic/claude-opus-5.5"
npx convex env set AI_MODEL "anthropic/claude-sonnet-5.5"   # one model for everything, routing off
```

`google/gemini-3.5-flash`, `openai/gpt-5.5` and `anthropic/claude-sonnet-5.5` were checked against the live gateway model list; check `anthropic/claude-haiku-5.5` and `anthropic/claude-opus-5.5` in the [AI Gateway model catalog](https://vercel.com/ai-gateway/models) and override a tier if one is missing.

Either way the output is a Zod-validated structured itinerary.

**Photos.** A new trip first gets free Unsplash stock photos picked by category (`convex/lib/photos.ts`), so it never shows blank cards. A background job (`convex/photos.ts`) then searches Wikipedia for each place and swaps in the lead photo of the matching article, plus a destination photo for the cover. It's free with no API key. A Wikipedia result is used only when its title shares a distinctive word with the activity (so "Trevi Fountain" can't pick up a photo of some other town), and train rides and hotel check-ins keep their stock photos.

### Turn on sign-in (Clerk)

Until these are set, everything runs as a single demo user.

1. Create a Clerk application and enable the Convex integration in the Clerk dashboard. Copy the Frontend API URL.
2. `npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev` (in `packages/backend`)
3. Web: set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `apps/web/.env.local`.
4. Mobile: set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/mobile/.env.local`. Sign-in uses Clerk's hosted pages (`useHostedAuth`). Add the app's callback for bundle id `com.tripplanner.app` in Clerk, and use a development build (`npx expo run:ios`) because hosted auth needs the native config plugin.

Once `CLERK_JWT_ISSUER_DOMAIN` is set, the backend rejects anonymous calls. Trips created in demo mode belong to `demo-user` and won't show up for real accounts.

## Checks

```bash
pnpm typecheck   # all packages (mobile regenerates Uniwind types first)
pnpm test        # Convex functions + AI action (convex-test, fetch mocked)
pnpm lint
pnpm build       # Next.js production build
```

## Sub-activities and categories

- Any activity can hold steps, and each step can hold its own steps, to any depth (`parentId` on `activities`). Completing an activity completes everything inside it; reopening a step reopens its parents. Moving or deleting an activity takes its steps with it.
- Every activity has a category and an optional subcategory, for example Stays → Hotel, Home, Airbnb, or Dining → Breakfast, Lunch, Dinner. The list lives in `packages/backend/convex/lib/categories.ts`; labels and emoji are in `packages/ui/src/categories.ts`.
- Web: hover a step for add, edit, reorder, nest (⇥) and un-nest (⇤). Mobile: tap a step to edit it, add steps or move it out a level.
- AI trips can include one level of steps (for example, the stalls to try in a market); you can nest deeper in the app.

## Up next and budget

- The home screen (web landing page and the mobile trips list) opens with an "Up next" card: the first open activity of the trip under way or the next upcoming one, the next step inside it, and what comes after. Checking it off slides in the next one. `trips.upNext` takes the device's local date.
- Each trip shows a budget per person by category or by day. A parent's cost is the sum of its steps when they have costs, so nothing is counted twice. "Spent" is the actual cost you enter, or the estimate for anything checked off without one.

## Travel together: invites, ideas and votes

- The organizer turns on an invite link from the trip page ("Invite friends"). Friends open `/join/<token>`, sign in, and join. The organizer can turn the link off or remove people; members can leave.
- Members see the trip in their list (marked "Joined"), can check things off, and can suggest ideas. Only the organizer edits the itinerary directly.
- Every idea goes to a vote. The author's vote counts as yes. Once more than half of the travelers vote yes, it's added at the end of its day. Once that can no longer happen, it's dropped. When someone leaves, open ideas are re-checked against the smaller group.
- In demo mode everyone is the same user, so try invites with Clerk turned on (see "Turn on sign-in").

## Memories

- Anyone on the trip can add photos to an activity: the 📷 button on web, or on mobile the camera or photo library (`expo-image-picker`). Photos are kept in Convex file storage, as images up to 15 MB.
- Each card shows its photos, and the trip page has a Memories album grouped by day with a full-screen viewer. Photos can have captions. The person who added a photo, or the organizer, can delete it.
- Deleting an activity or a trip deletes its photos.
- Mobile needs a new development build after this change, because the image picker is a native module.

## Packing, calendar and weather

- **Packing list**: one list per trip, shared by everyone going. "Add the essentials" fills in the basics, anyone can tick items off, and "I'll bring it" claims a shared item so it isn't packed twice (`convex/packing.ts`).
- **Add to calendar**: exports the itinerary as an `.ics` file, one event per timed activity or step plus an all-day event per day (`packages/ui/src/calendar.ts`). Web downloads it; mobile writes it with `expo-file-system` and opens the share sheet (`expo-sharing`), so it needs a new dev build.
- **Weather**: each day shows the forecast for its first stop with coordinates, from [Open-Meteo](https://open-meteo.com) (free, no key). It only appears once the day is within 16 days, since that's as far as the forecast goes.

## Split costs, notifications, AI re-plan and offline

- **Split costs**: anyone on the trip logs what they paid and who it's split between. Balances and the fewest payments to settle up are worked out in whole cents (`convex/lib/settle.ts`), and "Mark paid" records a settlement.
- **Notifications**: an in-app feed (bell on web and mobile) for new ideas, vote results, people joining, and shared costs (`convex/lib/notify.ts`). Phones also get a push through Expo's push service (`convex/push.ts`). Push needs an EAS project id in the app config (`eas init`) and a dev build with `expo-notifications`. Without them, the in-app feed still works. Mobile also schedules a local reminder 30 minutes before each timed activity of a trip you open.
- **AI re-plan a day**: the organizer can ask the AI to re-plan one day ("it's going to rain", "lighter day", or their own words). When the forecast shows a 50% or higher chance of rain, the button becomes a "Rain plan". The proposal is shown first and applied only on "Use this plan". Kept stops keep their photos and steps, and a stop with photos is never removed (`ai.replanDay`, `activities.applyReplan`). It uses the same model routing as trip generation.
- **Offline itinerary (mobile)**: the trips list, every trip that hasn't ended yet, its packing list and Up next are saved on the device (`useCachedQuery`). With no signal, the app shows the saved copy and a banner, and Convex sends queued changes once it reconnects. The cache is wiped on sign-out.

## Booking import

Paste a confirmation email, drop a PDF or screenshot (on web you can also paste a screenshot straight into the box), or forward the email to the trip's own address. AI reads it in the background (`convex/bookings.ts`, cheap tier first, one tier up if the answer is incomplete), finds each flight, train, car, stay, table, tour or ticket, and proposes the day it belongs on. When a booking is for something already planned (the hotel check-in, that dinner), it's added to that activity instead of creating a new stop. Nothing changes until the traveler checks the proposals and taps **Add to the trip**. Uploaded files are deleted as soon as they've been read.

Forwarding needs an inbound email provider (Postmark inbound works as is; anything that POSTs the same JSON works too):

```bash
cd packages/backend
npx convex env set INBOUND_EMAIL_DOMAIN in.yourdomain.com     # MX records point at the provider
npx convex env set INBOUND_EMAIL_SECRET <long random string>
# Webhook URL: https://<deployment>.convex.site/inbound/email?key=<INBOUND_EMAIL_SECRET>
```

The trip owner turns on the address in the import dialog (`trip-<token>@in.yourdomain.com`). Forwarded emails wait on the owner's trip page for review. Without these variables, paste and upload still work and the forwarding option is hidden.

## Price and flight alerts

Every flight and hotel booking can be watched for price drops, and every flight booking with a flight number in its title ("Flight UA 837 · SFO → NRT") gets live status by itself. Everyone on the trip gets a push and an in-app notification, in their own language, when a watched price drops at least 5% (and at least 10 currency units) below what they paid or below the last alert, or when a flight is delayed 15 minutes or more, changes gate, or is canceled. Code: `convex/alerts.ts`, `convex/lib/alerts.ts`, crons in `convex/crons.ts`.

- **Prices** come from [SerpApi](https://serpapi.com) (Google Flights and Google Hotels). The free plan is 250 searches a month, so the daily cron checks at most `PRICE_CHECKS_PER_DAY` watches (default 6), plus one check when a watch starts.
- **Flight status** comes from [AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox) on RapidAPI (free Basic plan). Checks start 2 days before departure, then every 6 hours, hourly from 6 hours out and every 15 minutes from 2 hours out, and stop once the flight leaves.

```bash
cd packages/backend
npx convex env set SERPAPI_API_KEY <key>            # serpapi.com > Dashboard > API key
npx convex env set AERODATABOX_API_KEY <key>        # RapidAPI key, after subscribing to AeroDataBox's Basic plan
npx convex env set ALERTS_DEMO true                 # optional: made-up prices and statuses, no keys needed
npx convex run alerts:backfillFlightTracks          # once, to track flights added before alerts existed
```

Without keys nothing is called and the bookings list says alerts are off.

### Flights for travelers who haven't booked yet

The trip page's **Flights** card (`convex/fares.ts`, `convex/lib/fares.ts`, `convex/lib/travelpayouts.ts`, advice in `packages/ui/src/fares.ts`) watches fares from the traveler's home airport (remembered on their profile) for the trip's dates.

- **Fare watch:** today's cheapest fare, the 3 best options, a price level and usual range, and a price trend. The apps turn these into a "good time to book?" hint (book in the last 2 weeks or when it's low, wait when it's falling far out, and so on).
- **Alerts:** only the watcher gets a push, on a real drop (same 5% / 10-unit rule) or once the fare reaches the target they set.
- **Nearby dates:** the same trip moved ±3 days. The organizer can move the whole trip to a cheaper window while nothing is booked.
- **Book, then track:** "Book" opens Aviasales (or Google Flights without Travelpayouts). Coming back, they're asked "Booked it?" and can add the confirmation through booking import; the flight then gets live status like any other, and the fare watch ends.
- **Fit the plan:** once flights are on the trip, the organizer can have the AI re-plan day 1 from about 90 minutes after landing, and the last day so they leave for the airport 3 hours before take-off (it reuses the day re-plan).

**Where prices come from.** With `TRAVELPAYOUTS_TOKEN` set, fares come from the free Travelpayouts (Aviasales) Data API: prices Aviasales users found in the last 48 hours, so they're "from" prices. Each check fetches the trip's dates and the ±3 day grid at once (7 searches), and results are cached per route, dates and currency for 20 hours in `fareCache`, shared by every traveler, so a second watch on the same route costs nothing. The price level comes from the grid (25th to 75th percentile). Rarely searched routes may have no fares. When someone taps Book, one live Google Flights check runs through SerpApi (`SERPAPI_API_KEY`), at most `LIVE_FARE_CHECKS_PER_DAY` (default 2) for the whole app, so the 250 free monthly searches are left for booking price watches. Without a Travelpayouts token, everything uses SerpApi as before (`FARE_CHECKS_PER_DAY` default 3).

| Convex env var | |
| --- | --- |
| `TRAVELPAYOUTS_TOKEN` | API token (Travelpayouts dashboard, Profile, API token). Turns on Travelpayouts. |
| `TRAVELPAYOUTS_MARKER` | Your partner ID (marker). Makes Book an affiliate link, so bookings earn commission. |
| `TRAVELPAYOUTS_MARKET` | Optional market for prices, default `us`. |
| `FARE_CHECKS_PER_DAY` | Optional, watches checked per day (default 200 with Travelpayouts, 3 with SerpApi). |
| `LIVE_FARE_CHECKS_PER_DAY` | Optional, live SerpApi checks on Book per day (default 2, 0 turns them off). |

## Sharing and maps

- **Share a trip:** the Share button (web hero, or "Share trip" on mobile) creates a random read-only link at `/share/<token>` on the web app. Anyone with the link can view the trip without signing in, and nobody can edit it through it. "Stop sharing" turns the link off. On mobile, set `EXPO_PUBLIC_WEB_URL` to your deployed web URL so shared links point to it.
- **Day map (web):** "Show map" under each day opens an OpenStreetMap (Leaflet) with numbered pins in visiting order. The public OSM tile server is fine for development; switch to a tile provider before heavy production use.
- **Route for the day:** opens Google Maps walking directions through all of that day's stops, in order (web and mobile).

## Photos and motion

- Photos are free Unsplash URLs (`images.unsplash.com`, no API key). If one fails to load, the app falls back to a seeded picsum.photos image, then to a tinted emoji placeholder (`SmartImage` in both apps).
- Mobile motion uses Reanimated 4: hero parallax and stretch, staggered card entrances, layout transitions on reorder, a check "pop", and press-scale on buttons (`apps/mobile/src/lib/motion.ts`).
- Web motion uses Motion (`motion/react`): staggered entrances, a Ken Burns hero, layout animations when activities move (also across days), a sliding day-tab pill, an animated progress bar, and an animated AI "planning" state (`apps/web/lib/motion.ts`).
- Both respect the OS "reduce motion" setting.

## Notes

- **Versions.** Everything is on the latest release except where a tool requires otherwise. The Expo app pins React 19.3.0, React Native 0.88 and TypeScript 6 to SDK 58's versions. The web app uses TypeScript 6 because typescript-eslint doesn't support TypeScript 7 yet. The backend and shared packages use TypeScript 7.
- **Uniwind.** `className` works on every React Native core component. Third-party components need `withUniwind` (see `components/image.tsx`). Theme tokens such as `bg-primary` and `text-muted-foreground` follow the system light/dark setting, and the web app defines the same names in `app/globals.css`.
- **Ordering.** `order` is always 0..n-1 within a day. `activities.move` renumbers both days when an item changes day, and both apps apply the same optimistic update, so drags and checkbox taps feel instant.
