# Trip Planner

AI-powered trip planning and itinerary manager. It's a pnpm + Turborepo monorepo with a Next.js web app, an Expo mobile app and a Convex backend.

## Layout

```
trip-planner/
├── apps/
│   ├── web/                  Next.js App Router + Tailwind v4        (step 3)
│   └── mobile/               Expo + Expo Router + Uniwind            (step 2)
├── packages/
│   ├── backend/              Convex functions, schema, AI actions
│   │   └── convex/
│   │       ├── schema.ts         users, trips, subTrips, activities
│   │       ├── trips.ts          list / get (nested tree) / update / remove
│   │       ├── activities.ts     setCompleted / update / create / move / remove
│   │       ├── seed.ts           demoTrip: loads the fake Tokyo trip
│   │       ├── trips.test.ts     convex-test suite
│   │       └── lib/
│   │           ├── validators.ts     shared Convex validators (trip tree shape)
│   │           ├── insertTripTree.ts writes a whole tree; reused by AI in step 4
│   │           ├── fakeData.ts       "Tokyo Adventure" dummy trip
│   │           ├── auth.ts           getUserId + ownership checks (demo-user fallback)
│   │           └── types.ts          TripDetails etc. for the apps
│   └── ui/                   Shared helpers: cn(), date formatting, tel:/maps links
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Getting started

```bash
pnpm install
pnpm dev:backend          # first run: `npx convex dev` asks you to log in and creates a dev deployment
pnpm --filter @trip/backend seed   # inserts the fake "Tokyo Adventure" trip
pnpm typecheck
pnpm test
```

Until Clerk is wired up in step 3, every request runs as `demo-user` (see `convex/lib/auth.ts`), so you don't need any keys yet.

## Data model

- **trips** have `userId` (the Clerk subject), `title`, `destination`, `startDate`/`endDate` (ISO `YYYY-MM-DD`), `imageUrl`, `isAIGenerated` and an optional `prompt`.
- **subTrips** are a day or a leg. They have `tripId`, `title`, `dayNumber`, `date`, `location` and `order`.
- **activities** have `subTripId`, `tripId` (denormalized), `title`, `description`, `address`, `phone?`, `photoUrl`, `bookingUrl?`, `websiteUrl?`, `category?`, `startTime?`, `durationMinutes?`, `latitude?`/`longitude?`, `estimatedCost?`, `isCompleted`, `completedAt?` and `order`.

`order` is always 0..n-1 within a day. `activities.move` renumbers both days when an item moves between them.
