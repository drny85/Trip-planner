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
