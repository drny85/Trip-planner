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

# 2. Point the apps at it (use the CONVEX_URL from packages/backend/.env.local)
cp apps/web/.env.example apps/web/.env.local          # set NEXT_PUBLIC_CONVEX_URL
cp apps/mobile/.env.example apps/mobile/.env.local    # set EXPO_PUBLIC_CONVEX_URL

# 3. Everything at once (backend + web on :3000 + Expo)
pnpm dev
```

Open the web app or the Expo app and choose **Load demo trip** to explore with fake data. You don't need any other keys for that.

### Turn on AI generation

```bash
cd packages/backend
npx convex env set ANTHROPIC_API_KEY sk-ant-...
```

`ai.generateTrip` uses `claude-opus-5-5` with a Zod schema as structured output. It also turns on the API's server-side refusal fallback (`fallbacks: "default"`), so a declined request is retried on a fallback model automatically. Remove those two lines in `convex/ai.ts` if you don't want that. The model returns no photos, so activities get placeholder images from picsum.photos until a places/photos API is added.

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

## Notes

- **Versions.** Everything is on the latest release except where a tool requires otherwise. The Expo app pins React 19.3.0, React Native 0.88 and TypeScript 6 to SDK 58's versions. The web app uses TypeScript 6 because typescript-eslint doesn't support TypeScript 7 yet. The backend and shared packages use TypeScript 7.
- **Uniwind.** `className` works on every React Native core component. Third-party components need `withUniwind` (see `components/image.tsx`). Theme tokens such as `bg-primary` and `text-muted-foreground` follow the system light/dark setting, and the web app defines the same names in `app/globals.css`.
- **Ordering.** `order` is always 0..n-1 within a day. `activities.move` renumbers both days when an item changes day, and both apps apply the same optimistic update, so drags and checkbox taps feel instant.
